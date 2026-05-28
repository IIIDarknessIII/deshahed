from sqlalchemy import Float, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Settlement(Base):
    """Reference table of Ukrainian settlements (cities, towns, villages).

    Populated once via scripts/seed_settlements.py from an open dataset.
    `name_normalized` is lowercased and stripped — used by the L1 geocoder
    with pg_trgm GIN index for fuzzy fast lookup.
    """

    __tablename__ = "settlements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    name_normalized: Mapped[str] = mapped_column(Text, nullable=False)
    oblast: Mapped[str] = mapped_column(Text, nullable=False)
    raion: Mapped[str | None] = mapped_column(Text, nullable=True)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    type: Mapped[str | None] = mapped_column(Text, nullable=True)  # city|town|village
