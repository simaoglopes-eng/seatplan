"""Venues and their floor plans: list, create, read, and save a full layout."""

from typing import Annotated, Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter
from pydantic import AfterValidator, BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import db
from app.core import audit
from app.core.errors import ApiError
from app.core.layout import LayoutItem, save_layout
from app.core.text import PlainText
from app.models import Organiser, Seat, Venue, VenueTable, Zone
from app.security import CurrentOrganiser, CurrentUser

router = APIRouter(prefix="/venues", tags=["venues"])

Coordinate = Field(ge=-10000, le=10000)
Size = Field(gt=0, le=10000)


def known_time_zone(name: str) -> str:
    """Refuse a time zone Python does not know, such as "Not/AZone".

    Every date shown to diners and guests goes through ZoneInfo(venue.timezone).
    An unknown name would make each of those pages fail with a 500 later, so
    it is refused here, once, with a 422.
    """
    try:
        ZoneInfo(name)
    # A folder name such as "Europe" raises IsADirectoryError, an OSError.
    except (ZoneInfoNotFoundError, ValueError, OSError):
        raise ValueError("Unknown time zone. Use a name such as Europe/Lisbon.") from None
    return name


TimeZoneName = Annotated[str, AfterValidator(known_time_zone)]


class Strict(BaseModel):
    # Unknown fields are rejected (contract section 7).
    model_config = ConfigDict(extra="forbid")


class VenueIn(Strict):
    kind: Literal["event", "restaurant"]
    name: PlainText = Field(min_length=1, max_length=120)
    timezone: TimeZoneName = Field(default="Europe/Lisbon", min_length=1, max_length=64)
    width: float = Size
    height: float = Size


class ZoneIn(Strict):
    id: int | None = None
    key: str = Field(min_length=1, max_length=40)
    name: PlainText = Field(min_length=1, max_length=80)
    kind: Literal["general", "window", "terrace", "bar", "quiet", "vip", "accessible", "stage"]
    x: float = Coordinate
    y: float = Coordinate
    w: float = Size
    h: float = Size


class TableIn(Strict):
    id: int | None = None
    key: str = Field(min_length=1, max_length=40)
    zone_key: str | None = Field(default=None, max_length=40)
    label: PlainText = Field(min_length=1, max_length=40)
    shape: Literal["round", "rect", "row"]
    x: float = Coordinate
    y: float = Coordinate
    w: float = Size
    h: float = Size
    rotation: float = Field(default=0.0, ge=-360, le=360)
    min_party: int = Field(default=1, ge=1, le=100)
    max_party: int = Field(ge=1, le=100)
    is_accessible: bool = False
    high_chair_ok: bool = False
    combine_group: str | None = Field(default=None, max_length=40)


class SeatIn(Strict):
    id: int | None = None
    key: str = Field(min_length=1, max_length=40)
    table_key: str = Field(min_length=1, max_length=40)
    label: PlainText = Field(min_length=1, max_length=40)
    x: float = Coordinate
    y: float = Coordinate
    is_accessible: bool = False
    is_blocked: bool = False
    reserved_tag: Literal["vip", "family", "speaker"] | None = None


class LayoutIn(Strict):
    zones: list[ZoneIn] = Field(default_factory=list, max_length=200)
    tables: list[TableIn] = Field(default_factory=list, max_length=1000)
    seats: list[SeatIn] = Field(default_factory=list, max_length=5000)


def _venue_summary(venue: Venue) -> dict[str, Any]:
    return {
        "public_id": venue.public_id,
        "kind": venue.kind,
        "name": venue.name,
        "timezone": venue.timezone,
        "width": venue.width,
        "height": venue.height,
    }


def _row_dict(row: Zone | VenueTable | Seat) -> dict[str, Any]:
    """Every column of a row, plus key = str(id) so the editor can send it back."""
    data = {column.name: getattr(row, column.name) for column in row.__table__.columns}
    data.pop("venue_id")
    # The legacy editor must receive exactly the fields it can save back.
    # Restaurant rooms have their own nested API and validation models.
    data.pop("room_id", None)
    data.pop("is_active", None)
    data["key"] = str(row.id)
    return data


def _venue_detail(session: Session, venue: Venue) -> dict[str, Any]:
    detail = _venue_summary(venue)
    for name, model in (("zones", Zone), ("tables", VenueTable), ("seats", Seat)):
        rows = session.scalars(select(model).where(model.venue_id == venue.id).order_by(model.id))
        detail[name] = [_row_dict(row) for row in rows]
    return detail


def load_venue(session: Session, public_id: str, user: Organiser) -> Venue:
    """The venue if this user may see it. Staff may see every venue; an
    organiser only their own. Missing and forbidden look the same (404)."""
    venue = session.scalars(select(Venue).where(Venue.public_id == public_id)).first()
    if venue is None or (user.role != "staff" and venue.organiser_id != user.id):
        raise ApiError(404, "not_found", "Venue not found.")
    return venue


@router.get("")
def list_venues(user: CurrentUser, session: db.SessionDep) -> list[dict[str, Any]]:
    query = select(Venue).order_by(Venue.id)
    if user.role != "staff":
        query = query.where(Venue.organiser_id == user.id)
    return [_venue_summary(venue) for venue in session.scalars(query)]


@router.post("", status_code=201)
def create_venue(
    body: VenueIn,
    user: CurrentOrganiser,
    session: db.SessionDep,
) -> dict[str, Any]:
    venue = Venue(organiser_id=user.id, **body.model_dump())
    session.add(venue)
    session.flush()
    audit.record(
        session, actor=user.email, action="venue.create", entity="venue", entity_id=venue.public_id
    )
    session.commit()
    return _venue_summary(venue)


@router.get("/{venue_public_id}")
def get_venue(
    venue_public_id: str,
    user: CurrentUser,
    session: db.SessionDep,
) -> dict[str, Any]:
    return _venue_detail(session, load_venue(session, venue_public_id, user))


def _to_items(
    rows: list[ZoneIn] | list[TableIn] | list[SeatIn], parent: str | None
) -> list[LayoutItem]:
    """Split each request item into id, key, parent key and plain column values."""
    items = []
    for row in rows:
        fields = row.model_dump(exclude={"id", "key", "zone_key", "table_key"})
        parent_key = getattr(row, parent) if parent else None
        items.append(LayoutItem(id=row.id, key=row.key, parent_key=parent_key, fields=fields))
    return items


@router.put("/{venue_public_id}/layout")
def put_layout(
    venue_public_id: str,
    body: LayoutIn,
    user: CurrentOrganiser,
    session: db.SessionDep,
) -> dict[str, Any]:
    venue = load_venue(session, venue_public_id, user)
    try:
        counts = save_layout(
            session,
            venue,
            _to_items(body.zones, None),
            _to_items(body.tables, "zone_key"),
            _to_items(body.seats, "table_key"),
        )
        audit.record(
            session,
            actor=user.email,
            action="venue.layout",
            entity="venue",
            entity_id=venue.public_id,
            detail=counts,
        )
        session.commit()
    except IntegrityError:
        # A deleted seat or table is still used by an assignment or booking.
        session.rollback()
        raise ApiError(
            409, "conflict", "Some seats or tables are still in use and cannot be removed."
        ) from None
    return _venue_detail(session, venue)
