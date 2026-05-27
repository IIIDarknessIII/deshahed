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
