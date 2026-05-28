"""REST endpoints for active alerts, per-region history, and aggregate stats.

These read from Postgres `alert_events` (the authoritative store) — Redis
`alerts:current` is only used by the WS endpoint for fast initial snapshot.

Without the alerts.in.ua token, alert_events is empty, so responses are
empty too — the contract is correct and the moment the poller starts
writing, every endpoint returns meaningful data with no further code changes.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select

from app.db import get_session_factory
from app.models import AlertEvent
from app.schemas.alerts import (
    ActiveAlertsResponse,
    AlertView,
    HistoryItem,
    HistoryResponse,
    OblastStat,
    SummaryResponse,
)

router = APIRouter(prefix="/api/v1", tags=["alerts"])

Period = Literal["day", "week", "month", "all"]
PERIOD_DAYS: dict[str, int] = {"day": 1, "week": 7, "month": 30}


def _period_start(period: Period) -> datetime | None:
    if period == "all":
        return None
    days = PERIOD_DAYS.get(period)
    if days is None:
        raise HTTPException(status_code=400, detail=f"invalid period: {period}")
    return datetime.now(timezone.utc) - timedelta(days=days)


def _duration_seconds(started_at: datetime, finished_at: datetime | None, now: datetime) -> int:
    end = finished_at or now
    return max(0, int((end - started_at).total_seconds()))


@router.get("/alerts/active", response_model=ActiveAlertsResponse)
async def get_active_alerts() -> ActiveAlertsResponse:
    factory = get_session_factory()
    async with factory() as session:
        result = await session.execute(
            select(AlertEvent)
            .where(AlertEvent.finished_at.is_(None))
            .order_by(AlertEvent.started_at.desc())
        )
        rows = result.scalars().all()

    return ActiveAlertsResponse(
        alerts=[AlertView.model_validate(r) for r in rows],
        updated_at=datetime.now(timezone.utc),
    )


@router.get("/alerts/history", response_model=HistoryResponse)
async def get_alerts_history(
    location_uid: int = Query(..., description="alerts.in.ua location_uid"),
    period: Period = Query("week"),
) -> HistoryResponse:
    start = _period_start(period)
    now = datetime.now(timezone.utc)

    factory = get_session_factory()
    async with factory() as session:
        stmt = select(AlertEvent).where(AlertEvent.location_uid == location_uid)
        if start is not None:
            stmt = stmt.where(AlertEvent.started_at >= start)
        stmt = stmt.order_by(AlertEvent.started_at.desc())
        result = await session.execute(stmt)
        rows = result.scalars().all()

    items = [
        HistoryItem(
            id=r.id,
            location_uid=r.location_uid,
            location_title=r.location_title,
            location_type=r.location_type,
            alert_type=r.alert_type,
            started_at=r.started_at,
            finished_at=r.finished_at,
            duration_seconds=_duration_seconds(r.started_at, r.finished_at, now),
        )
        for r in rows
    ]
    return HistoryResponse(location_uid=location_uid, period=period, items=items)


@router.get("/stats/summary", response_model=SummaryResponse)
async def get_stats_summary(period: Period = Query("week")) -> SummaryResponse:
    start = _period_start(period)
    now = datetime.now(timezone.utc)

    duration_expr = func.extract(
        "epoch",
        func.coalesce(AlertEvent.finished_at, func.now()) - AlertEvent.started_at,
    )

    factory = get_session_factory()
    async with factory() as session:
        per_oblast_stmt = select(
            AlertEvent.location_uid,
            AlertEvent.location_title,
            func.count().label("cnt"),
            func.coalesce(func.sum(duration_expr), 0).label("dur_sec"),
        )
        if start is not None:
            per_oblast_stmt = per_oblast_stmt.where(AlertEvent.started_at >= start)
        per_oblast_stmt = (
            per_oblast_stmt.group_by(AlertEvent.location_uid, AlertEvent.location_title)
            .order_by(func.sum(duration_expr).desc().nullslast())
        )
        rows = (await session.execute(per_oblast_stmt)).all()

    by_oblast = [
        OblastStat(
            location_uid=r.location_uid,
            location_title=r.location_title,
            count=int(r.cnt),
            duration_minutes=int((r.dur_sec or 0) // 60),
        )
        for r in rows
    ]

    total_alerts = sum(o.count for o in by_oblast)
    total_duration_minutes = sum(o.duration_minutes for o in by_oblast)

    return SummaryResponse(
        period=period,
        total_alerts=total_alerts,
        total_duration_minutes=total_duration_minutes,
        by_oblast=by_oblast,
    )
