"""One-shot interactive Telethon authorization.

Telethon stores the session in /sessions/main.session inside the container —
which the compose tg_session named volume keeps across restarts/rebuilds.

How to use:
    docker compose -f infra/docker-compose.yml --env-file .env \
        run -it --rm --no-deps tg_listener python -m parser.tg_auth

It will prompt for:
  1. phone number (with country code, e.g. +380...)
  2. verification code received via Telegram
  3. 2FA password (if enabled on the account)

After it prints "Authorized as ...", the session file is on disk and the
regular `docker compose ... --profile with-tg up -d tg_listener` will run
unattended.
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys
from pathlib import Path

from telethon import TelegramClient

log = logging.getLogger("tg_auth")

SESSION_DIR = Path(os.environ.get("TG_SESSION_DIR", "/sessions"))
SESSION_PATH = SESSION_DIR / "main"


async def amain() -> int:
    api_id_raw = os.environ.get("TELEGRAM_API_ID", "").strip()
    api_hash = os.environ.get("TELEGRAM_API_HASH", "").strip()
    if not api_id_raw or not api_hash:
        print(
            "ERROR: TELEGRAM_API_ID and TELEGRAM_API_HASH must be set in .env "
            "(get them at https://my.telegram.org → API development tools)",
            file=sys.stderr,
        )
        return 2

    try:
        api_id = int(api_id_raw)
    except ValueError:
        print("ERROR: TELEGRAM_API_ID must be an integer", file=sys.stderr)
        return 2

    SESSION_DIR.mkdir(parents=True, exist_ok=True)

    client = TelegramClient(str(SESSION_PATH), api_id, api_hash)
    await client.connect()
    if await client.is_user_authorized():
        me = await client.get_me()
        print(f"already authorized as {me.first_name} (@{me.username or '?'}, id={me.id})")
        await client.disconnect()
        return 0

    # Will prompt interactively for phone, code, optional 2FA.
    await client.start()
    me = await client.get_me()
    print(f"authorized as {me.first_name} (@{me.username or '?'}, id={me.id})")
    print(f"session saved at {SESSION_PATH}.session")
    await client.disconnect()
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s [%(levelname)s] %(message)s")
    sys.exit(asyncio.run(amain()))
