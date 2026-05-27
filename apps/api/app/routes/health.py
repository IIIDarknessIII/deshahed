from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from app.db import get_redis, get_session_factory

router = APIRouter(prefix="/api/v1/health", tags=["health"])


class LiveResponse(BaseModel):
    status: str


class ReadyResponse(BaseModel):
    status: str
    postgres: bool
    postgis: str | None
    redis: bool


@router.get("/live", response_model=LiveResponse)
async def live() -> LiveResponse:
    return LiveResponse(status="ok")


@router.get("/ready", response_model=ReadyResponse)
async def ready() -> ReadyResponse:
    pg_ok = False
    postgis_version: str | None = None
    try:
        factory = get_session_factory()
        async with factory() as session:
            result = await session.execute(text("SELECT PostGIS_Version()"))
            postgis_version = result.scalar_one()
            pg_ok = True
    except Exception:
        pg_ok = False

    redis_ok = False
    try:
        redis_ok = await get_redis().ping()
    except Exception:
        redis_ok = False

    return ReadyResponse(
        status="ok" if pg_ok and redis_ok else "degraded",
        postgres=pg_ok,
        postgis=postgis_version,
        redis=redis_ok,
    )
