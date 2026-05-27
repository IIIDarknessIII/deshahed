"""WebSocket endpoint that streams alert state to clients.

On connect it sends a "snapshot" message read from Redis key `alerts:current`,
then forwards every message published on Redis channel `alerts:updates` to the
client until disconnect. The poller (and the dev mocker) are the only writers
of these Redis keys — this endpoint is read-only from Redis.
"""
from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.db import get_redis

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/ws", tags=["ws"])

REDIS_KEY_CURRENT = "alerts:current"
REDIS_CHANNEL_UPDATES = "alerts:updates"


async def _load_snapshot() -> list[dict]:
    raw = await get_redis().get(REDIS_KEY_CURRENT)
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        log.warning("alerts:current is not valid JSON, treating as empty")
        return []
    return data if isinstance(data, list) else []


@router.websocket("/alerts")
async def ws_alerts(ws: WebSocket) -> None:
    await ws.accept()

    pubsub = get_redis().pubsub()
    forward_task: asyncio.Task[None] | None = None
    try:
        snapshot = await _load_snapshot()
        await ws.send_json({"type": "snapshot", "alerts": snapshot})

        await pubsub.subscribe(REDIS_CHANNEL_UPDATES)

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
                    log.warning("dropping non-JSON pubsub message: %r", data[:200])
                    continue
                await ws.send_json(payload)

        forward_task = asyncio.create_task(forward())

        # Drain client-side frames so a client disconnect is detected promptly.
        while True:
            await ws.receive_text()

    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("ws_alerts unexpected error")
    finally:
        if forward_task is not None:
            forward_task.cancel()
        try:
            await pubsub.unsubscribe(REDIS_CHANNEL_UPDATES)
            await pubsub.aclose()
        except Exception:
            log.exception("pubsub cleanup failed")
