from datetime import datetime
from typing import Literal

from pydantic import BaseModel

CraftType = Literal["mig31k", "tu95", "tu160", "tu22m3"]
AviationStatus = Literal["in_air", "takeoff", "landing"]


class AviationEvent(BaseModel):
    id: str
    craft: CraftType
    craft_label: str
    status: AviationStatus
    source_channel: str
    detected_at: datetime
    expires_at: datetime
    snippet: str


class AviationActiveResponse(BaseModel):
    items: list[AviationEvent]
    updated_at: datetime
