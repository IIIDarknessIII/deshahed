"""Message-to-event extractor with a 3-stage cascade:

  [1] local_extractor    pymorphy3 lemmas + Aho-Corasick gazetteer
                         covers ~70-85% of straightforward TG phrases
                         for free, in milliseconds, no network call.
  [2] OpenRouter FREE    cycles through every model on OpenRouter whose
                         pricing.prompt == pricing.completion == "0" at
                         startup (or one explicit OPENROUTER_FREE_MODEL).
                         A 5-minute cooldown skips models that just
                         returned 402/429/5xx so we don't waste calls.
  [3] OpenRouter PAID    only kicks in when every available free model
                         is on cooldown or has failed.

Common downstream: geocoder.resolve() → drone_events row → publish
DroneAppearedMessage on `drones:updates` for the WS broadcaster.

Refuses to start if OPENROUTER_API_KEY is empty (all tiers share it).
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import signal
from datetime import datetime, timedelta, timezone

import time

import httpx
from geoalchemy2.shape import from_shape
from openai import AsyncOpenAI
from pydantic import ValidationError
from shapely.geometry import Point
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db import dispose, get_redis, get_session_factory
from app.geocoder import resolve as geocode_resolve
from app.models import DroneEvent
from app.schemas.drones import DroneAppearedMessage, DroneEventView, LLMEvent, LLMResponse

import pymorphy3

from .gazetteer import load_gazetteer
from .local_extractor import LocalExtraction, LocalExtractor

log = logging.getLogger("llm_extractor")

STREAM_RAW = "messages_raw"
STREAM_DLQ = "messages_dlq"
CONSUMER_GROUP = "llm-extractor"
PUBSUB_CHANNEL = "drones:updates"

CACHE_PREFIX = "llm:cache:"
CACHE_TTL_SEC = 24 * 3600

TTL_MIN = 15

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_PAID_MODEL = "openai/gpt-4o-mini"
FREE_MODEL_COOLDOWN_SEC = 300  # 5 minutes after a hard failure

# Counters reported once a minute so the cascade savings are observable.
_stats = {"local": 0, "free": 0, "paid": 0, "free_failed": 0, "paid_failed": 0}


class FreeModelRing:
    """Rotating list of OpenRouter free-tier models with per-model cooldown.

    A model that returns 402 (spend cap), 429 (rate limit) or 5xx is parked
    for FREE_MODEL_COOLDOWN_SEC; meanwhile the ring serves the next one. If
    every model is on cooldown the caller falls through to the paid tier.
    """

    def __init__(self, models: list[str]) -> None:
        self.models = list(models)
        self._fail_at: dict[str, float] = {}

    def available(self) -> list[str]:
        now = time.monotonic()
        return [
            m for m in self.models
            if (now - self._fail_at.get(m, 0.0)) > FREE_MODEL_COOLDOWN_SEC
        ]

    def mark_failed(self, model: str) -> None:
        self._fail_at[model] = time.monotonic()

    def mark_success(self, model: str) -> None:
        self._fail_at.pop(model, None)


async def discover_free_models() -> list[str]:
    """Fetch OpenRouter /models, return ids whose pricing.prompt and
    pricing.completion are both "0" (i.e. genuinely no-cost). Falls back
    to an empty list on network error — the caller can decide what to do."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as h:
            resp = await h.get(f"{OPENROUTER_BASE_URL}/models")
            resp.raise_for_status()
            body = resp.json()
    except Exception:
        log.exception("discover_free_models: /models fetch failed")
        return []

    out: list[str] = []
    for m in body.get("data") or []:
        pricing = m.get("pricing") or {}
        if pricing.get("prompt") == "0" and pricing.get("completion") == "0":
            mid = m.get("id")
            if mid:
                out.append(mid)
    return out

SYSTEM_PROMPT = """\
Ти парсер повідомлень про повітряні загрози в Україні.
На вхід — текст з Telegram-каналу.
На вихід — суворий JSON без markdown-обрамлення.

Формат:
{
  "events": [
    {
      "type": "shahed" | "missile" | "kab" | "aviation" | "unknown",
      "location": "назва населеного пункту або району як у тексті",
      "direction": "назва наступного пункту якщо вказана, інакше null",
      "count": число БпЛА якщо вказано, інакше 1,
      "confidence": "high" | "medium" | "low"
    }
  ]
}

Правила:
1. Якщо повідомлення не про повітряні цілі — повернути {"events": []}
2. Одне повідомлення може описувати декілька БпЛА — розбий на окремі events.
3. confidence=low якщо формулювання розмите ("десь на Полтавщині").
4. НЕ вигадуй координати — лише текст локації.
5. Враховуй українську, російську, англійську мови.
"""


def _hash_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


async def _ensure_group(redis) -> None:
    try:
        await redis.xgroup_create(STREAM_RAW, CONSUMER_GROUP, id="0", mkstream=True)
        log.info("created consumer group %s on %s", CONSUMER_GROUP, STREAM_RAW)
    except Exception as e:
        # BUSYGROUP means the group already exists — totally fine.
        if "BUSYGROUP" not in str(e):
            raise


async def _call_llm(client: AsyncOpenAI, model: str, text: str) -> LLMResponse:
    resp = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
        response_format={"type": "json_object"},
        temperature=0.1,
        max_tokens=800,
    )
    content = resp.choices[0].message.content or "{}"
    data = json.loads(content)
    return LLMResponse.model_validate(data)


async def _try_llm_with_retry(
    client: AsyncOpenAI, model: str, text: str
) -> LLMResponse:
    try:
        return await _call_llm(client, model, text)
    except (json.JSONDecodeError, ValidationError):
        log.warning("LLM %s returned invalid JSON; retrying once", model)
        return await _call_llm(client, model, text)


async def _extract_with_cache(
    client: AsyncOpenAI,
    free_ring: FreeModelRing,
    paid_model: str,
    text: str,
    redis,
    local: LocalExtractor,
) -> LLMResponse:
    h = _hash_text(text)
    cached = await redis.get(CACHE_PREFIX + h)
    if cached:
        return LLMResponse.model_validate_json(cached)

    # Tier 1: local
    local_result: LocalExtraction = local.extract(text)
    if local_result.confident:
        _stats["local"] += 1
        log.debug("local hit (%s): %d event(s)", local_result.reason, len(local_result.events))
        result = LLMResponse(events=local_result.events)
        await redis.set(CACHE_PREFIX + h, result.model_dump_json(), ex=CACHE_TTL_SEC)
        return result

    # Tier 2: iterate free models until one succeeds.
    for model in free_ring.available():
        try:
            result = await _try_llm_with_retry(client, model, text)
            free_ring.mark_success(model)
            _stats["free"] += 1
            log.debug("free LLM (%s) used: %d event(s)", model, len(result.events))
            await redis.set(CACHE_PREFIX + h, result.model_dump_json(), ex=CACHE_TTL_SEC)
            return result
        except Exception as e:
            free_ring.mark_failed(model)
            _stats["free_failed"] += 1
            log.warning("free model %s failed: %s", model, str(e)[:200])
            continue

    # Tier 3: paid LLM (last resort).
    result = await _try_llm_with_retry(client, paid_model, text)
    _stats["paid"] += 1
    log.debug("paid LLM (%s) used: %d event(s)", paid_model, len(result.events))
    await redis.set(CACHE_PREFIX + h, result.model_dump_json(), ex=CACHE_TTL_SEC)
    return result


async def _persist_and_publish(
    event: LLMEvent,
    *,
    raw_text: str,
    raw_payload: dict,
    source_channel: str,
    source_message_id: int,
    detected_at: datetime,
) -> None:
    factory = get_session_factory()
    redis = get_redis()

    async with factory() as session:
        loc = await geocode_resolve(event.location, session)
        if not loc.found:
            log.info(
                "skipping event with unresolved location channel=%s msgid=%s loc=%r",
                source_channel, source_message_id, event.location,
            )
            return

        direction = None
        if event.direction:
            direction = await geocode_resolve(event.direction, session)

        expires_at = detected_at + timedelta(minutes=TTL_MIN)
        loc_point = from_shape(Point(loc.lon, loc.lat), srid=4326)
        dir_point = (
            from_shape(Point(direction.lon, direction.lat), srid=4326)
            if direction and direction.found
            else None
        )

        stmt = (
            pg_insert(DroneEvent)
            .values(
                source_channel=source_channel,
                source_message_id=source_message_id,
                event_type=event.type,
                location_text=event.location,
                direction_text=event.direction,
                location_point=loc_point,
                direction_point=dir_point,
                confidence=event.confidence,
                raw_text=raw_text,
                raw_payload=raw_payload,
                detected_at=detected_at,
                expires_at=expires_at,
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
            # Conflict: this exact (channel, message_id) already produced an event — skip.
            return

        view = DroneEventView(
            id=new_id,
            event_type=event.type,
            location_text=event.location,
            direction_text=event.direction,
            location_lat=loc.lat,
            location_lon=loc.lon,
            direction_lat=direction.lat if direction and direction.found else None,
            direction_lon=direction.lon if direction and direction.found else None,
            confidence=event.confidence,
            source_channel=source_channel,
            detected_at=detected_at,
            expires_at=expires_at,
        )
        msg = DroneAppearedMessage(drone=view)
        await redis.publish(PUBSUB_CHANNEL, msg.model_dump_json())


async def _handle_message(
    msg_id: str,
    fields: dict,
    *,
    client: AsyncOpenAI,
    free_ring: FreeModelRing,
    paid_model: str,
    redis,
    local: LocalExtractor,
) -> bool:
    """Returns True on successful processing (incl. empty events), False to DLQ."""
    raw = fields.get("data") or fields.get(b"data")
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    if not raw:
        return False
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return False

    text = payload.get("text") or ""
    if not text.strip():
        return True  # empty input → nothing to do; ack and move on

    source_channel = payload.get("channel", "unknown")
    source_message_id = int(payload.get("message_id", 0))
    detected_at_raw = payload.get("date")
    detected_at = (
        datetime.fromisoformat(detected_at_raw.replace("Z", "+00:00"))
        if detected_at_raw
        else datetime.now(timezone.utc)
    )

    try:
        extracted = await _extract_with_cache(
            client, free_ring, paid_model, text, redis, local
        )
    except Exception:
        _stats["paid_failed"] += 1
        log.exception("extraction failed (local + free + paid) for msg=%s", msg_id)
        return False

    if not extracted.events:
        return True

    for ev in extracted.events:
        try:
            await _persist_and_publish(
                ev,
                raw_text=text,
                raw_payload=payload,
                source_channel=source_channel,
                source_message_id=source_message_id,
                detected_at=detected_at,
            )
        except Exception:
            log.exception("persist/publish failed for event %r", ev)
            # don't DLQ on partial failures — the LLM result is fine,
            # this is downstream and retriable on next run if needed.
    return True


async def _run(stop: asyncio.Event) -> None:
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        log.error("OPENROUTER_API_KEY is not set; refusing to start")
        raise SystemExit(2)

    # OPENROUTER_MODEL stays as the legacy alias for OPENROUTER_PAID_MODEL.
    paid_model = (
        os.environ.get("OPENROUTER_PAID_MODEL")
        or os.environ.get("OPENROUTER_MODEL")
        or DEFAULT_PAID_MODEL
    ).strip()

    # If the user pinned a specific free model, honor that. Otherwise
    # auto-discover the full list from /models.
    pinned_free = os.environ.get("OPENROUTER_FREE_MODEL", "").strip()
    if pinned_free:
        free_models = [pinned_free]
        log.info("llm_extractor: pinned free model %s", pinned_free)
    else:
        free_models = await discover_free_models()
        if free_models:
            log.info("llm_extractor: discovered %d free models from OpenRouter", len(free_models))
        else:
            log.warning(
                "llm_extractor: no free models discovered — every punt will go straight to paid (%s)",
                paid_model,
            )
    free_ring = FreeModelRing(free_models)
    log.info("llm_extractor starting; free=%d models, paid=%s", len(free_models), paid_model)

    client = AsyncOpenAI(
        base_url=OPENROUTER_BASE_URL,
        api_key=api_key,
        default_headers={
            # HTTP headers must be ASCII (RFC 7230); IDN domain → punycode.
            "HTTP-Referer": "https://xn----8sbkccc5iwa.online",
            "X-Title": "deshahed",
        },
        timeout=20.0,
    )
    redis = get_redis()
    await _ensure_group(redis)
    consumer_name = f"worker-{os.getpid()}"

    # One MorphAnalyzer instance, shared with the gazetteer for form expansion
    # and with the extractor at runtime for type-keyword lemmatization.
    morph = pymorphy3.MorphAnalyzer(lang="uk")
    factory = get_session_factory()
    async with factory() as session:
        gazetteer = await load_gazetteer(session, morph)
    local = LocalExtractor(gazetteer, morph)
    log.info("local extractor ready")

    last_stat_at = time.monotonic()

    while not stop.is_set():
        try:
            entries = await redis.xreadgroup(
                CONSUMER_GROUP,
                consumer_name,
                {STREAM_RAW: ">"},
                count=8,
                block=5000,
            )
        except Exception:
            log.exception("xreadgroup failed; sleeping")
            await asyncio.wait_for(stop.wait(), timeout=2.0)
            continue

        # periodic cascade-usage stat
        if time.monotonic() - last_stat_at > 60:
            log.info("cascade stats: %s", _stats)
            last_stat_at = time.monotonic()

        if not entries:
            continue

        for _, msgs in entries:
            for msg_id, fields in msgs:
                ok = await _handle_message(
                    msg_id, fields,
                    client=client, free_ring=free_ring, paid_model=paid_model,
                    redis=redis, local=local,
                )
                if ok:
                    await redis.xack(STREAM_RAW, CONSUMER_GROUP, msg_id)
                else:
                    raw = fields.get("data") or fields.get(b"data")
                    if isinstance(raw, bytes):
                        raw = raw.decode("utf-8")
                    await redis.xadd(STREAM_DLQ, {"data": raw or ""})
                    await redis.xack(STREAM_RAW, CONSUMER_GROUP, msg_id)
                    log.warning("moved msg=%s to %s", msg_id, STREAM_DLQ)


async def main() -> None:
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)
    try:
        await _run(stop)
    finally:
        log.info("llm_extractor shutting down")
        await dispose()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(name)s [%(levelname)s] %(message)s",
    )
    asyncio.run(main())
