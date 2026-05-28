from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

AlertType = Literal[
    "air_raid",
    "artillery_shelling",
    "urban_fights",
    "chemical",
    "nuclear",
    "unknown",
]

LocationType = Literal["oblast", "raion", "hromada", "city", "autonomous_republic"]


class AlertView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    location_uid: int
    location_title: str
    location_type: LocationType
    alert_type: AlertType
    started_at: datetime
    finished_at: datetime | None = None
    # Parent oblast — required for the frontend to highlight the right region
    # when the alert is fired at hromada / raion / city level (we don't ship
    # sub-oblast geometry). For oblast-level alerts these mirror
    # location_title / location_uid.
    location_oblast: str | None = None
    location_oblast_uid: int | None = None
    # alerts.in.ua's free-text describing the threat. When it contains "БпЛА"
    # or "дрон" the frontend escalates the cell color to the shahed tier.
    notes: str | None = None


class SnapshotMessage(BaseModel):
    type: Literal["snapshot"] = "snapshot"
    alerts: list[AlertView]


class AlertStartedMessage(BaseModel):
    type: Literal["alert_started"] = "alert_started"
    alert: AlertView


class AlertEndedMessage(BaseModel):
    type: Literal["alert_ended"] = "alert_ended"
    location_uid: int
    alert_type: AlertType


class ActiveAlertsResponse(BaseModel):
    alerts: list[AlertView]
    updated_at: datetime


class HistoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    location_uid: int
    location_title: str
    location_type: LocationType
    alert_type: AlertType
    started_at: datetime
    finished_at: datetime | None
    duration_seconds: int


class HistoryResponse(BaseModel):
    location_uid: int
    period: str
    items: list[HistoryItem]


class OblastStat(BaseModel):
    location_uid: int
    location_title: str
    count: int
    duration_minutes: int


class SummaryResponse(BaseModel):
    period: str
    total_alerts: int
    total_duration_minutes: int
    by_oblast: list[OblastStat]


class DailyBucket(BaseModel):
    date: str
    count: int
    duration_minutes: int


class DailyResponse(BaseModel):
    period: str
    items: list[DailyBucket]


class DurationBucket(BaseModel):
    range_min: int
    range_max: int | None  # None for "240+"
    count: int


class DurationHistogramResponse(BaseModel):
    period: str
    total: int
    median_minutes: float | None
    p95_minutes: float | None
    buckets: list[DurationBucket]


class ComparisonStats(BaseModel):
    label: str          # "today" | "yesterday"
    date: str           # ISO date of this window
    total_alerts: int
    total_duration_minutes: int


class ComparisonResponse(BaseModel):
    today: ComparisonStats
    yesterday: ComparisonStats
    alerts_delta_pct: float | None       # null if yesterday=0 (undefined ratio)
    duration_delta_pct: float | None
