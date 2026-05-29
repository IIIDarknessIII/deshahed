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
import time
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.db import get_redis

# Use uvicorn's logger so messages actually surface in `docker logs`.
log = logging.getLogger("uvicorn.error").getChild("ws_alerts")

router = APIRouter(prefix="/api/v1/ws", tags=["ws"])

REDIS_KEY_CURRENT = "alerts:current"
REDIS_CHANNEL_UPDATES = "alerts:updates"

# Live-presence sorted set, member=connection_uuid, score=last_seen epoch.
# Stale entries (>60s) are swept either by the /stats/online endpoint or by
# the heartbeat task below. Designed so a hard kill never leaves zombies for
# more than one minute.
REDIS_KEY_ONLINE = "online:sessions"
PRESENCE_TTL_SEC = 60
PRESENCE_REFRESH_SEC = 25


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
    client = f"{ws.client.host}:{ws.client.port}" if ws.client else "?"
    ua = ws.headers.get("user-agent", "?")[:80]
    origin = ws.headers.get("origin", "?")
    log.info("ws_alerts: incoming client=%s origin=%s ua=%s", client, origin, ua)

    await ws.accept()
    log.info("ws_alerts: accepted client=%s", client)

    redis = get_redis()
    pubsub = redis.pubsub()
    forward_task: asyncio.Task[None] | None = None
    presence_task: asyncio.Task[None] | None = None
    connection_id = uuid.uuid4().hex

    async def presence_heartbeat() -> None:
        # Re-score every 25s so a stuck connection that beats receive_text's
        # disconnect detection still ages out within 60s after death.
        while True:
            try:
                await redis.zadd(REDIS_KEY_ONLINE, {connection_id: time.time()})
            except Exception:
                log.exception("presence zadd failed")
            await asyncio.sleep(PRESENCE_REFRESH_SEC)

    try:
        await redis.zadd(REDIS_KEY_ONLINE, {connection_id: time.time()})
        presence_task = asyncio.create_task(presence_heartbeat())

        snapshot = await _load_snapshot()
        await ws.send_json({"type": "snapshot", "alerts": snapshot})
        log.info("ws_alerts: snapshot sent client=%s (%d alerts)", client, len(snapshot))

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

        while True:
            await ws.receive_text()

    except WebSocketDisconnect as e:
        log.info("ws_alerts: client disconnected client=%s code=%s", client, getattr(e, "code", "?"))
    except Exception:
        log.exception("ws_alerts unexpected error client=%s", client)
    finally:
        if forward_task is not None:
            forward_task.cancel()
        if presence_task is not None:
            presence_task.cancel()
        try:
            await redis.zrem(REDIS_KEY_ONLINE, connection_id)
        except Exception:
            log.exception("presence zrem failed")
        try:
            await pubsub.unsubscribe(REDIS_CHANNEL_UPDATES)
            await pubsub.aclose()
        except Exception:
            log.exception("pubsub cleanup failed")
