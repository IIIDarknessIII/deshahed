"""WebPush dispatch — listens to Redis `alerts:updates` and fans out browser
push notifications to every PushSubscription that matched the alert's
location_uid (or has NULL region_uid for "all of Ukraine").

VAPID keys are read from settings; if they're empty, the dispatcher
no-ops. Subscriptions that come back 404/410 from their endpoint are
removed (stale browser).
"""
from __future__ import annotations

import asyncio
import json
import logging

from pywebpush import WebPushException, webpush
from sqlalchemy import text

from app.config import get_settings
from app.db import get_redis, get_session_factory

log = logging.getLogger("uvicorn.error").getChild("push")

PUBSUB_CHANNEL_ALERTS = "alerts:updates"


def _vapid_claims(subject: str) -> dict:
    return {"sub": subject}


async def _send_one(endpoint: str, p256dh: str, auth: str, payload: dict) -> tuple[bool, int | None]:
    """Returns (delivered, http_status)."""
    settings = get_settings()
    sub_info = {
        "endpoint": endpoint,
        "keys": {"p256dh": p256dh, "auth": auth},
    }
    try:
        # pywebpush is sync; offload to a worker thread.
        await asyncio.to_thread(
            webpush,
            subscription_info=sub_info,
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims=_vapid_claims(settings.vapid_subject),
            ttl=300,
        )
        return True, 201
    except WebPushException as e:
        status = getattr(e.response, "status_code", None) if e.response is not None else None
        return False, status


async def _broadcast_alert(alert: dict) -> None:
    location_title = alert.get("location_title", "Тривога")
    # Match by parent oblast string — alerts.in.ua's location_oblast_uid is
    # unreliable, but the title is canonical.
    location_oblast = alert.get("location_oblast") or location_title
    factory = get_session_factory()
    async with factory() as session:
        # Subscribers either targeting this oblast OR opted into all of UA.
        rows = (await session.execute(
            text(
                """
                SELECT id, endpoint, p256dh, auth
                FROM push_subscriptions
                WHERE region_oblast IS NULL OR region_oblast = :oblast
                """
            ),
            {"oblast": location_oblast},
        )).all()

        if not rows:
            return

        payload = {
            "title": f"Тривога · {location_title}",
            "body": f"Повітряна тривога — {location_oblast}",
            "tag": f"alert-{alert.get('location_uid', '')}-{alert.get('alert_type', 'air_raid')}",
            "url": "/",
        }

        dead_ids: list[int] = []
        sent_ok = 0
        for r in rows:
            delivered, status = await _send_one(r.endpoint, r.p256dh, r.auth, payload)
            if delivered:
                sent_ok += 1
            elif status in (404, 410):
                dead_ids.append(r.id)
        if dead_ids:
            # Prune subscriptions the push service reported as gone (404/410).
            await session.execute(
                text("DELETE FROM push_subscriptions WHERE id = ANY(:ids)"),
                {"ids": dead_ids},
            )
            await session.commit()
        log.info(
            "push: alert uid=%s sent=%d/%d removed_stale=%d",
            alert.get("location_uid", ""), sent_ok, len(rows), len(dead_ids),
        )


async def loop(stop: asyncio.Event) -> None:
    settings = get_settings()
    if not settings.vapid_private_key or not settings.vapid_public_key:
        log.warning("push: VAPID keys not configured — push dispatcher idling")
        await stop.wait()
        return

    redis = get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe(PUBSUB_CHANNEL_ALERTS)
    log.info("push: subscribed to %s", PUBSUB_CHANNEL_ALERTS)
    try:
        async for msg in pubsub.listen():
            if stop.is_set():
                break
            if msg.get("type") != "message":
                continue
            data = msg.get("data")
            if isinstance(data, bytes):
                data = data.decode("utf-8")
            try:
                payload = json.loads(data)
            except json.JSONDecodeError:
                continue
            if payload.get("type") != "alert_started":
                continue
            try:
                await _broadcast_alert(payload.get("alert", {}))
            except Exception:
                log.exception("push: broadcast failed")
    finally:
        try:
            await pubsub.unsubscribe(PUBSUB_CHANNEL_ALERTS)
            await pubsub.aclose()
        except Exception:
            pass
