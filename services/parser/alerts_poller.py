"""alerts_poller — the single alert engine that mirrors live siren state into
Redis + Postgres by merging two upstreams:

  • alerts.in.ua /v1/alerts/active.json — polled every POLL_INTERVAL_SEC. The
    source of truth for sub-oblast granularity (raion / hromada / city) and the
    month-long history. Always on (requires ALERTS_API_TOKEN).

  • ukrainealarm.com /api/v3/alerts — oblast-level only, refreshed *on demand*
    when the webhook receiver (app.routes.ua_webhook) publishes a `ua:kick`, plus
    a slow status-gated safety poll. Gives near-instant oblast starts without
    polling pressure. Optional (enabled when UA_API_TOKEN + UA_WEBHOOK_URL set).

Merge is a **union by (location_uid, alert_type)**: an alert is present while
*either* source reports it active, and only retracts when *both* drop it. So a
ukrainealarm webhook lights an oblast up immediately, and nothing is cleared
early while the other source catches up — no status flapping, and a single
writer means no two-writer races. The alerts.in.ua oblast uids are shared
(see app.ua_crosswalk) so the two sources collapse to one key per oblast alert.

On each recompute we diff the merged set against Redis `alerts:current`:
    new key → INSERT alert_events; PUBLISH alert_started
    gone key → UPDATE alert_events.finished_at; PUBLISH alert_ended
The WS endpoint at /api/v1/ws/alerts is the only consumer of these Redis keys.
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
from app.ua_crosswalk import (
    build_crosswalk,
    fetch_alerts as ua_fetch_alerts,
    fetch_regions as ua_fetch_regions,
    fetch_status as ua_fetch_status,
    map_alert_type as ua_map_alert_type,
    normalize_alerts as ua_normalize_alerts,
    subscribe_webhook as ua_subscribe_webhook,
)

log = logging.getLogger("alerts_poller")

ALERTS_URL = "https://api.alerts.in.ua/v1/alerts/active.json"
POLL_INTERVAL_SEC = 5.0
HTTP_TIMEOUT_SEC = 4.0
BACKOFF_MAX_SEC = 60.0

# ukrainealarm rate-limits *aggressively* (sustained polling earns a 401
# throttle that extends on every further request), so UA traffic must stay
# near-zero in steady state. The webhook *is* the signal: callbacks are applied
# directly to the snapshot (zero HTTP), and these poll cadences are only a rare
# reconciliation backstop for missed callbacks.
UA_SAFETY_POLL_SEC = 180.0         # lightweight /alerts/status ping cadence
UA_FORCED_REFRESH_SEC = 600.0      # backstop full /alerts refetch
UA_STARTUP_SPACING_SEC = 2.0       # gap between startup requests
UA_SETUP_RETRY_SEC = 30.0          # retry cadence while UA cold-start is throttled
UA_REQUEST_SPACING_SEC = 1.2       # gap between back-to-back UA requests (~1 req/s limit)

REDIS_KEY_CURRENT = "alerts:current"
REDIS_CHANNEL_UPDATES = "alerts:updates"
# Kept in sync with app.routes.ua_webhook.UA_KICK_CHANNEL.
UA_KICK_CHANNEL = "ua:kick"


def _alert_key(a: dict) -> tuple[int, str]:
    return (int(a["location_uid"]), a["alert_type"])


def _normalize(a: dict) -> dict:
    """Trim an alerts.in.ua alert object to what our WS / DB layers care about.

    Includes `location_oblast` + `location_oblast_uid` even when the alert is
    fired at hromada / raion / city level — without this, the frontend can't
    light up the parent oblast on the map (we have no sub-oblast geometry).
    """
    return {
        "location_uid": int(a["location_uid"]),
        "location_title": a["location_title"],
        "location_type": a["location_type"],
        "alert_type": a["alert_type"],
        "started_at": a["started_at"],
        "finished_at": a.get("finished_at"),
        "location_oblast": a.get("location_oblast") or a["location_title"],
        "location_oblast_uid": int(a["location_oblast_uid"])
            if a.get("location_oblast_uid") is not None
            else int(a["location_uid"]),
        "notes": a.get("notes") or None,
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
                    location_oblast=a.get("location_oblast", a["location_title"]),
                    location_oblast_uid=int(a.get("location_oblast_uid", a["location_uid"])),
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


class AlertEngine:
    """Holds the two upstream snapshots and merges them into Redis/Postgres."""

    def __init__(self, aiu_token: str, ua_token: str, ua_webhook_url: str) -> None:
        self.aiu_token = aiu_token
        self.ua_token = ua_token
        self.ua_webhook_url = ua_webhook_url
        self.ua_enabled = bool(ua_token and ua_webhook_url)  # configured
        self.ua_ready = False  # crosswalk built + webhook subscribed

        self.aiu: list[dict] = []
        # UA oblast snapshot kept as {(uid, alert_type): entry} for O(1)
        # incremental webhook mutation; serialized to a list at merge time.
        self.ua: dict[tuple[int, str], dict] = {}
        self.crosswalk: dict[str, dict] = {}
        self.ua_status: str | None = None
        self._ua_last_status = 0.0
        self._ua_last_forced = 0.0
        # Webhook modifications queued by the kick listener, drained in the loop
        # so all snapshot mutation stays single-threaded.
        self._pending_mods: list[dict] = []

        self._kick = asyncio.Event()
        self._kick_task: asyncio.Task | None = None
        self._setup_task: asyncio.Task | None = None

    # ---- ukrainealarm side ------------------------------------------------

    async def _do_refresh(self, client: httpx.AsyncClient) -> None:
        """Pull ukrainealarm /alerts and rebuild the UA oblast snapshot wholesale.

        This is the reconciliation path (startup + safety/forced poll), not the
        hot path — webhook modifications keep the snapshot live in between. On
        failure we keep the last snapshot rather than dropping to empty.
        """
        try:
            regions_alerts = await ua_fetch_alerts(client, self.ua_token)
            entries = ua_normalize_alerts(regions_alerts, self.crosswalk)
            self.ua = {_alert_key(a): a for a in entries}
        except Exception:
            log.exception("ua: /alerts refetch failed; keeping last snapshot (%d)", len(self.ua))

    def _apply_ua_mod(self, mod: dict) -> bool:
        """Apply one webhook modification to the in-memory UA snapshot.

        Callback shape: {"status":"Activate"|"DEACTIVATE", "regionId":<int>,
        "alarmType":"AIR", "createdAt":"<iso>"}. Sub-region ids (not in the
        oblast crosswalk) are ignored — alerts.in.ua owns those.
        Returns True if the snapshot changed.
        """
        region_id = mod.get("regionId")
        if region_id is None:
            return False
        entry = self.crosswalk.get(str(region_id))
        if entry is None:
            return False  # sub-region / unknown — handled by the alerts.in.ua poller
        alert_type = ua_map_alert_type(mod.get("alarmType") or mod.get("alertType"))
        key = (entry["location_uid"], alert_type)
        active = str(mod.get("status", "")).strip().lower().startswith("activate")
        if active:
            self.ua[key] = {
                "location_uid": entry["location_uid"],
                "location_title": entry["location_title"],
                "location_type": entry["location_type"],
                "alert_type": alert_type,
                "started_at": mod.get("createdAt")
                    or datetime.now(timezone.utc).isoformat(),
                "finished_at": None,
                "location_oblast": entry["location_oblast"],
                "location_oblast_uid": entry["location_oblast_uid"],
                "notes": None,
            }
            return True
        return self.ua.pop(key, None) is not None

    def _drain_pending(self) -> bool:
        mods, self._pending_mods = self._pending_mods, []
        changed = False
        for mod in mods:
            try:
                changed = self._apply_ua_mod(mod) or changed
            except Exception:
                log.exception("ua: failed to apply webhook mod %r", mod)
        return changed

    async def _service_ua_poll(self, client: httpx.AsyncClient) -> None:
        """Rare reconciliation poll (timer only) — never on the webhook path.

        A forced full refetch every UA_FORCED_REFRESH_SEC, otherwise a
        status-gated refetch at most every UA_SAFETY_POLL_SEC. One request,
        well within ukrainealarm's rate limit.
        """
        if not self.ua_ready:
            return
        now = asyncio.get_event_loop().time()
        if now - self._ua_last_forced >= UA_FORCED_REFRESH_SEC:
            self._ua_last_forced = now
            self._ua_last_status = now
            await self._do_refresh(client)
            return
        if now - self._ua_last_status >= UA_SAFETY_POLL_SEC:
            self._ua_last_status = now
            try:
                status = await ua_fetch_status(client, self.ua_token)
            except Exception:
                log.exception("ua: /alerts/status ping failed")
                return
            if status != self.ua_status:
                self.ua_status = status
                # Space the follow-up /alerts off the status ping — back-to-back
                # calls occasionally trip ukrainealarm's ~1-req/s limit.
                await asyncio.sleep(UA_REQUEST_SPACING_SEC)
                await self._do_refresh(client)

    async def _kick_listener(self) -> None:
        redis = get_redis()
        pubsub = redis.pubsub()
        await pubsub.subscribe(UA_KICK_CHANNEL)
        try:
            async for msg in pubsub.listen():
                if msg.get("type") != "message":
                    continue
                data = msg.get("data")
                if isinstance(data, bytes):
                    data = data.decode("utf-8")
                try:
                    env = json.loads(data)
                    payload = env.get("payload") if isinstance(env, dict) else None
                except Exception:
                    payload = None
                if isinstance(payload, dict):
                    self._pending_mods.append(payload)
                elif isinstance(payload, list):
                    self._pending_mods.extend(p for p in payload if isinstance(p, dict))
                self._kick.set()
        except asyncio.CancelledError:
            pass
        except Exception:
            log.exception("ua kick listener crashed")
        finally:
            try:
                await pubsub.unsubscribe(UA_KICK_CHANNEL)
                await pubsub.aclose()
            except Exception:
                log.exception("ua kick listener cleanup failed")

    # ---- merge ------------------------------------------------------------

    def _merge(self) -> list[dict]:
        # alerts.in.ua entries win on key collisions — they carry the fuller
        # payload (notes for drone escalation, sub-oblast titles). ukrainealarm
        # only fills oblast keys the poller hasn't observed yet.
        by_key: dict[tuple[int, str], dict] = {}
        for a in self.aiu:
            by_key[_alert_key(a)] = a
        for key, a in self.ua.items():
            by_key.setdefault(key, a)
        return list(by_key.values())

    async def _recompute(self) -> None:
        merged = self._merge()
        raw_by_key: dict[tuple[int, str], Any] = {_alert_key(a): a for a in merged}

        prev = await _read_prev()
        prev_keys = {_alert_key(a) for a in prev}
        curr_keys = set(raw_by_key.keys())

        started = [a for a in merged if _alert_key(a) in (curr_keys - prev_keys)]
        ended = [a for a in prev if _alert_key(a) in (prev_keys - curr_keys)]

        if started or ended:
            log.info("diff: +%d started, -%d ended (aiu=%d ua=%d)",
                     len(started), len(ended), len(self.aiu), len(self.ua))
            await _persist_and_publish(started, ended, raw_by_key)

        await get_redis().set(REDIS_KEY_CURRENT, json.dumps(merged, ensure_ascii=False))

    # ---- lifecycle --------------------------------------------------------

    async def startup(self, client: httpx.AsyncClient) -> None:
        # alerts.in.ua first — it must go live immediately and never be blocked
        # by ukrainealarm setup (which may be throttled at cold start).
        try:
            self.aiu = await _fetch_active(client, self.aiu_token)
            await self._recompute()
        except Exception:
            log.exception("initial alerts.in.ua fetch failed; loop will retry")

        if self.ua_enabled:
            # Self-healing: build crosswalk + subscribe in the background,
            # retrying until ukrainealarm's rate-limit window clears. UA stays
            # inert (empty snapshot) until ready, so the map runs on
            # alerts.in.ua alone meanwhile — no freeze, no crash.
            self._setup_task = asyncio.create_task(self._ua_setup_loop(client))
        else:
            log.info("ukrainealarm source disabled; alerts.in.ua only")

    async def _ua_setup_loop(self, client: httpx.AsyncClient) -> None:
        attempt = 0
        while not self.ua_ready:
            attempt += 1
            try:
                regions = await ua_fetch_regions(client, self.ua_token)
                self.crosswalk = build_crosswalk(regions)
                await asyncio.sleep(UA_STARTUP_SPACING_SEC)
                await ua_subscribe_webhook(client, self.ua_token, self.ua_webhook_url)
                await asyncio.sleep(UA_STARTUP_SPACING_SEC)
                now = asyncio.get_event_loop().time()
                self._ua_last_forced = now
                self._ua_last_status = now
                await self._do_refresh(client)
                self._kick_task = asyncio.create_task(self._kick_listener())
                self.ua_ready = True
                log.info("ukrainealarm source ready (attempt %d): webhook + safety poll", attempt)
                # Re-merge so UA's initial snapshot lands immediately.
                await self._recompute()
                return
            except asyncio.CancelledError:
                raise
            except Exception:
                log.warning("ua setup attempt %d failed (likely rate-limit); retrying in %.0fs",
                            attempt, UA_SETUP_RETRY_SEC)
                await asyncio.sleep(UA_SETUP_RETRY_SEC)

    async def on_wake(self, client: httpx.AsyncClient, kicked: bool) -> None:
        # Apply any queued webhook modifications first (no network).
        self._drain_pending()
        if not kicked:
            # Timer tick: refresh alerts.in.ua and run the rare UA safety poll.
            self.aiu = await _fetch_active(client, self.aiu_token)
            await self._service_ua_poll(client)
        await self._recompute()

    async def sleep_until_kick(self, stop: asyncio.Event) -> bool:
        """Wait up to POLL_INTERVAL_SEC, returning early on a kick or stop.

        Returns True if woken by a webhook kick, False on the timer.
        """
        stop_t = asyncio.ensure_future(stop.wait())
        kick_t = asyncio.ensure_future(self._kick.wait())
        try:
            done, _pending = await asyncio.wait(
                {stop_t, kick_t}, timeout=POLL_INTERVAL_SEC, return_when=asyncio.FIRST_COMPLETED
            )
        finally:
            for t in (stop_t, kick_t):
                if not t.done():
                    t.cancel()
        kicked = kick_t in done
        if kicked:
            self._kick.clear()
        return kicked

    async def shutdown(self, client: httpx.AsyncClient) -> None:
        # Intentionally do NOT unsubscribe the webhook: the subscription is
        # stable server-side, survives restarts (callbacks keep flowing), and
        # re-subscribing every boot would only add rate-limit pressure. Use
        # ua_crosswalk.unsubscribe_webhook manually to deregister for good.
        for task in (self._setup_task, self._kick_task):
            if task is not None:
                task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass


async def _run(stop: asyncio.Event) -> None:
    aiu_token = os.environ.get("ALERTS_API_TOKEN", "").strip()
    if not aiu_token:
        log.error("ALERTS_API_TOKEN is not set; refusing to start")
        raise SystemExit(2)
    ua_token = os.environ.get("UA_API_TOKEN", "").strip()
    ua_webhook_url = os.environ.get("UA_WEBHOOK_URL", "").strip()

    log.info("alerts_poller starting; interval=%.1fs", POLL_INTERVAL_SEC)
    engine = AlertEngine(aiu_token, ua_token, ua_webhook_url)
    backoff = 1.0

    async with httpx.AsyncClient() as client:
        try:
            await engine.startup(client)
        except Exception:
            log.exception("startup failed")
            raise

        while not stop.is_set():
            kicked = await engine.sleep_until_kick(stop)
            if stop.is_set():
                break
            try:
                await engine.on_wake(client, kicked)
                backoff = 1.0
            except httpx.HTTPStatusError as e:
                log.error("upstream HTTP %s; backing off %.1fs", e.response.status_code, backoff)
                try:
                    await asyncio.wait_for(stop.wait(), timeout=backoff)
                except asyncio.TimeoutError:
                    pass
                backoff = min(backoff * 2, BACKOFF_MAX_SEC)
            except httpx.RequestError:
                log.exception("network error; backing off %.1fs", backoff)
                try:
                    await asyncio.wait_for(stop.wait(), timeout=backoff)
                except asyncio.TimeoutError:
                    pass
                backoff = min(backoff * 2, BACKOFF_MAX_SEC)
            except Exception:
                log.exception("unexpected error; backing off %.1fs", backoff)
                try:
                    await asyncio.wait_for(stop.wait(), timeout=backoff)
                except asyncio.TimeoutError:
                    pass
                backoff = min(backoff * 2, BACKOFF_MAX_SEC)

        await engine.shutdown(client)


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
