"""REST + WS surface for drone_tracks — Phase 3 multi-point trajectories.

REST:
  GET /api/v1/tracks/active
      → { tracks: TrackView[], updated_at }
      All currently active tracks with their LineString path (or null
      while the track only has one point so far).

WS:
  /api/v1/ws/tracks
      On connect: { type: "track_snapshot", tracks: [...] }
      Then forwards every message published on Redis channel `tracks:updates`
      (the assembler publishes a TrackUpdatedMessage after each create/append).
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import text

from app.db import get_redis, get_session_factory
from app.schemas.drones import TrackView

log = logging.getLogger("uvicorn.error").getChild("tracks")

router = APIRouter(prefix="/api/v1", tags=["tracks"])

PUBSUB_CHANNEL_TRACKS = "tracks:updates"


_ACTIVE_TRACKS_SQL = text(
    """
    SELECT id::text                                       AS id,
           event_type,
           first_seen_at, last_seen_at, point_count, is_active, confidence,
           CASE WHEN path IS NULL THEN NULL
                ELSE ST_AsGeoJSON(path::geometry)::jsonb
           END                                            AS path,
           ST_Y(last_point::geometry)                     AS last_lat,
           ST_X(last_point::geometry)                     AS last_lon
    FROM drone_tracks
    WHERE is_active = TRUE
    ORDER BY last_seen_at DESC
    """
)


async def _load_active_tracks() -> list[TrackView]:
    factory = get_session_factory()
    async with factory() as session:
        rows = (await session.execute(_ACTIVE_TRACKS_SQL)).mappings().all()
    return [TrackView(**dict(r)) for r in rows]


class ActiveTracksResponse(BaseModel):
    tracks: list[TrackView]
    updated_at: datetime


@router.get("/tracks/active", response_model=ActiveTracksResponse)
async def get_active_tracks() -> ActiveTracksResponse:
    tracks = await _load_active_tracks()
    return ActiveTracksResponse(tracks=tracks, updated_at=datetime.now(timezone.utc))


@router.websocket("/ws/tracks")
async def ws_tracks(ws: WebSocket) -> None:
    client = f"{ws.client.host}:{ws.client.port}" if ws.client else "?"
    log.info("ws_tracks: incoming client=%s", client)

    await ws.accept()
    log.info("ws_tracks: accepted client=%s", client)

    pubsub = get_redis().pubsub()
    forward_task: asyncio.Task[None] | None = None
    try:
        tracks = await _load_active_tracks()
        await ws.send_json({
            "type": "track_snapshot",
            "tracks": [t.model_dump(mode="json") for t in tracks],
        })
        log.info("ws_tracks: snapshot sent client=%s (%d tracks)", client, len(tracks))

        await pubsub.subscribe(PUBSUB_CHANNEL_TRACKS)

        async def forward() -> None:
            async for msg in pubsub.listen():
                if msg.get("type") != "message":
                    continue
                data = msg["data"]
                if isinstance(data, bytes):
                    data = data.decode("utf-8")
                try:
                    payload = json.loads(data)
                except json.JSONDecodeError:
                    log.warning("dropping non-JSON pubsub msg: %r", data[:200])
                    continue
                await ws.send_json(payload)

        forward_task = asyncio.create_task(forward())

        while True:
            await ws.receive_text()
    except WebSocketDisconnect as e:
        log.info("ws_tracks: client disconnected code=%s", getattr(e, "code", "?"))
    except Exception:
        log.exception("ws_tracks unexpected error client=%s", client)
    finally:
        if forward_task is not None:
            forward_task.cancel()
        try:
            await pubsub.unsubscribe(PUBSUB_CHANNEL_TRACKS)
            await pubsub.aclose()
        except Exception:
            log.exception("pubsub cleanup failed")
