from collections.abc import AsyncIterator

from redis.asyncio import Redis, from_url
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import get_settings

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None
_redis: Redis | None = None


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        settings = get_settings()
        _engine = create_async_engine(settings.database_url, pool_pre_ping=True)
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(get_engine(), expire_on_commit=False)
    return _session_factory


async def get_session() -> AsyncIterator[AsyncSession]:
    factory = get_session_factory()
    async with factory() as session:
        yield session


def get_redis() -> Redis:
    global _redis
    if _redis is None:
        settings = get_settings()
        _redis = from_url(settings.redis_url, decode_responses=True)
    return _redis


async def dispose() -> None:
    global _engine, _redis
    if _engine is not None:
        await _engine.dispose()
        _engine = None
    if _redis is not None:
        await _redis.aclose()
        _redis = None
