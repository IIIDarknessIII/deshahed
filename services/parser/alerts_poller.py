"""alerts_poller — long-running worker that mirrors alerts.in.ua state into Redis + Postgres.

Loop (every POLL_INTERVAL_SEC seconds):
  1. GET https://api.alerts.in.ua/v1/alerts/active.json with Bearer auth
  2. Read previous active set from Redis key `alerts:current`
  3. Diff by (location_uid, alert_type):
        new key → INSERT into alert_events; PUBLISH alert_started
        gone key → UPDATE alert_events.finished_at = NOW(); PUBLISH alert_ended
  4. Overwrite `alerts:current` with the new snapshot

The WS endpoint at /api/v1/ws/alerts is the only consumer of these Redis keys —
it reads the snapshot on connect and forwards the pub/sub stream to clients.

Requires ALERTS_API_TOKEN. Refuses to start without it.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import update

from app.db import dispose, get_redis, get_session_factory
from app.models import AlertEvent

log = logging.getLogger("alerts_poller")

ALERTS_URL = "https://api.alerts.in.ua/v1/alerts/active.json"
POLL_INTERVAL_SEC = 5.0
HTTP_TIMEOUT_SEC = 4.0
BACKOFF_MAX_SEC = 60.0

REDIS_KEY_CURRENT = "alerts:current"
REDIS_CHANNEL_UPDATES = "alerts:updates"


def _alert_key(a: dict) -> tuple[int, str]:
    return (int(a["location_uid"]), a["alert_type"])


def _normalize(a: dict) -> dict:
    """Trim an alerts.in.ua alert object to what our WS / DB layers care about."""
    return {
        "location_uid": int(a["location_uid"]),
        "location_title": a["location_title"],
        "location_type": a["location_type"],
        "alert_type": a["alert_type"],
        "started_at": a["started_at"],
        "finished_at": a.get("finished_at"),
    }


def _parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


async def _fetch_active(client: httpx.AsyncClient, token: str) -> list[dict]:
    resp = await client.get(
        ALERTS_URL,
        headers={"Authorization": f"Bearer {token}"},
        timeout=HTTP_TIMEOUT_SEC,
    )
    resp.raise_for_status()
    body = resp.json()
    alerts = body.get("alerts") or []
    return [_normalize(a) for a in alerts]


async def _read_prev() -> list[dict]:
    raw = await get_redis().get(REDIS_KEY_CURRENT)
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        log.warning("alerts:current is malformed; treating as empty")
        return []


async def _persist_and_publish(started: list[dict], ended: list[dict], raw_by_key: dict[tuple[int, str], dict]) -> None:
    factory = get_session_factory()
    redis = get_redis()

    async with factory() as session:
        for a in started:
            session.add(
                AlertEvent(
                    location_uid=a["location_uid"],
                    location_title=a["location_title"],
                    location_type=a["location_type"],
                    alert_type=a["alert_type"],
                    started_at=_parse_ts(a["started_at"]),
                    finished_at=None,
                    raw_payload=raw_by_key[_alert_key(a)],
                )
            )
        for a in ended:
            stmt = (
                update(AlertEvent)
                .where(
                    AlertEvent.location_uid == a["location_uid"],
                    AlertEvent.alert_type == a["alert_type"],
                    AlertEvent.finished_at.is_(None),
                )
                .values(finished_at=datetime.now(timezone.utc))
            )
            await session.execute(stmt)
        await session.commit()

    for a in started:
        await redis.publish(
            REDIS_CHANNEL_UPDATES,
            json.dumps({"type": "alert_started", "alert": a}, ensure_ascii=False),
        )
    for a in ended:
        await redis.publish(
            REDIS_CHANNEL_UPDATES,
            json.dumps(
                {
                    "type": "alert_ended",
                    "location_uid": a["location_uid"],
                    "alert_type": a["alert_type"],
                },
                ensure_ascii=False,
            ),
        )


async def _tick(client: httpx.AsyncClient, token: str) -> None:
    curr = await _fetch_active(client, token)
    raw_by_key: dict[tuple[int, str], Any] = {_alert_key(a): a for a in curr}

    prev = await _read_prev()
    prev_keys = {_alert_key(a) for a in prev}
    curr_keys = set(raw_by_key.keys())

    started = [a for a in curr if _alert_key(a) in (curr_keys - prev_keys)]
    ended = [a for a in prev if _alert_key(a) in (prev_keys - curr_keys)]

    if started or ended:
        log.info("diff: +%d started, -%d ended", len(started), len(ended))
        await _persist_and_publish(started, ended, raw_by_key)

    await get_redis().set(REDIS_KEY_CURRENT, json.dumps(curr, ensure_ascii=False))


async def _run(stop: asyncio.Event) -> None:
    token = os.environ.get("ALERTS_API_TOKEN", "").strip()
    if not token:
        log.error("ALERTS_API_TOKEN is not set; refusing to start")
        raise SystemExit(2)

    log.info("alerts_poller starting; interval=%.1fs", POLL_INTERVAL_SEC)
    backoff = 1.0

    async with httpx.AsyncClient() as client:
        while not stop.is_set():
            try:
                await _tick(client, token)
                backoff = 1.0
                await asyncio.wait_for(stop.wait(), timeout=POLL_INTERVAL_SEC)
            except asyncio.TimeoutError:
                continue  # normal tick boundary
            except httpx.HTTPStatusError as e:
                log.error("alerts.in.ua HTTP %s; sleeping %.1fs", e.response.status_code, backoff)
                await asyncio.wait_for(stop.wait(), timeout=backoff)
                backoff = min(backoff * 2, BACKOFF_MAX_SEC)
            except (httpx.RequestError, asyncio.TimeoutError):
                log.exception("network error; sleeping %.1fs", backoff)
                await asyncio.wait_for(stop.wait(), timeout=backoff)
                backoff = min(backoff * 2, BACKOFF_MAX_SEC)
            except Exception:
                log.exception("unexpected error; sleeping %.1fs", backoff)
                await asyncio.wait_for(stop.wait(), timeout=backoff)
                backoff = min(backoff * 2, BACKOFF_MAX_SEC)


async def main() -> None:
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)

    try:
        await _run(stop)
    finally:
        log.info("alerts_poller shutting down")
        await dispose()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(name)s [%(levelname)s] %(message)s",
    )
    asyncio.run(main())
