import uuid
from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import Boolean, DateTime, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class DroneTrack(Base):
    """Trajectory of one physical drone — chain of positions over time.

    Path is built incrementally by the assembler: NULL while there's only one
    point, then a LINESTRING that ST_AddPoint() extends as more sightings of
    the same drone come in. `is_active` flips to FALSE after 20 minutes of
    no updates (or when the drone hits its terminal area).
    """

    __tablename__ = "drone_tracks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    path = mapped_column(
        Geography(geometry_type="LINESTRING", srid=4326, spatial_index=False),
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    confidence: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
