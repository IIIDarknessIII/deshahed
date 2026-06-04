"""Receiver for ukrainealarm.com webhook callbacks.

ukrainealarm pushes an event whenever a siren starts or is cancelled. We treat
the callback purely as a low-latency *kick*: validate the shared secret,
publish a message on Redis channel `ua:kick`, and return 200 immediately. The
merge engine (services/parser/alerts_poller.py) listens for the kick and
refetches ukrainealarm's authoritative `/alerts` state — so we never depend on
the exact callback payload shape, only that *something* changed.

ukrainealarm's WebHookModel carries only the callback URL (no auth header), so
the shared secret travels in the query string (`?secret=...`) of the URL we
register, and we compare it in constant time here.
"""
from __future__ import annotations

import hmac
import json
import logging
import os

from fastapi import APIRouter, HTTPException, Request, Response

from app.db import get_redis

log = logging.getLogger("uvicorn.error").getChild("ua_webhook")

router = APIRouter(prefix="/api/v1/ua", tags=["ua"])

UA_KICK_CHANNEL = "ua:kick"


def _expected_secret() -> str | None:
    return os.environ.get("UA_WEBHOOK_SECRET", "").strip() or None


def _check_secret(secret: str) -> None:
    expected = _expected_secret()
    if not expected:
        raise HTTPException(status_code=503, detail="ua webhook not configured")
    if not hmac.compare_digest(secret or "", expected):
        raise HTTPException(status_code=403, detail="bad secret")


@router.post("/webhook")
async def ua_webhook(request: Request, secret: str = "") -> Response:
    _check_secret(secret)

    # Forward the full callback body to the engine, which owns the crosswalk and
    # applies the change directly (no /alerts refetch — ukrainealarm rate-limits
    # too hard for that). We stay dumb here: validate, forward, ack.
    raw = await request.body()
    text = raw.decode("utf-8", "replace") if raw else ""
    payload: object = None
    try:
        payload = json.loads(text) if text else None
    except Exception:
        payload = None

    try:
        await get_redis().publish(
            UA_KICK_CHANNEL, json.dumps({"payload": payload}, ensure_ascii=False)
        )
    except Exception:
        log.exception("ua webhook: failed to publish kick")
        # Still ack: the engine's safety-poll will reconcile regardless.

    if isinstance(payload, dict):
        log.info("ua webhook: region=%s status=%s type=%s",
                 payload.get("regionId"), payload.get("status"), payload.get("alarmType"))
    else:
        log.info("ua webhook: non-object payload %s", text[:120])
    return Response(status_code=200)


@router.get("/webhook")
async def ua_webhook_probe(secret: str = "") -> dict[str, bool]:
    """Liveness probe for the registered URL (and a manual smoke-test handle)."""
    _check_secret(secret)
    return {"ok": True}
