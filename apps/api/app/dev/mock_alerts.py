"""Dev-only CLI to inject mock alert state into Redis.

The WS endpoint at /api/v1/ws/alerts reads `alerts:current` on connect and
subscribes to `alerts:updates` for push messages. This script mimics what the
real poller will do once the alerts.in.ua token is in place, letting us
develop the frontend end-to-end without a token.

Usage (inside the api container):

    docker compose -f infra/docker-compose.yml exec api \
        python -m app.dev.mock_alerts snapshot

    docker compose -f infra/docker-compose.yml exec api \
        python -m app.dev.mock_alerts start 19 air_raid

    docker compose -f infra/docker-compose.yml exec api \
        python -m app.dev.mock_alerts end 19 air_raid

    docker compose -f infra/docker-compose.yml exec api \
        python -m app.dev.mock_alerts clear

    docker compose -f infra/docker-compose.yml exec api \
        python -m app.dev.mock_alerts loop --interval 8

UIDs below are placeholders (1..27, indexed in TZ-order); real values come
from alerts.in.ua /v1/locations.json once the API token is provisioned.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import random
import sys

from datetime import datetime, timezone

from sqlalchemy import update

from app.db import dispose, get_redis, get_session_factory
from app.models import AlertEvent

log = logging.getLogger("mock_alerts")

REDIS_KEY_CURRENT = "alerts:current"
REDIS_CHANNEL_UPDATES = "alerts:updates"

LOCATIONS: list[tuple[int, str, str]] = [
    (1, "Вінницька область", "oblast"),
    (2, "Волинська область", "oblast"),
    (3, "Дніпропетровська область", "oblast"),
    (4, "Донецька область", "oblast"),
    (5, "Житомирська область", "oblast"),
    (6, "Закарпатська область", "oblast"),
    (7, "Запорізька область", "oblast"),
    (8, "Івано-Франківська область", "oblast"),
    (9, "Київська область", "oblast"),
    (10, "Кіровоградська область", "oblast"),
    (11, "Луганська область", "oblast"),
    (12, "Львівська область", "oblast"),
    (13, "Миколаївська область", "oblast"),
    (14, "Одеська область", "oblast"),
    (15, "Полтавська область", "oblast"),
    (16, "Рівненська область", "oblast"),
    (17, "Сумська область", "oblast"),
    (18, "Тернопільська область", "oblast"),
    (19, "Харківська область", "oblast"),
    (20, "Херсонська область", "oblast"),
    (21, "Хмельницька область", "oblast"),
    (22, "Черкаська область", "oblast"),
    (23, "Чернівецька область", "oblast"),
    (24, "Чернігівська область", "oblast"),
    (25, "м. Київ", "city"),
    (26, "м. Севастополь", "city"),
    (27, "Автономна Республіка Крим", "autonomous_republic"),
]

LOCATION_BY_UID: dict[int, tuple[str, str]] = {uid: (title, ttype) for uid, title, ttype in LOCATIONS}

ALERT_TYPES = ["air_raid", "artillery_shelling", "urban_fights", "chemical", "nuclear"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _build_alert(location_uid: int, alert_type: str, started_at: str | None = None) -> dict:
    if location_uid not in LOCATION_BY_UID:
        raise SystemExit(f"unknown location_uid={location_uid}")
    title, location_type = LOCATION_BY_UID[location_uid]
    return {
        "location_uid": location_uid,
        "location_title": title,
        "location_type": location_type,
        "alert_type": alert_type,
        "started_at": started_at or _now_iso(),
        "finished_at": None,
        # Mock data is always at oblast/city level — parent == self.
        "location_oblast": title,
        "location_oblast_uid": location_uid,
    }


async def _read_current() -> list[dict]:
    raw = await get_redis().get(REDIS_KEY_CURRENT)
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


async def _write_current(alerts: list[dict]) -> None:
    await get_redis().set(REDIS_KEY_CURRENT, json.dumps(alerts, ensure_ascii=False))


async def _publish(payload: dict) -> None:
    await get_redis().publish(REDIS_CHANNEL_UPDATES, json.dumps(payload, ensure_ascii=False))


async def _db_insert_started(alert: dict) -> None:
    """Mirror what the real alerts_poller does: insert a fresh row for a new alert."""
    factory = get_session_factory()
    async with factory() as session:
        session.add(
            AlertEvent(
                location_uid=alert["location_uid"],
                location_title=alert["location_title"],
                location_type=alert["location_type"],
                alert_type=alert["alert_type"],
                started_at=datetime.fromisoformat(alert["started_at"]),
                finished_at=None,
                raw_payload=alert,
            )
        )
        await session.commit()


async def _db_mark_ended(uid: int, alert_type: str) -> None:
    factory = get_session_factory()
    async with factory() as session:
        await session.execute(
            update(AlertEvent)
            .where(
                AlertEvent.location_uid == uid,
                AlertEvent.alert_type == alert_type,
                AlertEvent.finished_at.is_(None),
            )
            .values(finished_at=datetime.now(timezone.utc))
        )
        await session.commit()


async def cmd_snapshot(args: argparse.Namespace) -> None:
    # End any currently-active mock alerts in DB so duration accounting stays sane.
    prev = await _read_current()
    for a in prev:
        await _db_mark_ended(a["location_uid"], a["alert_type"])

    sample_uids = random.sample([uid for uid, _, _ in LOCATIONS], k=min(args.count, 5))
    alerts = [_build_alert(uid, "air_raid") for uid in sample_uids]
    for a in alerts:
        await _db_insert_started(a)
    await _write_current(alerts)
    print(f"wrote {len(alerts)} alert(s) to {REDIS_KEY_CURRENT}: " + ", ".join(a["location_title"] for a in alerts))


async def cmd_clear(_: argparse.Namespace) -> None:
    await _write_current([])
    print(f"cleared {REDIS_KEY_CURRENT}")


async def cmd_start(args: argparse.Namespace) -> None:
    alert = _build_alert(args.uid, args.alert_type)
    current = await _read_current()
    current = [a for a in current if not (a["location_uid"] == args.uid and a["alert_type"] == args.alert_type)]
    current.append(alert)
    await _db_insert_started(alert)
    await _write_current(current)
    await _publish({"type": "alert_started", "alert": alert})
    print(f"started: {alert['location_title']} / {args.alert_type}")


async def cmd_end(args: argparse.Namespace) -> None:
    current = await _read_current()
    before = len(current)
    current = [a for a in current if not (a["location_uid"] == args.uid and a["alert_type"] == args.alert_type)]
    await _db_mark_ended(args.uid, args.alert_type)
    await _write_current(current)
    await _publish({"type": "alert_ended", "location_uid": args.uid, "alert_type": args.alert_type})
    title = LOCATION_BY_UID[args.uid][0]
    print(f"ended: {title} / {args.alert_type} (removed {before - len(current)} from snapshot)")


async def cmd_loop(args: argparse.Namespace) -> None:
    print(f"loop mode: random start/end every ~{args.interval}s — Ctrl-C to stop")
    try:
        while True:
            current = await _read_current()
            active_keys = {(a["location_uid"], a["alert_type"]) for a in current}
            # Bias toward starting alerts until ~6 are active.
            if len(active_keys) < 6 and random.random() < 0.7:
                uid = random.choice([u for u, _, _ in LOCATIONS])
                atype = random.choice(["air_raid"] * 4 + ["artillery_shelling", "urban_fights"])
                if (uid, atype) not in active_keys:
                    await cmd_start(argparse.Namespace(uid=uid, alert_type=atype))
            elif active_keys:
                uid, atype = random.choice(list(active_keys))
                await cmd_end(argparse.Namespace(uid=uid, alert_type=atype))
            await asyncio.sleep(args.interval + random.uniform(-1.5, 1.5))
    except (KeyboardInterrupt, asyncio.CancelledError):
        print("stopped")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="mock_alerts", description=__doc__.split("\n", 1)[0])
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("snapshot", help="overwrite alerts:current with a random small set")
    s.add_argument("--count", type=int, default=3)
    s.set_defaults(func=cmd_snapshot)

    s = sub.add_parser("clear", help="clear alerts:current")
    s.set_defaults(func=cmd_clear)

    s = sub.add_parser("start", help="publish an alert_started event")
    s.add_argument("uid", type=int)
    s.add_argument("alert_type", choices=ALERT_TYPES, nargs="?", default="air_raid")
    s.set_defaults(func=cmd_start)

    s = sub.add_parser("end", help="publish an alert_ended event")
    s.add_argument("uid", type=int)
    s.add_argument("alert_type", choices=ALERT_TYPES, nargs="?", default="air_raid")
    s.set_defaults(func=cmd_end)

    s = sub.add_parser("loop", help="randomly start/end events forever")
    s.add_argument("--interval", type=float, default=8.0)
    s.set_defaults(func=cmd_loop)

    return p


async def amain(argv: list[str]) -> int:
    args = build_parser().parse_args(argv)
    try:
        await args.func(args)
        return 0
    finally:
        await dispose()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    raise SystemExit(asyncio.run(amain(sys.argv[1:])))
