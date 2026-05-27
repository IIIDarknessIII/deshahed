from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import get_settings
from app.db import dispose
from app.routes import health, ws_alerts


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="deshahed API",
        version="0.1.0",
        docs_url="/docs" if settings.app_env != "prod" else None,
        redoc_url=None,
        lifespan=lifespan,
    )
    app.include_router(health.router)
    app.include_router(ws_alerts.router)
    return app


app = create_app()
