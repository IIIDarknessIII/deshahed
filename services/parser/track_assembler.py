"""Track assembler — given a freshly persisted drone_events cluster, decide
whether it extends an existing track or starts a new one.

Heuristic (TZ section 3.2):
  Point B joins existing track T if all hold:
    - same event_type
    - 1 min ≤ (B.detected_at − T.last_seen_at) ≤ 15 min
    - distance(T.last_point, B) ≤ time_delta * 250 km/h + 30 km
    - if T has ≥ 2 points: direction cosine(prev→last, last→B) > 0.3
  If > 1 candidate matches, attach to the one with the smallest time delta.
  Otherwise start a new track.

Path geometry is grown via ST_AddPoint on the existing LINESTRING (or
ST_MakeLine when the second point arrives — LINESTRING can't have just one
point). All three position fields are updated atomically with last_seen_at.
"""
from __future__ import annotations

import logging
import math
import uuid
from datetime import datetime, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger("track_assembler")

# Heuristic knobs per TZ
TIME_MIN = timedelta(minutes=1)
TIME_MAX = timedelta(minutes=15)
SPEED_KMH = 250
SLACK_KM = 30
COSINE_THRESHOLD = 0.3
STALE_AFTER = timedelta(minutes=20)

CANDIDATES_SQL = text(
    """
    SELECT id, point_count, last_seen_at,
           ST_Y(last_point::geometry)  AS last_lat,
           ST_X(last_point::geometry)  AS last_lon,
           ST_Y(prev_point::geometry)  AS prev_lat,
           ST_X(prev_point::geometry)  AS prev_lon,
           EXTRACT(EPOCH FROM (:now_ts - last_seen_at)) / 60.0 AS time_delta_min,
           ST_Distance(last_point, ST_MakePoint(:lon, :lat)::geography) / 1000.0 AS dist_km
    FROM drone_tracks
    WHERE is_active = TRUE
      AND event_type = :event_type
      AND last_seen_at >= :since
      AND last_seen_at <= :until
    """
)


def _direction_ok(c: object, lon: float, lat: float) -> bool:
    """Cosine between the track's last segment and the proposed segment.
    Returns True for fresh tracks (no prev_point yet) — direction is unknown,
    so we trust the distance + time gates alone."""
    if c.prev_lat is None or c.prev_lon is None:
        return True
    d_old_x = c.last_lon - c.prev_lon
    d_old_y = c.last_lat - c.prev_lat
    d_new_x = lon - c.last_lon
    d_new_y = lat - c.last_lat
    m_old = math.hypot(d_old_x, d_old_y)
    m_new = math.hypot(d_new_x, d_new_y)
    if m_old < 1e-9 or m_new < 1e-9:
        return True
    cos = (d_old_x * d_new_x + d_old_y * d_new_y) / (m_old * m_new)
    return cos > COSINE_THRESHOLD


async def assemble(
    session: AsyncSession,
    *,
    event_type: str,
    lat: float,
    lon: float,
    detected_at: datetime,
    confidence: str | None = None,
) -> tuple[uuid.UUID, bool]:
    """Attach to an existing active track or create a new one. Returns
    (track_id, is_new). Caller is responsible for `await session.commit()`."""
    rows = (await session.execute(
        CANDIDATES_SQL,
        {
            "event_type": event_type,
            "now_ts": detected_at,
            "since": detected_at - TIME_MAX,
            "until": detected_at - TIME_MIN,
            "lat": lat,
            "lon": lon,
        },
    )).all()

    # Postgres NUMERIC → decimal.Decimal under asyncpg; cast to float.
    valid: list[object] = []
    for c in rows:
        time_delta_min = float(c.time_delta_min)
        dist_km = float(c.dist_km) if c.dist_km is not None else None
        max_dist_km = (time_delta_min / 60.0) * SPEED_KMH + SLACK_KM
        if dist_km is None or dist_km > max_dist_km:
            continue
        if not _direction_ok(c, lon, lat):
            continue
        c = type("Row", (), {**c._asdict(), "time_delta_min": time_delta_min, "dist_km": dist_km})()
        valid.append(c)

    if valid:
        best = min(valid, key=lambda c: c.time_delta_min)
        await _append_point(session, best, lat, lon, detected_at)
        log.info(
            "track: appended point #%d to %s (Δt=%.1fmin, d=%.1fkm)",
            best.point_count + 1, best.id, best.time_delta_min, best.dist_km,
        )
        return best.id, False

    new_id = uuid.uuid4()
    await _create_track(session, new_id, event_type, lat, lon, detected_at, confidence)
    log.info("track: created %s (first point)", new_id)
    return new_id, True


LOAD_TRACK_VIEW_SQL = text(
    """
    SELECT id::text AS id,
           event_type,
           first_seen_at, last_seen_at, point_count, is_active, confidence,
           CASE WHEN path IS NULL THEN NULL
                ELSE ST_AsGeoJSON(path::geometry)::jsonb
           END                                            AS path,
           ST_Y(last_point::geometry)                     AS last_lat,
           ST_X(last_point::geometry)                     AS last_lon
    FROM drone_tracks
    WHERE id = :id
    """
)


async def load_track_view(session: AsyncSession, track_id: uuid.UUID) -> dict | None:
    """Read a single track in TrackView shape (json-ready dict)."""
    row = (await session.execute(LOAD_TRACK_VIEW_SQL, {"id": str(track_id)})).mappings().first()
    return dict(row) if row else None


async def _create_track(
    session: AsyncSession,
    track_id: uuid.UUID,
    event_type: str,
    lat: float,
    lon: float,
    detected_at: datetime,
    confidence: str | None,
) -> None:
    # ST_MakePoint returns SRID=0; wrap in ST_SetSRID(..., 4326) so the
    # cast-to-geography keeps the right reference for distance / makeline.
    await session.execute(
        text(
            """
            INSERT INTO drone_tracks
                (id, event_type, first_seen_at, last_seen_at,
                 path, last_point, prev_point, point_count, is_active, confidence)
            VALUES
                (:id, :event_type, :detected_at, :detected_at,
                 NULL,
                 ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                 NULL,
                 1, TRUE, :confidence)
            """
        ),
        {
            "id": str(track_id),
            "event_type": event_type,
            "detected_at": detected_at,
            "lat": lat,
            "lon": lon,
            "confidence": confidence,
        },
    )


async def _append_point(
    session: AsyncSession,
    track_row: object,
    lat: float,
    lon: float,
    detected_at: datetime,
) -> None:
    if track_row.point_count == 1:
        sql = text(
            """
            UPDATE drone_tracks
            SET prev_point  = last_point,
                last_point  = ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                path        = ST_MakeLine(
                                  last_point::geometry,
                                  ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)
                              )::geography,
                last_seen_at = :detected_at,
                point_count = point_count + 1
            WHERE id = :id
            """
        )
    else:
        sql = text(
            """
            UPDATE drone_tracks
            SET prev_point  = last_point,
                last_point  = ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                path        = ST_AddPoint(
                                  path::geometry,
                                  ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)
                              )::geography,
                last_seen_at = :detected_at,
                point_count = point_count + 1
            WHERE id = :id
            """
        )
    await session.execute(
        sql,
        {"id": str(track_row.id), "lat": lat, "lon": lon, "detected_at": detected_at},
    )


CLOSE_STALE_SQL = text(
    """
    UPDATE drone_tracks
    SET is_active = FALSE
    WHERE is_active = TRUE
      AND last_seen_at < :cutoff
    RETURNING id
    """
)


async def close_stale_tracks(session: AsyncSession, *, now: datetime) -> int:
    """Background-task helper — flips is_active=FALSE on tracks idle > 20 min.
    Returns the number of tracks closed in this sweep."""
    rows = (await session.execute(CLOSE_STALE_SQL, {"cutoff": now - STALE_AFTER})).all()
    if rows:
        await session.commit()
    return len(rows)
