"""IoT-shaped alert status endpoints — mirror alerts.in.ua's `/iot/*` API.

Two endpoints from upstream that hardware devices (ESP32, etc.) typically poll:

  - GET /api/v1/iot/active_air_raid_alerts_by_oblast
      One char per oblast in fixed order ("A" active, "P" partial, "N" none).
      Example body: "ANNPAPNANNPNANNPPNNANPNNNNA"

  - GET /api/v1/iot/active_air_raid_alerts/{location_uid}
      Single char for one location.

Both are upstream-proxied so the contract matches alerts.in.ua's docs.
Cached in Redis for 3 seconds — alerts.in.ua's own data refreshes every
~5s, so 3s adds at most one tick of staleness while protecting us from
client storms and exhausting the upstream rate limit.
"""
from __future__ import annotations

import os
from typing import Final

import httpx
from fastapi import APIRouter, HTTPException, Response

from app.db import get_redis

router = APIRouter(prefix="/api/v1/iot", tags=["iot"])

UPSTREAM: Final = "https://api.alerts.in.ua/v1/iot"
CACHE_TTL_SEC: Final = 3
TIMEOUT_SEC: Final = 3.0


def _token() -> str:
    tok = os.environ.get("ALERTS_API_TOKEN", "").strip()
    if not tok:
        raise HTTPException(status_code=503, detail="alerts.in.ua token not configured")
    return tok


async def _fetch_cached(path: str, cache_key: str) -> str:
    redis = get_redis()
    cached = await redis.get(cache_key)
    if cached:
        return cached.decode() if isinstance(cached, bytes) else cached
    async with httpx.AsyncClient(timeout=TIMEOUT_SEC) as client:
        resp = await client.get(
            f"{UPSTREAM}/{path}",
            headers={"Authorization": f"Bearer {_token()}"},
        )
        if resp.status_code == 404:
            raise HTTPException(status_code=404, detail="upstream: not found")
        resp.raise_for_status()
        # Upstream returns a JSON-quoted string, e.g. `"ANNPAP..."`.
        text = resp.text.strip().strip('"')
    await redis.set(cache_key, text, ex=CACHE_TTL_SEC)
    return text


@router.get(
    "/active_air_raid_alerts_by_oblast",
    response_class=Response,
    responses={200: {"content": {"text/plain": {"schema": {"type": "string", "example": "ANNPAPNANNPNANNPPNNANPNNNNA"}}}}},
)
async def by_oblast() -> Response:
    """27-char string of per-oblast air-raid status (A/P/N)."""
    body = await _fetch_cached("active_air_raid_alerts_by_oblast.json", "iot:by_oblast")
    return Response(content=body, media_type="text/plain")


@router.get(
    "/active_air_raid_alerts/{location_uid}",
    response_class=Response,
    responses={200: {"content": {"text/plain": {"schema": {"type": "string", "example": "N"}}}}},
)
async def single(location_uid: int) -> Response:
    """Single-char air-raid status for one location_uid."""
    if location_uid <= 0:
        raise HTTPException(status_code=422, detail="location_uid must be positive")
    body = await _fetch_cached(
        f"active_air_raid_alerts/{location_uid}.json",
        f"iot:single:{location_uid}",
    )
    return Response(content=body, media_type="text/plain")
