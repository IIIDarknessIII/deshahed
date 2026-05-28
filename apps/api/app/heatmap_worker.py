"""Heatmap recomputer — bucket every drone event into an H3 resolution-6 cell
and store the per-(period, event_type) weight in heatmap_cache.

Resolution 6 ≈ 36 km² per hex — coarse enough to keep map render snappy at
country scale, fine enough to surface obvious corridors.

ТЗ section 4.1: rebuild once an hour from the api process (a separate
worker would be overkill at this data volume).
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Literal

import h3
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session_factory

log = logging.getLogger("uvicorn.error").getChild("heatmap")

H3_RES = 6

Period = Literal["day", "week", "month"]
PERIOD_DAYS: dict[str, int] = {"day": 1, "week": 7, "month": 30}

# event_type filter values; "all" means "any event_type".
EVENT_TYPES: tuple[str, ...] = ("all", "shahed", "missile", "kab", "aviation")
PERIODS: tuple[str, ...] = ("day", "week", "month")

# Recompute cadence
INTERVAL_SEC = 3600


_POINTS_SQL = text(
    """
    SELECT ST_Y(location_point::geometry) AS lat,
           ST_X(location_point::geometry) AS lon
    FROM drone_events
    WHERE detected_at > :since
      AND (:event_type = 'all' OR event_type = :event_type)
    """
)

_DELETE_BUCKET_SQL = text(
    "DELETE FROM heatmap_cache WHERE period = :period AND event_type = :event_type"
)


async def _recompute_bucket(session: AsyncSession, period: str, event_type: str) -> int:
    days = PERIOD_DAYS[period]
    since = datetime.now(timezone.utc) - timedelta(days=days)

    rows = (await session.execute(
        _POINTS_SQL, {"since": since, "event_type": event_type}
    )).all()

    counts: dict[str, int] = {}
    for r in rows:
        cell = h3.latlng_to_cell(float(r.lat), float(r.lon), H3_RES)
        counts[cell] = counts.get(cell, 0) + 1

    # Atomic replace for this bucket so partial recomputes never leak old data.
    await session.execute(_DELETE_BUCKET_SQL, {"period": period, "event_type": event_type})
    if counts:
        now = datetime.now(timezone.utc)
        params = [
            {"h3_index": h, "period": period, "event_type": event_type, "weight": w, "computed_at": now}
            for h, w in counts.items()
        ]
        await session.execute(
            text(
                """
                INSERT INTO heatmap_cache (h3_index, period, event_type, weight, computed_at)
                VALUES (:h3_index, :period, :event_type, :weight, :computed_at)
                """
            ),
            params,
        )
    await session.commit()
    return len(counts)


async def recompute_all() -> dict[tuple[str, str], int]:
    factory = get_session_factory()
    stats: dict[tuple[str, str], int] = {}
    async with factory() as session:
        for period in PERIODS:
            for event_type in EVENT_TYPES:
                stats[(period, event_type)] = await _recompute_bucket(session, period, event_type)
    return stats


STARTUP_DELAY_SEC = 30


async def loop(stop: asyncio.Event) -> None:
    """Background coroutine — started from the api lifespan.

    Sleeps STARTUP_DELAY_SEC first so manual migrations have time to create
    `heatmap_cache` before the loop's first DELETE/INSERT — otherwise the
    very first iteration crashes with UndefinedTableError on a fresh deploy.
    """
    try:
        await asyncio.wait_for(stop.wait(), timeout=STARTUP_DELAY_SEC)
        return  # shutdown signaled during the warmup
    except asyncio.TimeoutError:
        pass

    while not stop.is_set():
        try:
            stats = await recompute_all()
            total = sum(stats.values())
            log.info("heatmap recompute done; %d cell-buckets across all (period, event_type)", total)
        except Exception:
            log.exception("heatmap recompute failed")
        try:
            await asyncio.wait_for(stop.wait(), timeout=INTERVAL_SEC)
        except asyncio.TimeoutError:
            continue
