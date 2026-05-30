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


async def resolve_local(query: str, session: AsyncSession) -> GeocodingResult | None:
    q = normalize(query)
    if not q:
        return None

    # Exact normalized match wins instantly; prefer cities over villages on ties.
    exact = await session.execute(
        text(
            """
            SELECT lat, lon
            FROM settlements
            WHERE name_normalized = :q
            ORDER BY (type='city') DESC, (type='town') DESC, name
            LIMIT 1
            """
        ),
        {"q": q},
    )
    row = exact.first()
    if row is not None:
        return GeocodingResult(lat=row.lat, lon=row.lon, source="local", confidence="high")

    # Fuzzy fallback via pg_trgm — needs at least LOCAL_SIM_MIN to count.
    # The trgm `%` operator uses the GIN index. asyncpg uses numeric ($n)
    # paramstyle, so `%` doesn't need doubling in text().
    fuzzy = await session.execute(
        text(
            """
            SELECT lat, lon, similarity(name_normalized, :q) AS sim
            FROM settlements
            WHERE name_normalized % :q
              AND similarity(name_normalized, :q) >= :sim_min
            ORDER BY (type='city') DESC, sim DESC
            LIMIT 1
            """
        ),
        {"q": q, "sim_min": LOCAL_SIM_MIN},
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
OBLAST_FALLBACK: list[tuple[tuple[str, ...], float, float]] = [
    (("вінниччин", "вінницьк"), 48.9785, 28.5489),
    (("волинщин", "волинськ", "волинь", "волині"), 51.1381, 24.9369),
    (("дніпропетровщин", "дніпропетровськ"), 48.2969, 35.1864),
    (("донеччин", "донецьк"), 48.0628, 37.8485),
    (("житомирщин", "житомирськ"), 50.6430, 28.3635),
    (("закарпатт", "закарпатськ"), 48.4978, 23.0282),
    (("запоріжж", "запорізьк"), 47.0953, 35.7598),
    (("іванофранківщин", "іванофранківськ", "прикарпатт"), 48.6384, 24.6766),
    (("київщин", "київська обл", "київської обл"), 50.3541, 31.4077),
    (("кіровоградщин", "кіровоградськ"), 48.4860, 31.8346),
    (("луганщин", "луганськ"), 48.9520, 38.9068),
    (("львівщин", "львівськ"), 49.6925, 23.8913),
    (("миколаївщин", "миколаївськ"), 47.4087, 31.9646),
    (("одещин", "одеськ"), 46.7309, 30.5821),
    (("полтавщин", "полтавськ"), 49.6238, 34.1095),
    (("рівненщин", "рівненськ"), 50.9849, 26.6484),
    (("сумщин", "сумськ"), 51.2294, 33.8669),
    (("тернопільщин", "тернопільськ"), 49.3925, 25.4907),
    (("харківщин", "харківськ"), 49.4868, 36.6841),
    (("херсонщин", "херсонськ"), 46.7394, 33.4823),
    (("хмельниччин", "хмельницьк"), 49.5209, 26.9424),
    (("черкащин", "черкаськ"), 49.3370, 31.6360),
    (("буковин", "чернівеччин", "чернівецьк"), 48.2011, 25.7734),
    (("чернігівщин", "чернігівськ"), 51.3504, 31.8618),
]


def resolve_oblast_fallback(query: str) -> GeocodingResult | None:
    q = normalize(query)
    if not q:
        return None
    for stems, lat, lon in OBLAST_FALLBACK:
        if any(st in q for st in stems):
            return GeocodingResult(lat=lat, lon=lon, source="local", confidence="low")
    return None


# ---------- Top-level resolver with caching ----------

async def resolve(
    query: str,
    session: AsyncSession,
    *,
    client: httpx.AsyncClient | None = None,
    skip_nominatim: bool = False,
) -> GeocodingResult:
    """Resolve `query` to coordinates, escalating L1 → L2 and caching the verdict."""
    # Cache hit
    cached = await session.execute(
        select(GeocodeCache).where(GeocodeCache.query == query)
    )
    c = cached.scalar_one_or_none()
    if c is not None:
        if c.lat is not None:
            return GeocodingResult(lat=c.lat, lon=c.lon, source=c.source, confidence=c.confidence)
        # Cached negative — retry the oblast fallback before honoring the miss
        # (covers directional phrases poisoned into the cache earlier).
        ob = resolve_oblast_fallback(query)
        if ob is not None:
            return ob
        return GeocodingResult(lat=c.lat, lon=c.lon, source=c.source, confidence=c.confidence)

    # L1 — settlements
    result = await resolve_local(query, session)
    # Oblast-level fallback — prefer the oblast centroid over a fuzzy remote guess.
    if result is None or not result.found:
        ob = resolve_oblast_fallback(query)
        if ob is not None:
            result = ob
    if result is None or not result.found:
        # L2 (unless explicitly disabled — useful for unit tests)
        if not skip_nominatim:
            l2 = await resolve_nominatim(query, client)
            if l2 is not None and l2.found:
                result = l2
        if result is None or not result.found:
            result = GeocodingResult(lat=None, lon=None, source="none", confidence="none")

    # Persist verdict (positive or negative).
    await session.execute(
        pg_insert(GeocodeCache)
        .values(
            query=query,
            lat=result.lat,
            lon=result.lon,
            source=result.source,
            confidence=result.confidence,
        )
        .on_conflict_do_nothing(index_elements=["query"])
    )
    await session.commit()
    return result
