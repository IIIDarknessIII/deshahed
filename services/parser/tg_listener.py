"""tg_listener — long-running Telethon user-client that pushes new TG channel
messages into Redis Stream `messages_raw`. The LLM extractor downstream
picks them up.

Antiban rules baked in per TZ section 2.4:
  - read-only: never sends, replies, likes, joins, or marks read
  - subscribes only to public channels listed in TG_CHANNELS (csv env)
  - one resilient connection; reconnects through Telethon's own auto-retry

The session file lives in /sessions/ which is a named Docker volume so it
survives container rebuilds. First-time login is a separate one-shot:
    docker compose ... run -it --rm --no-deps tg_listener python -m parser.tg_auth
After that, this listener can run unattended.

Refuses to start if API_ID/API_HASH or TG_CHANNELS are missing.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
from pathlib import Path

import redis.asyncio as aioredis
from telethon import TelegramClient, events

log = logging.getLogger("tg_listener")

SESSION_DIR = Path(os.environ.get("TG_SESSION_DIR", "/sessions"))
SESSION_PATH = SESSION_DIR / "main"

REDIS_URL_ENV = "REDIS_URL"
STREAM_RAW = "messages_raw"


def _parse_channels(raw: str) -> list[str]:
    return [c.strip() for c in raw.split(",") if c.strip()]


async def _run(stop: asyncio.Event) -> None:
    api_id_raw = os.environ.get("TELEGRAM_API_ID", "").strip()
    api_hash = os.environ.get("TELEGRAM_API_HASH", "").strip()
    channels_raw = os.environ.get("TG_CHANNELS", "").strip()

    if not api_id_raw or not api_hash:
        log.error("TELEGRAM_API_ID / TELEGRAM_API_HASH not set; refusing to start")
        raise SystemExit(2)
    channels = _parse_channels(channels_raw)
    if not channels:
        log.error("TG_CHANNELS is empty; refusing to start (no channels to listen to)")
        raise SystemExit(2)

    SESSION_DIR.mkdir(parents=True, exist_ok=True)
    if not SESSION_PATH.with_suffix(".session").exists():
        log.error(
            "no session file at %s.session — run `python -m parser.tg_auth` "
            "interactively first to authorize", SESSION_PATH,
        )
        raise SystemExit(2)

    try:
        api_id = int(api_id_raw)
    except ValueError:
        log.error("TELEGRAM_API_ID must be an integer")
        raise SystemExit(2)

    redis_url = os.environ.get(REDIS_URL_ENV, "redis://redis:6379/0")
    redis = aioredis.from_url(redis_url, decode_responses=False)

    client = TelegramClient(str(SESSION_PATH), api_id, api_hash)
    log.info("connecting telethon, requested channels=%s", channels)

    async def handler(event):
        chat = await event.get_chat()
        username = getattr(chat, "username", None) or str(getattr(chat, "id", ""))
        text = event.message.text or ""
        payload = {
            "channel": username,
            "message_id": event.id,
            "text": text,
            "date": event.message.date.isoformat(),
        }
        try:
            await redis.xadd(
                STREAM_RAW, {"data": json.dumps(payload, ensure_ascii=False)}
            )
            log.info(
                "msg from @%s id=%s len=%d → %s",
                username, event.id, len(text), STREAM_RAW,
            )
        except Exception:
            log.exception("failed to xadd; message dropped: @%s id=%s", username, event.id)

    await client.start()
    log.info("connected as %s", await client.get_me())

    # Resolve each requested channel — skip the ones that don't exist /
    # aren't accessible by this account, so a single typo in TG_CHANNELS
    # doesn't take down the whole listener.
    valid: list[str] = []
    for ch in channels:
        try:
            entity = await client.get_entity(ch)
            valid.append(ch)
            log.info("subscribed: @%s (id=%s)", ch, getattr(entity, "id", "?"))
        except Exception as e:
            log.warning("skipping channel @%s: %s", ch, str(e)[:200])

    if not valid:
        log.error("no resolvable channels in TG_CHANNELS=%s — exiting", channels)
        raise SystemExit(2)

    client.add_event_handler(handler, events.NewMessage(chats=valid))

    stop_task = asyncio.create_task(stop.wait())
    disconnect_task = asyncio.create_task(client.run_until_disconnected())
    try:
        done, _ = await asyncio.wait(
            {stop_task, disconnect_task}, return_when=asyncio.FIRST_COMPLETED
        )
    finally:
        await client.disconnect()
        await redis.aclose()


async def main() -> None:
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)
    try:
        await _run(stop)
    finally:
        log.info("tg_listener shutting down")


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(name)s [%(levelname)s] %(message)s",
    )
    asyncio.run(main())
