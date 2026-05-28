import uuid
from datetime import datetime
from typing import Any

from geoalchemy2 import Geography
from sqlalchemy import BigInteger, DateTime, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class DroneEvent(Base):
    """Single OSINT report of an aerial object (shahed / missile / kab / aviation).

    `location_point` is the reported position; `direction_point` is the next named
    point on the trajectory if the source mentioned one (used to draw an arrow).
    `expires_at` = `detected_at` + 15 minutes — frontend hides the point after that.

    Phase 3 extensions:
      - `cluster_id` groups multiple reports of the SAME drone position from
        different channels within 3min and 30km of each other.
      - `sources` is the JSONB array of contributors:
            [{"channel": "kpszsu", "message_id": 12345, "detected_at": "..."}]
        First entry is the original message that created the cluster.
    """

    __tablename__ = "drone_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    source_channel: Mapped[str] = mapped_column(Text, nullable=False)
    source_message_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    location_text: Mapped[str] = mapped_column(Text, nullable=False)
    direction_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    location_point = mapped_column(
        Geography(geometry_type="POINT", srid=4326, spatial_index=False), nullable=False
    )
    direction_point = mapped_column(
        Geography(geometry_type="POINT", srid=4326, spatial_index=False), nullable=True
    )
    confidence: Mapped[str] = mapped_column(Text, nullable=False)
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    raw_payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    cluster_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, default=uuid.uuid4
    )
    sources: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, default=list
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
