"""aviation_watcher — regex-only detector for Russian missile-carrier aircraft.

These aircraft are precursors to specific strike types:
    МіГ-31К      → Kh-47 "Kinzhal" ballistic launch within ~30-90 min
    Ту-95МС      → Х-101/555 cruise missile launch within ~2-6 h
    Ту-160       → as above, larger volley
    Ту-22М3      → Х-22/Х-32 anti-ship / ground missiles

OSINT TG channels post takeoffs/landings within 1-3 minutes of the event.
Aggregating them in one banner gives users a unique 30-90-minute heads-up
that no competitor surfaces in a clean UI.

This worker consumes `messages_raw` with its own consumer group so it runs
in parallel with llm_extractor without stealing messages. Detection is
pure regex on lemmatised text — false-positive rate is tiny because all
four craft names are specific enough.

State lives in Redis key `aviation:active` (JSON list, replaced atomically
each time the active set changes). Each entry carries an absolute
expires_at so the API can filter expired entries client-side.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
import signal
from datetime import datetime, timedelta, timezone

from app.db import dispose, get_redis

log = logging.getLogger("aviation_watcher")

STREAM_RAW = "messages_raw"
CONSUMER_GROUP = "aviation-watcher"
CONSUMER_NAME = "aviation-watcher-1"
REDIS_KEY_ACTIVE = "aviation:active"
REDIS_CHANNEL = "aviation:updates"
GC_INTERVAL_SEC = 30

# Detection patterns — narrow so a single mention triggers a state change.
# Variants cover Ukrainian, Russian, and Latin-script abbreviations.
CRAFT_PATTERNS: dict[str, re.Pattern[str]] = {
    "mig31k": re.compile(r"(?ix) (м[іи]г|mig)[\s\-]?31\s*к", re.UNICODE),
    "tu95": re.compile(r"(?ix) (т[уy])[\s\-]?95", re.UNICODE),
    "tu160": re.compile(r"(?ix) (т[уy])[\s\-]?160", re.UNICODE),
    "tu22m3": re.compile(r"(?ix) (т[уy])[\s\-]?22\s*м?3?", re.UNICODE),
}

STATUS_PATTERNS: dict[str, re.Pattern[str]] = {
    "takeoff": re.compile(r"(?ix) зл[іие]т|пуск\s+бортов|взл[её]т|вилет|вилит", re.UNICODE),
    "landing": re.compile(r"(?ix) посадк|приземл|зайшов\s+на\s+посадк", re.UNICODE),
}

# How long an "in-air" or "takeoff" sighting stays visible without re-confirmation.
ACTIVE_TTL_MIN: dict[str, int] = {
    "mig31k": 90,
    "tu95": 360,
    "tu160": 360,
    "tu22m3": 240,
}

# Friendly UA labels used by the banner.
CRAFT_LABEL_UK: dict[str, str] = {
    "mig31k": "МіГ-31К",
    "tu95": "Ту-95МС",
    "tu160": "Ту-160",
    "tu22m3": "Ту-22М3",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _detect(text: str) -> tuple[str, str] | None:
    """Return (craft, status) on a positive match, else None.

    Status defaults to 'in_air' if neither takeoff nor landing fits — many
    posts read like "МіГ-31К у повітрі" without an explicit verb.
    """
    craft: str | None = None
    for name, pat in CRAFT_PATTERNS.items():
        if pat.search(text):
            craft = name
            break
    if craft is None:
        return None
    status = "in_air"
    for s, pat in STATUS_PATTERNS.items():
        if pat.search(text):
            status = s
            break
    return craft, status


async def _load_active() -> list[dict]:
    raw = await get_redis().get(REDIS_KEY_ACTIVE)
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


async def _save_active(items: list[dict]) -> None:
    await get_redis().set(REDIS_KEY_ACTIVE, json.dumps(items, ensure_ascii=False))


def _purge_expired(items: list[dict], now: datetime) -> tuple[list[dict], list[dict]]:
    keep, drop = [], []
    for it in items:
        try:
            exp = datetime.fromisoformat(it["expires_at"].replace("Z", "+00:00"))
        except Exception:
            drop.append(it)
            continue
        if exp > now:
            keep.append(it)
        else:
            drop.append(it)
    return keep, drop


def _make_id(craft: str, status: str, channel: str) -> str:
    return hashlib.sha1(f"{craft}:{status}:{channel}".encode("utf-8")).hexdigest()[:12]


async def _handle_message(payload: dict) -> None:
    text = (payload.get("text") or "").strip()
    if not text:
        return
    detected = _detect(text)
    if not detected:
        return
    craft, status = detected
    channel = str(payload.get("channel") or "?")
    now = _now()
    expires_at = now + timedelta(minutes=ACTIVE_TTL_MIN.get(craft, 60))
    if status == "landing":
        # Landing closes the threat — expire fast, but keep visible briefly
        # so the user knows the previous in-air event has ended.
        expires_at = now + timedelta(minutes=5)

    item = {
        "id": _make_id(craft, status, channel),
        "craft": craft,
        "craft_label": CRAFT_LABEL_UK.get(craft, craft),
        "status": status,
        "source_channel": channel,
        "detected_at": now.isoformat(),
        "expires_at": expires_at.isoformat(),
        "snippet": text[:200],
    }

    items, _ = _purge_expired(await _load_active(), now)
    # Replace any prior entry for same (craft, status, channel).
    items = [i for i in items if i.get("id") != item["id"]]
    items.append(item)
    await _save_active(items)

    redis = get_redis()
    await redis.publish(
        REDIS_CHANNEL,
        json.dumps({"type": "aviation_appeared", "item": item}, ensure_ascii=False),
    )
    log.info(
        "aviation: %s %s from @%s (expires %s)",
        item["craft_label"], status, channel, expires_at.strftime("%H:%M"),
    )


async def _ensure_group() -> None:
    redis = get_redis()
    try:
        await redis.xgroup_create(STREAM_RAW, CONSUMER_GROUP, id="0", mkstream=True)
        log.info("created consumer group %s on %s", CONSUMER_GROUP, STREAM_RAW)
    except Exception as e:
        if "BUSYGROUP" in str(e):
            return
        raise


async def _gc_loop(stop: asyncio.Event) -> None:
    """Drop expired entries from the active list even when no messages arrive."""
    while not stop.is_set():
        try:
            items, dropped = _purge_expired(await _load_active(), _now())
            if dropped:
                await _save_active(items)
                redis = get_redis()
                for d in dropped:
                    await redis.publish(
                        REDIS_CHANNEL,
                        json.dumps(
                            {"type": "aviation_expired", "id": d.get("id")},
                            ensure_ascii=False,
                        ),
                    )
                log.info("aviation: gc dropped %d entries", len(dropped))
        except Exception:
            log.exception("aviation gc failed")
        try:
            await asyncio.wait_for(stop.wait(), timeout=GC_INTERVAL_SEC)
        except asyncio.TimeoutError:
            continue


async def _consume_loop(stop: asyncio.Event) -> None:
    redis = get_redis()
    await _ensure_group()
    log.info("aviation_watcher consuming %s as group=%s", STREAM_RAW, CONSUMER_GROUP)
    while not stop.is_set():
        try:
            resp = await redis.xreadgroup(
                groupname=CONSUMER_GROUP,
                consumername=CONSUMER_NAME,
                streams={STREAM_RAW: ">"},
                count=64,
                block=5_000,
            )
        except Exception:
            log.exception("xreadgroup failed; backing off 2s")
            await asyncio.sleep(2)
            continue
        if not resp:
            continue
        for _stream, entries in resp:
            for entry_id, fields in entries:
                try:
                    raw = fields.get("data") or fields.get(b"data")
                    if isinstance(raw, bytes):
                        raw = raw.decode("utf-8")
                    if not raw:
                        continue
                    payload = json.loads(raw)
                    await _handle_message(payload)
                except Exception:
                    log.exception("failed to handle entry %s", entry_id)
                finally:
                    try:
                        await redis.xack(STREAM_RAW, CONSUMER_GROUP, entry_id)
                    except Exception:
                        log.exception("xack failed for %s", entry_id)


async def main() -> None:
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)
    try:
        await asyncio.gather(_consume_loop(stop), _gc_loop(stop))
    finally:
        log.info("aviation_watcher shutting down")
        await dispose()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(name)s [%(levelname)s] %(message)s",
    )
    asyncio.run(main())
