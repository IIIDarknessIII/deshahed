"""REST endpoint that serves the pre-computed heatmap as a GeoJSON
FeatureCollection of hexagon polygons.

ТЗ section 4.1: GET /api/v1/heatmap?period=week&type=shahed
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

import h3
from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import text

from app.db import get_session_factory

router = APIRouter(prefix="/api/v1", tags=["heatmap"])

Period = Literal["day", "week", "month"]
EventTypeFilter = Literal["all", "shahed", "missile", "kab", "aviation"]


class HeatmapResponse(BaseModel):
    period: Period
    event_type: EventTypeFilter
    max_weight: int
    computed_at: datetime | None
    geojson: dict


_CELLS_SQL = text(
    """
    SELECT h3_index, weight, computed_at
    FROM heatmap_cache
    WHERE period = :period AND event_type = :event_type
    ORDER BY weight DESC
    """
)


@router.get("/heatmap", response_model=HeatmapResponse)
async def get_heatmap(
    period: Period = Query("week"),
    event_type: EventTypeFilter = Query("all", alias="type"),
) -> HeatmapResponse:
    factory = get_session_factory()
    async with factory() as session:
        rows = (await session.execute(
            _CELLS_SQL, {"period": period, "event_type": event_type}
        )).all()

    features: list[dict] = []
    max_weight = 0
    computed_at: datetime | None = None
    for r in rows:
        boundary = h3.cell_to_boundary(r.h3_index)  # list of (lat, lon)
        # GeoJSON wants [lon, lat] ordering and a closed ring.
        coords = [[lon, lat] for lat, lon in boundary]
        coords.append(coords[0])
        features.append({
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [coords]},
            "properties": {"h3": r.h3_index, "weight": int(r.weight)},
        })
        if r.weight > max_weight:
            max_weight = int(r.weight)
        if computed_at is None or r.computed_at > computed_at:
            computed_at = r.computed_at

    return HeatmapResponse(
        period=period,
        event_type=event_type,
        max_weight=max_weight,
        computed_at=computed_at or datetime.now(timezone.utc),
        geojson={"type": "FeatureCollection", "features": features},
    )
