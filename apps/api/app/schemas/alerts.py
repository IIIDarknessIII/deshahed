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
