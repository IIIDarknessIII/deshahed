from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

DroneEventType = Literal["shahed", "missile", "kab", "aviation", "unknown"]
ConfidenceLevel = Literal["high", "medium", "low"]


class LLMEvent(BaseModel):
    """One structured event extracted from a single TG message by the LLM."""

    type: DroneEventType
    location: str = Field(..., min_length=1, max_length=200)
    direction: str | None = Field(default=None, max_length=200)
    count: int = Field(default=1, ge=1, le=100)
    confidence: ConfidenceLevel


class LLMResponse(BaseModel):
    events: list[LLMEvent] = Field(default_factory=list)


class DroneEventView(BaseModel):
    """Shape sent to WS clients and returned from REST /api/v1/drones/active."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    event_type: DroneEventType
    location_text: str
    direction_text: str | None
    location_lat: float
    location_lon: float
    direction_lat: float | None
    direction_lon: float | None
    confidence: ConfidenceLevel
    source_channel: str
    detected_at: datetime
    expires_at: datetime


class DroneSnapshotMessage(BaseModel):
    type: Literal["drone_snapshot"] = "drone_snapshot"
    drones: list[DroneEventView]


class DroneAppearedMessage(BaseModel):
    type: Literal["drone_appeared"] = "drone_appeared"
    drone: DroneEventView


class TrackView(BaseModel):
    """One trajectory of a physical drone, suitable for direct render on MapLibre."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    event_type: DroneEventType
    first_seen_at: datetime
    last_seen_at: datetime
    point_count: int
    is_active: bool
    confidence: ConfidenceLevel | None
    # GeoJSON LineString; null while point_count == 1.
    path: dict | None = None
    last_lat: float
    last_lon: float


class TrackSnapshotMessage(BaseModel):
    type: Literal["track_snapshot"] = "track_snapshot"
    tracks: list[TrackView]


class TrackUpdatedMessage(BaseModel):
    type: Literal["track_updated"] = "track_updated"
    track: TrackView
