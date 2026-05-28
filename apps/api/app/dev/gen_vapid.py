"""One-off VAPID keypair generator.

Run inside the api container:
    docker compose -f infra/docker-compose.yml --env-file .env \
        exec -T api python -m app.dev.gen_vapid

Copy VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY into .env and rebuild api.
"""
from __future__ import annotations

import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def main() -> None:
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()

    # WebPush expects raw 32-byte private + uncompressed 65-byte public, base64url.
    raw_priv = private_key.private_numbers().private_value.to_bytes(32, "big")
    raw_pub = public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )

    print("# Add these two lines to .env (and the existing subject if needed):")
    print(f"VAPID_PUBLIC_KEY={_b64url(raw_pub)}")
    print(f"VAPID_PRIVATE_KEY={_b64url(raw_priv)}")
    print("VAPID_SUBJECT=mailto:noreply@xn----8sbkccc5iwa.online")


if __name__ == "__main__":
    main()
