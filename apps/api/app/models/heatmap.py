from datetime import datetime

from sqlalchemy import DateTime, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class HeatmapCell(Base):
    """One pre-computed H3 cell of the drone density heatmap.

    The background recomputer (apps/api/app/heatmap_worker.py) rebuilds every
    (period × event_type) bucket once an hour. The REST endpoint just SELECTs
    from this table — no computation on the request path.

    Primary key triplet keeps lookups O(log n) per row and lets the cache
    survive zone-by-zone refreshes without TRUNCATE.
    """

    __tablename__ = "heatmap_cache"

    h3_index: Mapped[str] = mapped_column(Text, primary_key=True)
    period: Mapped[str] = mapped_column(Text, primary_key=True)        # day|week|month
    event_type: Mapped[str] = mapped_column(Text, primary_key=True)    # shahed|missile|kab|aviation|all
    weight: Mapped[int] = mapped_column(Integer, nullable=False)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
