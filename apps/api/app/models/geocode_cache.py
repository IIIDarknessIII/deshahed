from datetime import datetime

from sqlalchemy import DateTime, Float, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class GeocodeCache(Base):
    """Long-term cache for the geocoder, keyed by the literal query string.

    Negative results (Nominatim returned nothing) are cached too with lat/lon NULL
    so we don't pound external services for the same unknown name forever.
    """

    __tablename__ = "geocode_cache"

    query: Mapped[str] = mapped_column(Text, primary_key=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(Text, nullable=False)  # local|nominatim|llm|none
    confidence: Mapped[str] = mapped_column(Text, nullable=False)  # high|medium|low|none
    cached_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
