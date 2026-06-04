"""ukrainealarm.com (api.ukrainealarm.com v3) ⇄ alerts.in.ua crosswalk + fetch helpers.

The whole deshahed alert pipeline is keyed on alerts.in.ua's scheme:
`location_uid` / `location_oblast_uid` (ints) plus `alert_type`
(air_raid / artillery_shelling / ...). ukrainealarm uses its own *string*
`regionId` and an `AlertType` enum (AIR / ARTILLERY / ...). This module maps a
ukrainealarm oblast-level event into an alerts.in.ua-shaped dict, so the merge
engine, the WS layer and the frontend need no other changes.

Scope is oblast-level only (27 regions: 24 oblasts + м. Київ + м. Севастополь +
АР Крим). Sub-oblast granularity (raion / hromada / city) stays on the
alerts.in.ua poller.

`OBLAST_UID_BY_NAME` carries the *real* alerts.in.ua oblast uids — the published
values, verified against live data (Луганська=16, АР Крим=29). The frontend
paints an oblast by matching an alert's `location_oblast` against
oblasts.geojson `full_name_uk`, so the `full_name_uk` strings below MUST equal
those names exactly, and the uids MUST equal alerts.in.ua's so a webhook-sourced
alert and the poller's own entry for the same oblast collapse to one
`(location_uid, alert_type)` key.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import httpx

log = logging.getLogger("ua_crosswalk")

UA_BASE = "https://api.ukrainealarm.com/api/v3"
HTTP_TIMEOUT_SEC = 8.0

# (alerts.in.ua location_uid, full_name_uk, location_type)
# full_name_uk MUST match apps/web/public/geo/oblasts.geojson `full_name_uk`.
_OBLASTS: list[tuple[int, str, str]] = [
    (3, "Хмельницька область", "oblast"),
    (4, "Вінницька область", "oblast"),
    (5, "Рівненська область", "oblast"),
    (8, "Волинська область", "oblast"),
    (9, "Дніпропетровська область", "oblast"),
    (10, "Житомирська область", "oblast"),
    (11, "Закарпатська область", "oblast"),
    (12, "Запорізька область", "oblast"),
    (13, "Івано-Франківська область", "oblast"),
    (14, "Київська область", "oblast"),
    (15, "Кіровоградська область", "oblast"),
    (16, "Луганська область", "oblast"),
    (17, "Миколаївська область", "oblast"),
    (18, "Одеська область", "oblast"),
    (19, "Полтавська область", "oblast"),
    (20, "Сумська область", "oblast"),
    (21, "Тернопільська область", "oblast"),
    (22, "Харківська область", "oblast"),
    (23, "Херсонська область", "oblast"),
    (24, "Черкаська область", "oblast"),
    (25, "Чернігівська область", "oblast"),
    (26, "Чернівецька область", "oblast"),
    (27, "Львівська область", "oblast"),
    (28, "Донецька область", "oblast"),
    (29, "Автономна Республіка Крим", "autonomous_republic"),
    (30, "м. Севастополь", "city"),
    (31, "м. Київ", "city"),
]

# full_name_uk → (uid, location_type)
OBLAST_BY_NAME: dict[str, tuple[int, str]] = {
    name: (uid, ltype) for uid, name, ltype in _OBLASTS
}

# ukrainealarm AlertType → alerts.in.ua alert_type (matches schemas.alerts.AlertType).
ALERT_TYPE_MAP: dict[str, str] = {
    "AIR": "air_raid",
    "ARTILLERY": "artillery_shelling",
    "URBAN_FIGHTS": "urban_fights",
    "CHEMICAL": "chemical",
    "NUCLEAR": "nuclear",
    "INFO": "unknown",
    "UNKNOWN": "unknown",
}


def map_alert_type(ua_type: str | None) -> str:
    if not ua_type:
        return "unknown"
    return ALERT_TYPE_MAP.get(str(ua_type).strip().upper(), "unknown")


def _stem(name: str) -> str:
    """Normalize a region name to a comparison stem.

    Drops the "область"/"обл." suffix and the "м. " city prefix, lowercases,
    and collapses whitespace, so "Харківська область" / "Харківська обл." both
    reduce to "харківська" and "м. Київ" / "Київ (місто)" reduce to "київ".
    """
    s = (name or "").strip().lower().replace("’", "'").replace("ʼ", "'")
    for token in (" область", " обл.", " обл", " (місто)"):
        s = s.replace(token, "")
    s = s.replace("м.", "").replace("місто", "")
    return " ".join(s.split())


# Stem → canonical full_name_uk. Built from the oblast table, plus explicit
# aliases for the three non-oblast regions and the Kyiv city/oblast clash.
_STEM_TO_FULL: dict[str, str] = {}
for _uid, _full, _ltype in _OBLASTS:
    if _ltype == "oblast":
        _STEM_TO_FULL[_stem(_full)] = _full  # "харківська" → "Харківська область"

_ALIASES: dict[str, str] = {
    "крим": "Автономна Республіка Крим",
    "ар крим": "Автономна Республіка Крим",
    "автономна республіка крим": "Автономна Республіка Крим",
    "республіка крим": "Автономна Республіка Крим",
    "crimea": "Автономна Республіка Крим",
    "севастополь": "м. Севастополь",
    "sevastopol": "м. Севастополь",
    "київ": "м. Київ",
    "kyiv": "м. Київ",
    "kiev": "м. Київ",
    "київська": "Київська область",
}
_STEM_TO_FULL.update(_ALIASES)


def canonical_full_name(region_name: str | None, region_type: str | None = None) -> str | None:
    """Resolve a ukrainealarm region name to one of our 27 canonical names.

    `region_type` only disambiguates Kyiv: ukrainealarm exposes both the city
    (м. Київ) and the oblast (Київська область). A bare "Київ" → city; the
    oblast carries "область" in its name so `_stem` already separates them.
    """
    if not region_name:
        return None
    stem = _stem(region_name)
    if stem == "київ" and region_type and "oblast" in str(region_type).lower():
        return "Київська область"
    return _STEM_TO_FULL.get(stem)


def build_crosswalk(regions: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """ukrainealarm `GET /regions` payload → {regionId: oblast entry}.

    Only top-level regions that resolve to one of our 27 oblast names are kept;
    sub-regions (region_child_ids) are intentionally ignored — sub-oblast
    granularity stays on the alerts.in.ua poller.
    """
    out: dict[str, dict[str, Any]] = {}
    unmatched: list[str] = []
    for r in regions:
        region_id = r.get("regionId") or r.get("region_id")
        name = r.get("regionName") or r.get("region_name")
        rtype = r.get("regionType") or r.get("region_type")
        if region_id is None:
            continue
        full = canonical_full_name(name, rtype)
        if full is None:
            unmatched.append(f"{region_id}:{name}")
            continue
        uid, ltype = OBLAST_BY_NAME[full]
        out[str(region_id)] = {
            "location_uid": uid,
            "location_title": full,
            "location_type": ltype,
            "location_oblast": full,
            "location_oblast_uid": uid,
        }
    if unmatched:
        log.info("ua crosswalk: %d region(s) unmatched (expected sub-regions): %s",
                 len(unmatched), ", ".join(unmatched[:8]))
    log.info("ua crosswalk: matched %d oblast-level regions", len(out))
    return out


def _headers(token: str) -> dict[str, str]:
    # ukrainealarm uses a raw `Authorization: <token>` header (NOT Bearer).
    return {"Authorization": token}


async def fetch_regions(client: httpx.AsyncClient, token: str) -> list[dict[str, Any]]:
    resp = await client.get(f"{UA_BASE}/regions", headers=_headers(token), timeout=HTTP_TIMEOUT_SEC)
    resp.raise_for_status()
    body = resp.json()
    # /regions returns either a bare list or {"states": [...]} depending on version.
    if isinstance(body, dict):
        return body.get("states") or body.get("regions") or []
    return body if isinstance(body, list) else []


async def fetch_alerts(client: httpx.AsyncClient, token: str) -> list[dict[str, Any]]:
    """GET /alerts → list of AlertRegionModel (regions with ≥1 active alert)."""
    resp = await client.get(f"{UA_BASE}/alerts", headers=_headers(token), timeout=HTTP_TIMEOUT_SEC)
    resp.raise_for_status()
    body = resp.json()
    return body if isinstance(body, list) else (body.get("alerts") or [])


async def fetch_status(client: httpx.AsyncClient, token: str) -> str | None:
    """GET /alerts/status → opaque change marker (lastActionIndex).

    Returned as a string so the caller only has to compare for equality to
    decide whether a full /alerts refetch is warranted.
    """
    resp = await client.get(f"{UA_BASE}/alerts/status", headers=_headers(token), timeout=HTTP_TIMEOUT_SEC)
    resp.raise_for_status()
    body = resp.json()
    if isinstance(body, dict):
        for k in ("lastActionIndex", "actionIndex", "version", "id"):
            if k in body and body[k] is not None:
                return str(body[k])
        return str(body)
    return str(body)


def _redact(url: str) -> str:
    """Hide the ?secret=... query value in logs."""
    if "secret=" not in url:
        return url
    head, _, _tail = url.partition("secret=")
    return f"{head}secret=***"


async def subscribe_webhook(client: httpx.AsyncClient, token: str, url: str) -> bool:
    """Register our callback URL with ukrainealarm (POST, fall back to PATCH).

    Returns True on success. Never raises — a failed subscription only means we
    fall back to the slow safety-poll, which still keeps state correct.
    """
    payload = {"webHookUrl": url}
    try:
        r = await client.post(
            f"{UA_BASE}/webhook", headers=_headers(token), json=payload, timeout=HTTP_TIMEOUT_SEC
        )
        if r.status_code < 300:
            log.info("ua webhook subscribed: %s", _redact(url))
            return True
        # Already subscribed for this token → update the URL instead.
        if r.status_code in (400, 409, 422):
            r2 = await client.patch(
                f"{UA_BASE}/webhook", headers=_headers(token), json=payload, timeout=HTTP_TIMEOUT_SEC
            )
            if r2.status_code < 300:
                log.info("ua webhook updated (patch): %s", _redact(url))
                return True
            log.warning("ua webhook subscribe failed: POST %s, PATCH %s", r.status_code, r2.status_code)
            return False
        log.warning("ua webhook subscribe failed: POST %s %s", r.status_code, r.text[:200])
        return False
    except Exception:
        log.exception("ua webhook subscribe errored")
        return False


async def unsubscribe_webhook(client: httpx.AsyncClient, token: str, url: str) -> None:
    """Best-effort DELETE of our callback subscription on shutdown."""
    try:
        await client.request(
            "DELETE",
            f"{UA_BASE}/webhook",
            headers=_headers(token),
            json={"webHookUrl": url},
            timeout=HTTP_TIMEOUT_SEC,
        )
        log.info("ua webhook unsubscribed: %s", _redact(url))
    except Exception:
        log.exception("ua webhook unsubscribe failed")


def normalize_alerts(
    regions_alerts: list[dict[str, Any]],
    crosswalk: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """ukrainealarm /alerts payload → alerts.in.ua-shaped oblast alerts.

    Output entries are byte-compatible with alerts_poller._normalize so they
    drop straight into the merged snapshot, the WS stream and alert_events.
    Deduped by (location_uid, alert_type) — one oblast can list the same alert
    type once.
    """
    seen: set[tuple[int, str]] = set()
    out: list[dict[str, Any]] = []
    for region in regions_alerts:
        region_id = region.get("regionId") or region.get("region_id")
        entry = crosswalk.get(str(region_id)) if region_id is not None else None
        if entry is None:
            continue  # sub-region or unknown — owned by the alerts.in.ua poller
        active = region.get("activeAlerts") or region.get("active_alerts") or []
        region_last = region.get("lastUpdate") or region.get("last_update")
        for a in active:
            alert_type = map_alert_type(a.get("type") or a.get("alertType"))
            key = (entry["location_uid"], alert_type)
            if key in seen:
                continue
            seen.add(key)
            started = (
                a.get("lastUpdate") or a.get("last_update") or region_last
                or datetime.now(timezone.utc).isoformat()
            )
            out.append({
                "location_uid": entry["location_uid"],
                "location_title": entry["location_title"],
                "location_type": entry["location_type"],
                "alert_type": alert_type,
                "started_at": started,
                "finished_at": None,
                "location_oblast": entry["location_oblast"],
                "location_oblast_uid": entry["location_oblast_uid"],
                "notes": None,
            })
    return out
