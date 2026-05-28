"""Dev mocker for drone events — exercises the full Phase-2 read path
(REST /drones/active, WS /ws/drones, frontend layer) without needing a
TG account, OpenRouter call, or Nominatim hit.

It mirrors what the real LLM extractor does:
  1. INSERT a row into drone_events (with PostGIS POINT geographies)
  2. PUBLISH a DroneAppearedMessage on Redis channel drones:updates

Usage (inside api container):

    docker compose ... exec api python -m app.dev.mock_drones inject shahed
    docker compose ... exec api python -m app.dev.mock_drones inject missile Київ
    docker compose ... exec api python -m app.dev.mock_drones loop --interval 6
    docker compose ... exec api python -m app.dev.mock_drones clear
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import random
import sys
from datetime import datetime, timedelta, timezone

from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db import dispose, get_redis, get_session_factory
from app.models import DroneEvent
from app.schemas.drones import DroneAppearedMessage, DroneEventView

log = logging.getLogger("mock_drones")

PUBSUB_CHANNEL = "drones:updates"
TTL_MIN = 15

EVENT_TYPES = ["shahed", "missile", "kab", "aviation"]

# (location_text, lat, lon) — picked from the geocoder L1 hits.
CITIES: list[tuple[str, float, float]] = [
    ("Київ", 50.4547, 30.5238),
    ("Харків", 49.9818, 36.2548),
    ("Львів", 49.8383, 24.0232),
    ("Одеса", 46.4857, 30.7438),
    ("Дніпро", 48.4666, 35.0407),
    ("Запоріжжя", 47.8517, 35.1171),
    ("Полтава", 49.5893, 34.5537),
    ("Суми", 50.9077, 34.7981),
    ("Чернігів", 51.5055, 31.2866),
    ("Миколаїв", 46.9750, 31.9946),
    ("Кропивницький", 48.5083, 32.2662),
    ("Вінниця", 49.2331, 28.4682),
]


async def _insert_and_publish(
    event_type: str,
    location_text: str,
    lat: float,
    lon: float,
    direction: tuple[str, float, float] | None,
    source_message_id: int,
) -> None:
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=TTL_MIN)
    loc_point = from_shape(Point(lon, lat), srid=4326)
    dir_point = (
        from_shape(Point(direction[2], direction[1]), srid=4326) if direction else None
    )
    factory = get_session_factory()
    async with factory() as session:
        stmt = (
            pg_insert(DroneEvent)
            .values(
                source_channel="mock",
                source_message_id=source_message_id,
                event_type=event_type,
                location_text=location_text,
                direction_text=direction[0] if direction else None,
                location_point=loc_point,
                direction_point=dir_point,
                confidence="medium",
                raw_text=f"[mock] {event_type} at {location_text}",
                raw_payload={"mock": True},
                detected_at=now,
                expires_at=expires,
            )
            .on_conflict_do_nothing(
                index_elements=["source_channel", "source_message_id"]
            )
            .returning(DroneEvent.id)
        )
        result = await session.execute(stmt)
        new_id = result.scalar_one_or_none()
        await session.commit()

    if new_id is None:
        log.info("dedup: skipped (same source_message_id)")
        return

    view = DroneEventView(
        id=new_id,
        event_type=event_type,
        location_text=location_text,
        direction_text=direction[0] if direction else None,
        location_lat=lat,
        location_lon=lon,
        direction_lat=direction[1] if direction else None,
        direction_lon=direction[2] if direction else None,
        confidence="medium",
        source_channel="mock",
        detected_at=now,
        expires_at=expires,
    )
    msg = DroneAppearedMessage(drone=view)
    await get_redis().publish(PUBSUB_CHANNEL, msg.model_dump_json())
    arrow = f" → {direction[0]}" if direction else ""
    print(f"appeared #{new_id}: {event_type} @ {location_text}{arrow}")


def _pick_city(name: str | None) -> tuple[str, float, float]:
    if name:
        for c in CITIES:
            if c[0] == name:
                return c
        raise SystemExit(f"unknown city: {name}")
    return random.choice(CITIES)


async def cmd_inject(args: argparse.Namespace) -> None:
    origin = _pick_city(args.city)
    direction = None
    if random.random() < 0.6:
        # Pick a direction city different from origin.
        cands = [c for c in CITIES if c[0] != origin[0]]
        direction = random.choice(cands) if cands else None
    await _insert_and_publish(
        args.event_type,
        origin[0],
        origin[1],
        origin[2],
        direction,
        source_message_id=random.randint(1, 10**9),
    )


async def cmd_loop(args: argparse.Namespace) -> None:
    print(f"loop mode: random drone every ~{args.interval}s — Ctrl-C to stop")
    try:
        while True:
            event_type = random.choices(EVENT_TYPES, weights=[6, 2, 1, 1])[0]
            origin = random.choice(CITIES)
            direction = None
            if random.random() < 0.6:
                cands = [c for c in CITIES if c[0] != origin[0]]
                direction = random.choice(cands)
            await _insert_and_publish(
                event_type,
                origin[0],
                origin[1],
                origin[2],
                direction,
                source_message_id=random.randint(1, 10**9),
            )
            await asyncio.sleep(args.interval + random.uniform(-1.5, 1.5))
    except (KeyboardInterrupt, asyncio.CancelledError):
        print("stopped")


async def cmd_clear(_: argparse.Namespace) -> None:
    factory = get_session_factory()
    async with factory() as session:
        result = await session.execute(
            delete(DroneEvent).where(DroneEvent.source_channel == "mock")
        )
        await session.commit()
    print(f"deleted {result.rowcount} mock rows from drone_events")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="mock_drones", description=__doc__.split("\n", 1)[0])
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("inject", help="insert + publish one drone event")
    s.add_argument("event_type", choices=EVENT_TYPES)
    s.add_argument("city", nargs="?", default=None, help="origin city; random if omitted")
    s.set_defaults(func=cmd_inject)

    s = sub.add_parser("loop", help="continuously inject random drones")
    s.add_argument("--interval", type=float, default=6.0)
    s.set_defaults(func=cmd_loop)

    s = sub.add_parser("clear", help="delete all mock rows from drone_events")
    s.set_defaults(func=cmd_clear)

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
    sys.exit(asyncio.run(amain(sys.argv[1:])))
