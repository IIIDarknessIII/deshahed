"""One-shot interactive Telethon authorization.

Two modes:

  QR (recommended)
      docker compose ... run -it --rm --no-deps tg_listener python -m parser.tg_auth --qr
      Prints a QR token in the terminal. Open Telegram on any device:
        Settings → Devices → Link Desktop Device → scan
      The session is granted instantly — no phone code, no SMS.

  Phone code (legacy)
      docker compose ... run -it --rm --no-deps tg_listener python -m parser.tg_auth
      Prompts for phone, then for the 5-digit code Telegram sends to your
      existing app session. Telegram has gotten flaky about delivering this
      to brand-new clients — use --qr if it stalls.

Session is saved at /sessions/main.session (compose tg_session named volume).
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from getpass import getpass
from pathlib import Path

import qrcode
from telethon import TelegramClient
from telethon.errors import SessionPasswordNeededError

log = logging.getLogger("tg_auth")

SESSION_DIR = Path(os.environ.get("TG_SESSION_DIR", "/sessions"))
SESSION_PATH = SESSION_DIR / "main"


def _render_qr(url: str) -> None:
    qr = qrcode.QRCode(border=2)
    qr.add_data(url)
    qr.make()
    qr.print_ascii(invert=True)
    print(f"  or open this link inside Telegram: {url}")
    print()


async def _qr_flow(client: TelegramClient) -> None:
    print("\nQR auth — open Telegram → Settings → Devices → Link Desktop Device → scan:\n")
    qr_login = await client.qr_login()
    _render_qr(qr_login.url)
    while True:
        try:
            await qr_login.wait(timeout=60)
            return
        except asyncio.TimeoutError:
            print("QR expired, regenerating…")
            await qr_login.recreate()
            _render_qr(qr_login.url)
        except SessionPasswordNeededError:
            pw = getpass("2FA password: ")
            await client.sign_in(password=pw)
            return


async def _phone_flow(client: TelegramClient) -> None:
    phone = input("phone (with country code, e.g. +380...): ").strip()
    sent = await client.send_code_request(phone)
    sent_type = sent.type.__class__.__name__
    next_type = sent.next_type.__class__.__name__ if sent.next_type else None
    print(f"send_code_request → type={sent_type}, next_type={next_type}")
    code = input("code: ").strip()
    try:
        await client.sign_in(phone=phone, code=code)
    except SessionPasswordNeededError:
        pw = getpass("2FA password: ")
        await client.sign_in(password=pw)


async def amain() -> int:
    p = argparse.ArgumentParser(prog="tg_auth")
    p.add_argument("--qr", action="store_true", help="Use QR-code login instead of phone-code prompt.")
    args = p.parse_args()

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

    if args.qr:
        await _qr_flow(client)
    else:
        await _phone_flow(client)

    me = await client.get_me()
    print(f"authorized as {me.first_name} (@{me.username or '?'}, id={me.id})")
    print(f"session saved at {SESSION_PATH}.session")
    await client.disconnect()
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s [%(levelname)s] %(message)s")
    sys.exit(asyncio.run(amain()))
