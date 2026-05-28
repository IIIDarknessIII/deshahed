"""Active Russian missile-carrier aircraft surfaced by the aviation_watcher."""
from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter

from app.db import get_redis
from app.schemas.aviation import AviationActiveResponse, AviationEvent

router = APIRouter(prefix="/api/v1", tags=["aviation"])

REDIS_KEY_ACTIVE = "aviation:active"


@router.get("/aviation/active", response_model=AviationActiveResponse)
async def get_active_aviation() -> AviationActiveResponse:
    raw = await get_redis().get(REDIS_KEY_ACTIVE)
    items: list[AviationEvent] = []
    if raw:
        try:
            data = json.loads(raw)
            now = datetime.now(timezone.utc)
            for entry in data:
                ev = AviationEvent.model_validate(entry)
                if ev.expires_at > now:
                    items.append(ev)
        except Exception:
            items = []
    return AviationActiveResponse(items=items, updated_at=datetime.now(timezone.utc))
