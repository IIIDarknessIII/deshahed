"""LLM extractor — consumes raw TG messages from Redis Stream `messages_raw`,
asks OpenRouter (OpenAI-compatible API) to turn each into structured events,
geocodes every event's location/direction, writes drone_events rows, and
publishes appearances on the `drones:updates` pub/sub channel.

Flow per TZ section 2.5:
  1. xreadgroup messages_raw with consumer group "llm-extractor"
  2. hash(text) → if cached structured JSON in Redis, skip LLM
  3. else POST to OpenRouter with strict JSON response_format
  4. validate against LLMResponse pydantic schema; retry once on parse fail,
     then push to messages_dlq stream + ack
  5. for each LLMEvent: geocoder.resolve(location), geocoder.resolve(direction);
     skip if location couldn't be resolved
  6. INSERT into drone_events (ON CONFLICT DO NOTHING by source_channel +
     source_message_id) → expires_at = detected_at + 15min
  7. publish DroneAppearedMessage to drones:updates

Refuses to start if OPENROUTER_API_KEY is empty.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import signal
from datetime import datetime, timedelta, timezone

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

log = logging.getLogger("llm_extractor")

STREAM_RAW = "messages_raw"
STREAM_DLQ = "messages_dlq"
CONSUMER_GROUP = "llm-extractor"
PUBSUB_CHANNEL = "drones:updates"

CACHE_PREFIX = "llm:cache:"
CACHE_TTL_SEC = 24 * 3600

TTL_MIN = 15

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "openai/gpt-4o-mini"

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


async def _extract_with_cache(
    client: AsyncOpenAI, model: str, text: str, redis
) -> LLMResponse:
    h = _hash_text(text)
    cached = await redis.get(CACHE_PREFIX + h)
    if cached:
        return LLMResponse.model_validate_json(cached)

    try:
        result = await _call_llm(client, model, text)
    except (json.JSONDecodeError, ValidationError):
        # one retry
        log.warning("LLM returned invalid JSON; retrying once")
        result = await _call_llm(client, model, text)

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
    model: str,
    redis,
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
        extracted = await _extract_with_cache(client, model, text, redis)
    except Exception:
        log.exception("LLM extraction failed twice for msg=%s", msg_id)
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

    model = os.environ.get("OPENROUTER_MODEL", DEFAULT_MODEL)
    log.info("llm_extractor starting; model=%s", model)

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
        if not entries:
            continue

        for _, msgs in entries:
            for msg_id, fields in msgs:
                ok = await _handle_message(
                    msg_id, fields, client=client, model=model, redis=redis
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
