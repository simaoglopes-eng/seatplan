"""Owner-only nested room layouts; one versioned transaction per save."""

import datetime as dt
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from app import db
from app.core.text import PlainText
from app.restaurant_service import ambience_view, profiles, rooms
from app.security import CurrentOrganiser

router = APIRouter(prefix="/owner/restaurants", tags=["owner rooms"])
Coordinate = Annotated[float, Field(ge=-10000, le=10000)]
Size = Annotated[float, Field(gt=0, le=10000)]
SunClock = Annotated[str, Field(max_length=5, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Item(Strict):
    id: int | None = Field(default=None, gt=0, strict=True)
    key: PlainText = Field(min_length=1, max_length=40)


class PointIn(Strict):
    x: Coordinate
    y: Coordinate
    curve: Coordinate = 0


class OutlineIn(Strict):
    points: list[PointIn] = Field(max_length=60)


class BoxIn(Item):
    x: Coordinate
    y: Coordinate
    w: Size
    h: Size


class SeatIn(Item):
    label: PlainText = Field(min_length=1, max_length=40)
    x: Coordinate
    y: Coordinate
    is_accessible: bool = False
    is_blocked: bool = False


class TableIn(BoxIn):
    zone_key: str | None = Field(default=None, max_length=40)
    label: PlainText = Field(min_length=1, max_length=40)
    shape: Literal["round", "rect", "row"]
    rotation: float = Field(default=0, ge=-360, le=360)
    min_party: int = Field(default=1, ge=1, le=100, strict=True)
    max_party: int = Field(ge=1, le=100, strict=True)
    is_accessible: bool = False
    high_chair_ok: bool = False
    combine_group: PlainText | None = Field(default=None, max_length=40)
    is_active: bool = True
    seats: list[SeatIn] = Field(default_factory=list, max_length=1000)


class ZoneIn(BoxIn):
    name: PlainText = Field(min_length=1, max_length=80)
    kind: Literal["general", "window", "terrace", "bar", "quiet", "vip", "accessible", "stage"]


class FixtureIn(BoxIn):
    kind: Literal[
        "bar",
        "kitchen",
        "wc",
        "column",
        "stairs",
        "plant",
        "stage",
        "fireplace",
        "tv",
        "host_stand",
        "awning",
    ]
    shape: Literal["rect", "circle"]
    rotation: float = Field(default=0, ge=-360, le=360)
    label: PlainText = Field(default="", max_length=40)


class OpeningIn(Item):
    side: int = Field(ge=0, le=59, strict=True)
    offset: float = Field(ge=0, le=10000)
    width: float = Field(ge=40, le=32000)
    kind: Literal["window", "door", "glass_wall"]
    top_height: float = Field(default=220, ge=100, le=500)
    is_main_entrance: bool = False
    view_text: PlainText = Field(default="", max_length=80)
    view_tags: list[str] = Field(default_factory=list, max_length=3)
    night_view_text: PlainText = Field(default="", max_length=80)
    sun_rule: Literal["auto", "never", "between"] = "auto"
    sun_from: SunClock | None = None
    sun_until: SunClock | None = None


class RoomIn(Item):
    name: PlainText = Field(min_length=1, max_length=60)
    is_outdoor: bool = False
    north_deg: float | None = Field(default=None, ge=0, le=359)
    outline: OutlineIn
    position: int = Field(default=0, ge=0, le=4, strict=True)
    openings: list[OpeningIn] = Field(default_factory=list, max_length=60)
    fixtures: list[FixtureIn] = Field(default_factory=list, max_length=100)
    zones: list[ZoneIn] = Field(default_factory=list, max_length=50)
    tables: list[TableIn] = Field(default_factory=list, max_length=200)


class LayoutIn(Strict):
    base_version: int = Field(ge=0, strict=True)
    rooms: list[RoomIn] = Field(min_length=1, max_length=5)


@router.get("/{vid}/rooms")
def get_rooms(vid: str, user: CurrentOrganiser, session: db.SessionDep) -> dict[str, Any]:
    return rooms.view(session, profiles.load(session, vid, user))


@router.put("/{vid}/rooms", response_model=None)
def put_rooms(
    vid: str, body: LayoutIn, user: CurrentOrganiser, session: db.SessionDep
) -> dict[str, Any] | JSONResponse:
    venue = profiles.load(session, vid, user)
    try:
        return rooms.save(session, venue, body.model_dump(), actor=f"organiser:{user.id}")
    except rooms.TablesInUse as exc:
        session.rollback()
        return JSONResponse(
            {"error": {"code": exc.code, "message": exc.message, "tables": exc.tables}},
            status_code=409,
        )


@router.get("/{vid}/ambience-preview")
def ambience_preview(
    vid: str,
    user: CurrentOrganiser,
    session: db.SessionDep,
    date: dt.date | None = None,
    time: dt.time = dt.time(13, 0),
    moment: dt.time | None = None,
    party: Annotated[int, Query(ge=1, le=30)] = 2,
) -> dict[str, Any]:
    """The light of the SAVED rooms for the editor's Light tool (spec 7.6, 7.7).

    Same answer as the diner's route, with the numbers behind each sentence. It
    works for drafts, and only for the owner. `date` defaults to today.
    """
    venue = profiles.load(session, vid, user)
    day = date or dt.datetime.now(ambience_view.venue_zone(venue)).date()
    return ambience_view.ambience_payload(
        session, venue, day, time, party=party, moment=moment, detail=True
    )
