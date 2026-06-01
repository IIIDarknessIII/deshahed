"""Three-tier geocoder for free-form Ukrainian place names from OSINT messages.

The pipeline tries the cheapest path first and only escalates on miss:

  L1 — settlements table (pg_trgm fuzzy match)        ← microseconds, ~28k rows
  L2 — Nominatim (OpenStreetMap) over HTTPS            ← ~500ms, rate-limited 1 req/s
  L3 — LLM fallback                                    ← seconds + $$ per call
       (stub for now; wired up alongside the OpenRouter extractor in the next chunk)

All resolutions are cached in `geocode_cache` keyed by the literal query so
identical strings later are O(1) — including negative results (lat/lon NULL,
source="none") so we don't pound Nominatim for the same unknown name.

Per the TZ: at least 80 % of distinct location strings should be resolved via
L1 or L2; only the long tail of obscure spellings should reach L3.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
from dataclasses import dataclass
from typing import Literal

import httpx
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GeocodeCache

log = logging.getLogger(__name__)

Source = Literal["local", "nominatim", "llm", "none"]
Confidence = Literal["high", "medium", "low", "none"]


@dataclass(frozen=True)
class GeocodingResult:
    lat: float | None
    lon: float | None
    source: Source
    confidence: Confidence

    @property
    def found(self) -> bool:
        return self.lat is not None and self.lon is not None


_NORMALIZE_STRIP_RE = re.compile(r"['’ʼʻʽ'`\-\.]+")
_NORMALIZE_WS_RE = re.compile(r"\s+")


def normalize(name: str) -> str:
    """Mirror of `seed_settlements.normalize` — keep both in sync."""
    n = name.lower()
    n = _NORMALIZE_STRIP_RE.sub("", n)
    n = _NORMALIZE_WS_RE.sub(" ", n).strip()
    return n


# ---------- L1: local settlements ----------

LOCAL_SIM_HIGH = 0.9
LOCAL_SIM_MEDIUM = 0.7
LOCAL_SIM_MIN = 0.5


async def resolve_local(
    query: str, session: AsyncSession, *, oblast: str | None = None
) -> GeocodingResult | None:
    q = normalize(query)
    if not q:
        return None

    # When the report named an oblast, restrict matching to it so identically
    # named settlements in other regions can't win (e.g. "Борова" in Kyiv obl.
    # vs the Kharkiv-obl. one the message actually meant). On an in-oblast miss
    # we return None, letting the caller fall back to that oblast's centroid.
    oblast_clause = "AND oblast = :oblast" if oblast else ""
    params: dict[str, object] = {"q": q}
    if oblast:
        params["oblast"] = oblast

    # Exact normalized match wins instantly; prefer cities over villages on ties.
    exact = await session.execute(
        text(
            f"""
            SELECT lat, lon
            FROM settlements
            WHERE name_normalized = :q {oblast_clause}
            ORDER BY (type='city') DESC, (type='town') DESC, name
            LIMIT 1
            """
        ),
        params,
    )
    row = exact.first()
    if row is not None:
        return GeocodingResult(lat=row.lat, lon=row.lon, source="local", confidence="high")

    # Fuzzy fallback via pg_trgm — needs at least LOCAL_SIM_MIN to count.
    # The trgm `%` operator uses the GIN index. asyncpg uses numeric ($n)
    # paramstyle, so `%` doesn't need doubling in text().
    fuzzy = await session.execute(
        text(
            f"""
            SELECT lat, lon, similarity(name_normalized, :q) AS sim
            FROM settlements
            WHERE name_normalized % :q {oblast_clause}
              AND similarity(name_normalized, :q) >= :sim_min
            ORDER BY (type='city') DESC, sim DESC
            LIMIT 1
            """
        ),
        {**params, "sim_min": LOCAL_SIM_MIN},
    )
    f = fuzzy.first()
    if f is None:
        return None
    if f.sim >= LOCAL_SIM_HIGH:
        conf: Confidence = "high"
    elif f.sim >= LOCAL_SIM_MEDIUM:
        conf = "medium"
    else:
        conf = "low"
    return GeocodingResult(lat=f.lat, lon=f.lon, source="local", confidence=conf)


# ---------- L2: Nominatim (OSM) ----------

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_USER_AGENT = "deshahed.online/0.1 (osint air-raid map)"

_nominatim_lock = asyncio.Lock()
_last_nominatim_at: float = 0.0


async def _nominatim_throttle() -> None:
    global _last_nominatim_at
    async with _nominatim_lock:
        gap = time.monotonic() - _last_nominatim_at
        if gap < 1.0:
            await asyncio.sleep(1.0 - gap)
        _last_nominatim_at = time.monotonic()


async def resolve_nominatim(
    query: str, client: httpx.AsyncClient | None = None
) -> GeocodingResult | None:
    await _nominatim_throttle()

    owns = client is None
    if client is None:
        client = httpx.AsyncClient(
            headers={"User-Agent": NOMINATIM_USER_AGENT},
            timeout=10.0,
        )
    try:
        resp = await client.get(
            NOMINATIM_URL,
            params={
                "q": f"{query}, Ukraine",
                "format": "json",
                "limit": "1",
                "accept-language": "uk",
                "countrycodes": "ua",
            },
        )
        if resp.status_code != 200:
            log.warning("nominatim HTTP %s for %r", resp.status_code, query)
            return None
        data = resp.json()
        if not data:
            return None
        item = data[0]
        return GeocodingResult(
            lat=float(item["lat"]),
            lon=float(item["lon"]),
            source="nominatim",
            # Nominatim has no built-in confidence; treat as medium by default.
            confidence="medium",
        )
    except Exception:
        log.exception("nominatim call failed for %r", query)
        return None
    finally:
        if owns:
            await client.aclose()


# ---------- Oblast-level fallback ----------

# Directional / colloquial phrases that name an oblast but no settlement
# ("схід Дніпропетровщини", "межі Харківщини і Сумщини", "північ Полтавщини")
# resolve to that oblast's centroid with low confidence, so the threat still
# appears on the map (approximately) instead of being dropped. Stems are
# already normalize()'d (lowercased, hyphens/apostrophes stripped) so they can
# be substring-matched against a normalized query.
# Each entry: (matching stems, centroid lat, centroid lon, canonical oblast name
# exactly as stored in settlements.oblast). The "-ськ"/"-цьк" stems also match the
# "<Name>ська обл." qualifier the channels append, so the same table drives both
# the centroid fallback and oblast-hint detection (detect_oblast).
OBLAST_FALLBACK: list[tuple[tuple[str, ...], float, float, str]] = [
    (("вінниччин", "вінницьк"), 48.9785, 28.5489, "Вінницька область"),
    (("волинщин", "волинськ", "волинь", "волині"), 51.1381, 24.9369, "Волинська область"),
    (("дніпропетровщин", "дніпропетровськ"), 48.2969, 35.1864, "Дніпропетровська область"),
    (("донеччин", "донецьк"), 48.0628, 37.8485, "Донецька область"),
    (("житомирщин", "житомирськ"), 50.6430, 28.3635, "Житомирська область"),
    (("закарпатт", "закарпатськ"), 48.4978, 23.0282, "Закарпатська область"),
    (("запоріжж", "запорізьк"), 47.0953, 35.7598, "Запорізька область"),
    (("іванофранківщин", "іванофранківськ", "прикарпатт"), 48.6384, 24.6766, "Івано-Франківська область"),
    (("київщин", "київська обл", "київської обл"), 50.3541, 31.4077, "Київська область"),
    (("кіровоградщин", "кіровоградськ"), 48.4860, 31.8346, "Кіровоградська область"),
    (("луганщин", "луганськ"), 48.9520, 38.9068, "Луганська область"),
    (("львівщин", "львівськ"), 49.6925, 23.8913, "Львівська область"),
    (("миколаївщин", "миколаївськ"), 47.4087, 31.9646, "Миколаївська область"),
    (("одещин", "одеськ"), 46.7309, 30.5821, "Одеська область"),
    (("полтавщин", "полтавськ"), 49.6238, 34.1095, "Полтавська область"),
    (("рівненщин", "рівненськ"), 50.9849, 26.6484, "Рівненська область"),
    (("сумщин", "сумськ"), 51.2294, 33.8669, "Сумська область"),
    (("тернопільщин", "тернопільськ"), 49.3925, 25.4907, "Тернопільська область"),
    (("харківщин", "харківськ"), 49.4868, 36.6841, "Харківська область"),
    (("херсонщин", "херсонськ"), 46.7394, 33.4823, "Херсонська область"),
    (("хмельниччин", "хмельницьк"), 49.5209, 26.9424, "Хмельницька область"),
    (("черкащин", "черкаськ"), 49.3370, 31.6360, "Черкаська область"),
    (("буковин", "чернівеччин", "чернівецьк"), 48.2011, 25.7734, "Чернівецька область"),
    (("чернігівщин", "чернігівськ"), 51.3504, 31.8618, "Чернігівська область"),
]


def resolve_oblast_fallback(query: str) -> GeocodingResult | None:
    q = normalize(query)
    if not q:
        return None
    for stems, lat, lon, _name in OBLAST_FALLBACK:
        if any(st in q for st in stems):
            return GeocodingResult(lat=lat, lon=lon, source="local", confidence="low")
    return None


def detect_oblast(value: str | None) -> str | None:
    """Detect an oblast qualifier in free text (e.g. "(Харківська обл.)",
    "Сумщина", "на Полтавщині") and return the canonical `settlements.oblast`
    name, or None. Used to disambiguate same-named settlements across regions.
    """
    if not value:
        return None
    q = normalize(value)
    if not q:
        return None
    for stems, _lat, _lon, name in OBLAST_FALLBACK:
        if any(st in q for st in stems):
            return name
    return None


# ---------- Top-level resolver with caching ----------

async def resolve(
    query: str,
    session: AsyncSession,
    *,
    oblast_hint: str | None = None,
    client: httpx.AsyncClient | None = None,
    skip_nominatim: bool = False,
) -> GeocodingResult:
    """Resolve `query` to coordinates, escalating L1 → L2 and caching the verdict.

    `oblast_hint` (canonical `settlements.oblast` name) restricts the local match
    to that region so same-named settlements elsewhere can't win, and biases the
    Nominatim query + centroid fallback toward it.
    """
    # Cache key folds in the oblast hint so the same name under different oblast
    # contexts is cached independently (and never collides with the hint-less key).
    cache_key = f"{query}@@{oblast_hint}" if oblast_hint else query

    # Cache hit
    cached = await session.execute(
        select(GeocodeCache).where(GeocodeCache.query == cache_key)
    )
    c = cached.scalar_one_or_none()
    if c is not None:
        if c.lat is not None:
            return GeocodingResult(lat=c.lat, lon=c.lon, source=c.source, confidence=c.confidence)
        # Cached negative — retry the oblast fallback before honoring the miss
        # (covers directional phrases poisoned into the cache earlier).
        ob = resolve_oblast_fallback(oblast_hint or query)
        if ob is not None:
            return ob
        return GeocodingResult(lat=c.lat, lon=c.lon, source=c.source, confidence=c.confidence)

    # L1 — settlements (restricted to the hinted oblast when present)
    result = await resolve_local(query, session, oblast=oblast_hint)
    # Oblast-level fallback — prefer the oblast centroid over a fuzzy remote guess.
    # With a hint we go straight to that oblast's centroid; otherwise we scan the
    # query text for a region phrase.
    if result is None or not result.found:
        ob = resolve_oblast_fallback(oblast_hint) if oblast_hint else None
        if ob is None:
            ob = resolve_oblast_fallback(query)
        if ob is not None:
            result = ob
    if result is None or not result.found:
        # L2 (unless explicitly disabled — useful for unit tests)
        if not skip_nominatim:
            nq = f"{query}, {oblast_hint}" if oblast_hint else query
            l2 = await resolve_nominatim(nq, client)
            if l2 is not None and l2.found:
                result = l2
        if result is None or not result.found:
            result = GeocodingResult(lat=None, lon=None, source="none", confidence="none")

    # Persist verdict (positive or negative).
    await session.execute(
        pg_insert(GeocodeCache)
        .values(
            query=cache_key,
            lat=result.lat,
            lon=result.lon,
            source=result.source,
            confidence=result.confidence,
        )
        .on_conflict_do_nothing(index_elements=["query"])
    )
    await session.commit()
    return result
