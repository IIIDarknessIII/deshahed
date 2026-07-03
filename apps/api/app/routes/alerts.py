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
    ComparisonResponse,
    ComparisonStats,
    DailyBucket,
    DailyResponse,
    DurationBucket,
    DurationHistogramResponse,
    HistoryItem,
    HistoryResponse,
    OblastStat,
    SummaryResponse,
    TimelapseFrame,
    TimelapseResponse,
)

from sqlalchemy import text

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


@router.get(
    "/alerts/location/{location_uid}/active",
    response_model=ActiveAlertsResponse,
    summary="Active alerts touching a single location_uid",
)
async def get_active_alerts_for_location(location_uid: int) -> ActiveAlertsResponse:
    """Mirror of alerts.in.ua's `/v1/alerts/{location_uid}/active.json`.

    Matches both the alert's own location_uid and its oblast_uid, so a
    request for an oblast UID returns every sub-region alert under it too.
    """
    if location_uid <= 0:
        raise HTTPException(status_code=422, detail="location_uid must be positive")
    factory = get_session_factory()
    async with factory() as session:
        result = await session.execute(
            select(AlertEvent).where(
                AlertEvent.finished_at.is_(None),
                (AlertEvent.location_uid == location_uid)
                | (AlertEvent.location_oblast_uid == location_uid),
            ).order_by(AlertEvent.started_at.desc())
        )
        rows = result.scalars().all()
    return ActiveAlertsResponse(
        alerts=[AlertView.model_validate(r) for r in rows],
        updated_at=datetime.now(timezone.utc),
    )


@router.get("/alerts/history", response_model=HistoryResponse)
async def get_alerts_history(
    location_uid: int | None = Query(None, description="alerts.in.ua location_uid (precise sub-region)"),
    oblast: str | None = Query(None, description="Oblast full title — rolls up every sub-region inside it"),
    period: Period = Query("week"),
) -> HistoryResponse:
    if location_uid is None and not oblast:
        raise HTTPException(status_code=400, detail="provide location_uid or oblast")

    start = _period_start(period)
    now = datetime.now(timezone.utc)

    factory = get_session_factory()
    async with factory() as session:
        stmt = select(AlertEvent)
        if oblast is not None:
            stmt = stmt.where(AlertEvent.location_oblast == oblast)
        if location_uid is not None:
            stmt = stmt.where(AlertEvent.location_uid == location_uid)
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
    return HistoryResponse(
        location_uid=location_uid if location_uid is not None else 0,
        period=period,
        items=items,
    )


@router.get("/stats/summary", response_model=SummaryResponse)
async def get_stats_summary(period: Period = Query("week")) -> SummaryResponse:
    start = _period_start(period)

    duration_expr = func.extract(
        "epoch",
        func.coalesce(AlertEvent.finished_at, func.now()) - AlertEvent.started_at,
    )

    # Group by the PARENT oblast TITLE only — alerts.in.ua reuses the
    # sub-region's location_uid in location_oblast_uid (verified), so the UID
    # is not a stable group key. The title string is canonical and unique.
    factory = get_session_factory()
    async with factory() as session:
        per_oblast_stmt = select(
            AlertEvent.location_oblast.label("title"),
            func.count().label("cnt"),
            func.coalesce(func.sum(duration_expr), 0).label("dur_sec"),
            func.min(AlertEvent.location_oblast_uid).label("any_uid"),
        )
        if start is not None:
            per_oblast_stmt = per_oblast_stmt.where(AlertEvent.started_at >= start)
        per_oblast_stmt = (
            per_oblast_stmt.group_by(AlertEvent.location_oblast)
            .order_by(func.sum(duration_expr).desc().nullslast())
        )
        rows = (await session.execute(per_oblast_stmt)).all()

    by_oblast = [
        OblastStat(
            # OblastStat carries an integer uid; expose `any_uid` (one of the
            # raw row UIDs in this group). It's only used by /history for
            # navigation; per-oblast drill-down should use the `oblast=` query.
            location_uid=int(r.any_uid or 0),
            location_title=r.title,
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


# ---------- Phase 4.2 dashboard endpoints ----------


_DAILY_SQL = text(
    """
    SELECT
        DATE_TRUNC('day', started_at AT TIME ZONE 'UTC')::date AS day,
        COUNT(*)                                                 AS cnt,
        COALESCE(
          SUM(
            EXTRACT(EPOCH FROM (COALESCE(finished_at, NOW()) - started_at)) / 60
          ),
          0
        )::int                                                   AS duration_min
    FROM alert_events
    WHERE started_at >= :start
    GROUP BY day
    ORDER BY day
    """
)


@router.get("/stats/daily", response_model=DailyResponse)
async def get_stats_daily(period: Period = Query("month")) -> DailyResponse:
    start = _period_start(period)
    if start is None:
        # "all" — cap to last year so the chart stays renderable.
        start = datetime.now(timezone.utc) - timedelta(days=365)

    factory = get_session_factory()
    async with factory() as session:
        rows = (await session.execute(_DAILY_SQL, {"start": start})).all()

    return DailyResponse(
        period=period,
        items=[
            DailyBucket(date=str(r.day), count=int(r.cnt), duration_minutes=int(r.duration_min))
            for r in rows
        ],
    )


# Bucket widths in minutes, last bucket is "240+".
_HISTOGRAM_EDGES_MIN = [0, 5, 15, 30, 60, 90, 120, 180, 240]


@router.get("/stats/duration-histogram", response_model=DurationHistogramResponse)
async def get_duration_histogram(period: Period = Query("month")) -> DurationHistogramResponse:
    start = _period_start(period)

    base_where = "WHERE finished_at IS NOT NULL"
    params: dict[str, object] = {}
    if start is not None:
        base_where += " AND started_at >= :start"
        params["start"] = start

    factory = get_session_factory()
    async with factory() as session:
        stats_row = (
            await session.execute(
                text(
                    f"""
                    SELECT
                      COUNT(*) AS total,
                      PERCENTILE_CONT(0.50) WITHIN GROUP (
                        ORDER BY EXTRACT(EPOCH FROM (finished_at - started_at)) / 60
                      ) AS median_min,
                      PERCENTILE_CONT(0.95) WITHIN GROUP (
                        ORDER BY EXTRACT(EPOCH FROM (finished_at - started_at)) / 60
                      ) AS p95_min
                    FROM alert_events
                    {base_where}
                    """
                ),
                params,
            )
        ).one()

        buckets: list[DurationBucket] = []
        edges = _HISTOGRAM_EDGES_MIN
        for i in range(len(edges) - 1):
            lo, hi = edges[i], edges[i + 1]
            params_b = {**params, "lo": lo, "hi": hi}
            cnt = (await session.execute(
                text(
                    f"""
                    SELECT COUNT(*) AS cnt
                    FROM alert_events
                    {base_where}
                      AND EXTRACT(EPOCH FROM (finished_at - started_at)) / 60 >= :lo
                      AND EXTRACT(EPOCH FROM (finished_at - started_at)) / 60 <  :hi
                    """
                ),
                params_b,
            )).scalar_one()
            buckets.append(DurationBucket(range_min=lo, range_max=hi, count=int(cnt)))
        # 240+ overflow bucket
        params_o = {**params, "lo": edges[-1]}
        overflow = (await session.execute(
            text(
                f"""
                SELECT COUNT(*) AS cnt
                FROM alert_events
                {base_where}
                  AND EXTRACT(EPOCH FROM (finished_at - started_at)) / 60 >= :lo
                """
            ),
            params_o,
        )).scalar_one()
        buckets.append(DurationBucket(range_min=edges[-1], range_max=None, count=int(overflow)))

    return DurationHistogramResponse(
        period=period,
        total=int(stats_row.total),
        median_minutes=float(stats_row.median_min) if stats_row.median_min is not None else None,
        p95_minutes=float(stats_row.p95_min) if stats_row.p95_min is not None else None,
        buckets=buckets,
    )


@router.get("/stats/comparison", response_model=ComparisonResponse)
async def get_stats_comparison() -> ComparisonResponse:
    """today vs yesterday — totals + duration. Day boundary = UTC midnight."""
    now = datetime.now(timezone.utc)
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    yday_start = today_start - timedelta(days=1)

    sql = text(
        """
        SELECT
            COUNT(*)                                                                       AS cnt,
            COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(finished_at, NOW()) - started_at)) / 60), 0)::int
                                                                                           AS duration_min
        FROM alert_events
        WHERE started_at >= :start AND started_at < :end
        """
    )

    factory = get_session_factory()
    async with factory() as session:
        t_row = (await session.execute(sql, {"start": today_start, "end": today_start + timedelta(days=1)})).one()
        y_row = (await session.execute(sql, {"start": yday_start, "end": today_start})).one()

    today = ComparisonStats(
        label="today",
        date=str(today_start.date()),
        total_alerts=int(t_row.cnt),
        total_duration_minutes=int(t_row.duration_min),
    )
    yesterday = ComparisonStats(
        label="yesterday",
        date=str(yday_start.date()),
        total_alerts=int(y_row.cnt),
        total_duration_minutes=int(y_row.duration_min),
    )

    def delta_pct(t: int, y: int) -> float | None:
        if y == 0:
            return None
        return (t - y) / y * 100.0

    return ComparisonResponse(
        today=today,
        yesterday=yesterday,
        alerts_delta_pct=delta_pct(today.total_alerts, yesterday.total_alerts),
        duration_delta_pct=delta_pct(today.total_duration_minutes, yesterday.total_duration_minutes),
    )


# State-aggregation rule for the timelapse — must mirror the frontend's
# selectOblastAggregate so the animation looks identical to the live map:
#   - air_raid / artillery_shelling at any level paint the parent oblast
#   - urban_fights only paints when fired at oblast level itself
#   - severity ladder: urban_fights > artillery_shelling > air_raid > safe
_SEVERITY = {"safe": 0, "air_raid": 1, "artillery_shelling": 2, "urban_fights": 3}
_ESCALATES_FROM_SUB = {"air_raid", "artillery_shelling"}


def _classify(alert_type: str) -> str:
    if alert_type in ("urban_fights", "artillery_shelling", "air_raid"):
        return alert_type
    return "air_raid"


@router.get("/stats/timelapse", response_model=TimelapseResponse)
async def get_timelapse(
    hours: int = Query(24, ge=1, le=72),
    step_seconds: int = Query(300, ge=60, le=1800),
) -> TimelapseResponse:
    """Per-oblast state at every step over the last N hours.

    Built for the /timelapse animation. Compact — frames carry only oblasts
    whose state is non-safe, so a quiet hour is ~80 bytes of JSON.
    """
    now = datetime.now(timezone.utc).replace(microsecond=0)
    start = now - timedelta(hours=hours)
    step = timedelta(seconds=step_seconds)

    factory = get_session_factory()
    async with factory() as session:
        # All events that overlap [start, now]: either still active or
        # finished after start.
        result = await session.execute(
            select(
                AlertEvent.location_type,
                AlertEvent.location_oblast,
                AlertEvent.location_title,
                AlertEvent.alert_type,
                AlertEvent.started_at,
                AlertEvent.finished_at,
            ).where(
                AlertEvent.started_at <= now,
                (AlertEvent.finished_at.is_(None)) | (AlertEvent.finished_at >= start),
            )
        )
        rows = result.all()

    frames: list[TimelapseFrame] = []
    t = start
    while t <= now:
        oblasts: dict[str, str] = {}
        for r in rows:
            if r.started_at > t:
                continue
            if r.finished_at is not None and r.finished_at < t:
                continue
            cls = _classify(r.alert_type)
            is_obl = r.location_type in ("oblast", "autonomous_republic")
            if not is_obl and cls not in _ESCALATES_FROM_SUB:
                continue
            title = r.location_oblast or r.location_title
            prev = oblasts.get(title, "safe")
            if _SEVERITY[cls] > _SEVERITY[prev]:
                oblasts[title] = cls
        frames.append(TimelapseFrame(t=t, oblasts=oblasts))
        t += step

    return TimelapseResponse(
        started_at=start,
        ended_at=now,
        step_seconds=step_seconds,
        frames=frames,
    )
