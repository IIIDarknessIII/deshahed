"""Concurrent visitor count.

Sourced from the `online:sessions` Redis ZSET that the alerts WebSocket
adds to on accept and removes from on disconnect. Reads here are best-effort
— each call sweeps entries older than 60 s before returning ZCARD so
crashed connections don't inflate the number for long.
"""
from __future__ import annotations

import time

from fastapi import APIRouter
from pydantic import BaseModel

from app.db import get_redis

router = APIRouter(prefix="/api/v1", tags=["presence"])

REDIS_KEY_ONLINE = "online:sessions"
PRESENCE_TTL_SEC = 60


class OnlineResponse(BaseModel):
    online: int


@router.get("/stats/online", response_model=OnlineResponse)
async def get_online() -> OnlineResponse:
    redis = get_redis()
    cutoff = time.time() - PRESENCE_TTL_SEC
    try:
        await redis.zremrangebyscore(REDIS_KEY_ONLINE, 0, cutoff)
        count = await redis.zcard(REDIS_KEY_ONLINE)
    except Exception:
        count = 0
    return OnlineResponse(online=int(count))
