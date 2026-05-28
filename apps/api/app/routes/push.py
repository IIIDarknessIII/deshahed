"""WebPush subscription endpoints — the browser handshakes here after the
user grants Notification permission, and unsubs here on opt-out.

VAPID_PUBLIC_KEY is fetched separately so the frontend doesn't ship it as
a build-time constant (Next would need `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
but reading it at runtime is more flexible — same backend can rotate
keys without a frontend rebuild).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.config import get_settings
from app.db import get_session_factory
from app.models import PushSubscription

log = logging.getLogger("uvicorn.error").getChild("push")

router = APIRouter(prefix="/api/v1/push", tags=["push"])


class VapidPublicKeyResponse(BaseModel):
    public_key: str
    enabled: bool


@router.get("/public-key", response_model=VapidPublicKeyResponse)
async def get_public_key() -> VapidPublicKeyResponse:
    settings = get_settings()
    return VapidPublicKeyResponse(
        public_key=settings.vapid_public_key,
        enabled=bool(settings.vapid_public_key and settings.vapid_private_key),
    )


class SubscribeRequest(BaseModel):
    endpoint: str
    keys: dict = Field(..., description="{p256dh, auth}")
    # Canonical oblast title — same string alerts.in.ua puts in `location_oblast`.
    # Null = subscribe to all of Ukraine.
    region_oblast: str | None = None
    region_uid: int | None = None  # legacy field, ignored


@router.post("/subscribe")
async def subscribe(req: SubscribeRequest, request: Request) -> dict:
    p256dh = req.keys.get("p256dh")
    auth = req.keys.get("auth")
    if not p256dh or not auth:
        raise HTTPException(status_code=400, detail="keys.p256dh and keys.auth are required")

    ua = (request.headers.get("user-agent") or "")[:300] or None
    now = datetime.now(timezone.utc)

    factory = get_session_factory()
    async with factory() as session:
        stmt = (
            pg_insert(PushSubscription)
            .values(
                endpoint=req.endpoint,
                p256dh=p256dh,
                auth=auth,
                region_oblast=req.region_oblast,
                user_agent=ua,
                created_at=now,
                last_seen_at=now,
            )
            .on_conflict_do_update(
                index_elements=["endpoint"],
                set_={
                    "p256dh": p256dh,
                    "auth": auth,
                    "region_oblast": req.region_oblast,
                    "user_agent": ua,
                    "last_seen_at": now,
                },
            )
        )
        await session.execute(stmt)
        await session.commit()
    log.info("push subscribe: region=%r ua=%s", req.region_oblast, (ua or "?")[:60])
    return {"status": "ok"}


class UnsubscribeRequest(BaseModel):
    endpoint: str


@router.post("/unsubscribe")
async def unsubscribe(req: UnsubscribeRequest) -> dict:
    factory = get_session_factory()
    async with factory() as session:
        result = await session.execute(
            delete(PushSubscription).where(PushSubscription.endpoint == req.endpoint)
        )
        await session.commit()
    return {"status": "ok", "removed": result.rowcount or 0}
