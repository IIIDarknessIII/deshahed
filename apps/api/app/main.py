import asyncio
import logging
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import get_settings
from app.db import dispose, get_session_factory
from app.heatmap_worker import loop as heatmap_loop
from app.push import loop as push_loop
from app.routes import alerts, aviation, drones, health, heatmap, iot, presence, push as push_routes, tracks, ua_webhook, ws_alerts

log = logging.getLogger("uvicorn.error").getChild("lifespan")

# Phase 3 — close drone_tracks idle > 20 min so the WS/REST surface only
# shows live trajectories. Lives in the api process (not the parser) so the
# work happens even when the extractor is down.
STALE_TRACKS_SWEEP_SEC = 60
STALE_TRACKS_CUTOFF_MIN = 20

_CLOSE_STALE_SQL = text(
    """
    UPDATE drone_tracks
    SET is_active = FALSE
    WHERE is_active = TRUE
      AND last_seen_at < (NOW() - make_interval(mins => :cutoff_min))
    RETURNING id
    """
)


def _init_sentry() -> None:
    settings = get_settings()
    if not settings.sentry_dsn:
        return
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.app_env,
        traces_sample_rate=0.0,
        send_default_pii=False,
    )


async def _close_stale_tracks_loop(stop: asyncio.Event) -> None:
    factory = get_session_factory()
    while not stop.is_set():
        try:
            async with factory() as session:
                rows = (await session.execute(
                    _CLOSE_STALE_SQL, {"cutoff_min": STALE_TRACKS_CUTOFF_MIN}
                )).all()
                if rows:
                    await session.commit()
                    log.info("closed %d stale drone tracks", len(rows))
        except Exception:
            log.exception("close-stale-tracks sweep failed")
        try:
            await asyncio.wait_for(stop.wait(), timeout=STALE_TRACKS_SWEEP_SEC)
        except asyncio.TimeoutError:
            continue


@asynccontextmanager
async def lifespan(app: FastAPI):
    stop = asyncio.Event()
    sweep_task = asyncio.create_task(_close_stale_tracks_loop(stop))
    heatmap_task = asyncio.create_task(heatmap_loop(stop))
    push_task = asyncio.create_task(push_loop(stop))
    try:
        yield
    finally:
        stop.set()
        for t in (sweep_task, heatmap_task, push_task):
            t.cancel()
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass
        await dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    _init_sentry()
    app = FastAPI(
        title="deshahed API",
        version="0.1.0",
        docs_url="/docs" if settings.app_env != "prod" else None,
        redoc_url=None,
        lifespan=lifespan,
    )

    origins = settings.cors_origins_list
    if origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(health.router)
    app.include_router(alerts.router)
    app.include_router(drones.router)
    app.include_router(tracks.router)
    app.include_router(heatmap.router)
    app.include_router(push_routes.router)
    app.include_router(iot.router)
    app.include_router(aviation.router)
    app.include_router(presence.router)
    app.include_router(ua_webhook.router)
    app.include_router(ws_alerts.router)
    return app


app = create_app()
