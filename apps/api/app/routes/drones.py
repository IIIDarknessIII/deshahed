"""REST + WS surface for drone_events (OSINT shahed/missile/kab/aviation reports).

REST:
  GET /api/v1/drones/active
      → { drones: DroneEventView[], updated_at }
      Live rows (expires_at > NOW()), sorted by detected_at DESC.

WS:
  /api/v1/ws/drones
      On connect: { type: "drone_snapshot", drones: DroneEventView[] }
      Then forwards every message published on Redis channel `drones:updates`
      (the LLM extractor publishes DroneAppearedMessage there after each
      insert). Client-side TTL: expires_at field on each drone.
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
from app.schemas.drones import DroneEventView

log = logging.getLogger("uvicorn.error").getChild("drones")

router = APIRouter(prefix="/api/v1", tags=["drones"])

PUBSUB_CHANNEL_DRONES = "drones:updates"


_ACTIVE_SQL = text(
    """
    SELECT id, event_type, location_text, direction_text,
           ST_Y(location_point::geometry)        AS location_lat,
           ST_X(location_point::geometry)        AS location_lon,
           CASE WHEN direction_point IS NULL THEN NULL
                ELSE ST_Y(direction_point::geometry) END  AS direction_lat,
           CASE WHEN direction_point IS NULL THEN NULL
                ELSE ST_X(direction_point::geometry) END  AS direction_lon,
           confidence, source_channel, detected_at, expires_at
    FROM drone_events
    WHERE expires_at > NOW()
    ORDER BY detected_at DESC
    """
)


async def _load_active() -> list[DroneEventView]:
    factory = get_session_factory()
    async with factory() as session:
        rows = (await session.execute(_ACTIVE_SQL)).mappings().all()
    return [DroneEventView(**dict(r)) for r in rows]


class ActiveDronesResponse(BaseModel):
    drones: list[DroneEventView]
    updated_at: datetime


@router.get("/drones/active", response_model=ActiveDronesResponse)
async def get_active_drones() -> ActiveDronesResponse:
    drones = await _load_active()
    return ActiveDronesResponse(drones=drones, updated_at=datetime.now(timezone.utc))


@router.websocket("/ws/drones")
async def ws_drones(ws: WebSocket) -> None:
    client = f"{ws.client.host}:{ws.client.port}" if ws.client else "?"
    log.info("ws_drones: incoming client=%s", client)

    await ws.accept()
    log.info("ws_drones: accepted client=%s", client)

    pubsub = get_redis().pubsub()
    forward_task: asyncio.Task[None] | None = None
    try:
        drones = await _load_active()
        await ws.send_json({
            "type": "drone_snapshot",
            "drones": [d.model_dump(mode="json") for d in drones],
        })
        log.info("ws_drones: snapshot sent client=%s (%d drones)", client, len(drones))

        await pubsub.subscribe(PUBSUB_CHANNEL_DRONES)

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
        log.info("ws_drones: client disconnected code=%s", getattr(e, "code", "?"))
    except Exception:
        log.exception("ws_drones unexpected error client=%s", client)
    finally:
        if forward_task is not None:
            forward_task.cancel()
        try:
            await pubsub.unsubscribe(PUBSUB_CHANNEL_DRONES)
            await pubsub.aclose()
        except Exception:
            log.exception("pubsub cleanup failed")
