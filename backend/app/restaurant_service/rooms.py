"""Nested room identities and an optimistic, atomic layout save."""

from datetime import time
from typing import Any

from sqlalchemy import delete, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.ambience.validation import validate_rooms
from app.core import audit
from app.core.errors import ApiError
from app.core.layout import rebuild_neighbours
from app.models import (
    AuditLog,
    Booking,
    Hold,
    Room,
    RoomFixture,
    RoomOpening,
    Seat,
    SeatNeighbour,
    TableSlot,
    Venue,
    VenuePhoto,
    VenueTable,
    Zone,
    utc_now,
)

MODELS = {
    "rooms": Room,
    "zones": Zone,
    "tables": VenueTable,
    "seats": Seat,
    "openings": RoomOpening,
    "fixtures": RoomFixture,
}
PREFIX = {"rooms": "r", "zones": "z", "tables": "t", "seats": "s", "openings": "o", "fixtures": "f"}


class TablesInUse(ApiError):
    def __init__(self, tables: list[dict]) -> None:
        super().__init__(409, "conflict", "This table has bookings. Make it unavailable instead.")
        self.tables = tables


def _protected_tables(session: Session, venue: Venue, existing: dict) -> set[int]:
    """Keep historical associations from slots, chosen seats and booking audit.

    Legacy bookings may have released their slots without any table history.
    In that case we conservatively protect all tables rather than guess.
    """
    protected: set[int] = set()
    tracked: set[int] = set()
    bookings = {
        b.id: b for b in session.scalars(select(Booking).where(Booking.venue_id == venue.id))
    }
    for slot in session.scalars(select(TableSlot).where(TableSlot.booking_id.in_(bookings))):
        tracked.add(slot.booking_id)
        protected.add(slot.table_id)
    for booking in bookings.values():
        seat = existing["seats"].get(booking.chosen_seat_id)
        if seat is not None:
            protected.add(seat.table_id)
            tracked.add(booking.id)
    public_ids = {b.public_id: b.id for b in bookings.values()}
    for entry in session.scalars(
        select(AuditLog).where(AuditLog.entity == "booking", AuditLog.entity_id.in_(public_ids))
    ):
        ids = {
            ident
            for name in ("tables", "from", "to")
            if isinstance(entry.detail.get(name), list)
            for ident in entry.detail[name]
            if type(ident) is int and ident in existing["tables"]
        }
        if ids:
            protected.update(ids)
            tracked.add(public_ids[entry.entity_id])
    if set(bookings) - tracked:
        protected.update(existing["tables"])
    # A diner may already be confirming a live hold; never delete its table.
    protected.update(
        session.scalars(
            select(Hold.resource_id).where(
                Hold.scope.like(f"venue-{venue.public_id}-%"),
                Hold.resource_kind == "table",
                Hold.expires_at > utc_now(),
            )
        )
    )
    return protected


def _check_bookings(session: Session, venue: Venue, body: dict, existing: dict) -> None:
    tables = [table for room in body["rooms"] for table in room["tables"]]
    kept = {t["id"] for t in tables if t["id"] is not None}
    removed = _protected_tables(session, venue, existing) - kept
    chosen = set(
        session.scalars(
            select(Booking.chosen_seat_id).where(
                Booking.venue_id == venue.id, Booking.chosen_seat_id.is_not(None)
            )
        )
    )
    kept_seats = {s["id"]: t["id"] for t in tables for s in t["seats"] if s["id"] is not None}
    for ident in chosen:
        old = existing["seats"].get(ident)
        if old is not None and kept_seats.get(ident) != old.table_id:
            removed.add(old.table_id)
    if removed:
        raise TablesInUse(
            [
                {"id": ident, "label": existing["tables"][ident].label}
                for ident in sorted(removed)
                if ident in existing["tables"]
            ]
        )


def _existing(session: Session, venue: Venue) -> dict[str, dict[int, Any]]:
    result = {}
    room_ids = select(Room.id).where(Room.venue_id == venue.id)
    for name, model in MODELS.items():
        criterion = (
            model.room_id.in_(room_ids)
            if name in {"openings", "fixtures"}
            else model.venue_id == venue.id
        )
        result[name] = {
            row.id: row
            for row in session.scalars(select(model).where(criterion).order_by(model.id))
        }
    return result


def view(session: Session, venue: Venue, keys: dict | None = None) -> dict[str, Any]:
    keys = keys or {}
    rows = _existing(session, venue)
    protected = _protected_tables(session, venue, rows)

    def key(name: str, ident: int) -> str:
        return keys.get((name, ident), f"{PREFIX[name]}{ident}")

    def item(name: str, row: Any) -> dict:
        result = {
            c.name: getattr(row, c.name)
            for c in row.__table__.columns
            if c.name not in {"venue_id", "room_id", "table_id", "zone_id", "reserved_tag"}
        }
        result["key"] = key(name, row.id)
        for field, value in result.items():
            if isinstance(value, time):
                result[field] = value.strftime("%H:%M")
        return result

    result = []
    for row in sorted(rows["rooms"].values(), key=lambda r: (r.position, r.id)):
        result.append(item("rooms", row))
    legacy = any(
        r.room_id is None for name in ("zones", "tables", "seats") for r in rows[name].values()
    )
    if not result or legacy:
        result.append(
            {
                "id": None,
                "key": "implicit-main",
                "name": "Main room",
                "is_outdoor": False,
                "north_deg": None,
                "position": len(result),
                "outline": {
                    "points": [
                        {"x": 0, "y": 0, "curve": 0},
                        {"x": venue.width, "y": 0, "curve": 0},
                        {"x": venue.width, "y": venue.height, "curve": 0},
                        {"x": 0, "y": venue.height, "curve": 0},
                    ]
                },
            }
        )
    for room in result:
        for name in ("openings", "fixtures", "zones", "tables"):
            room[name] = [
                item(name, row) for row in rows[name].values() if row.room_id == room["id"]
            ]
        for table in room["tables"]:
            row = rows["tables"][table["id"]]
            table["zone_key"] = key("zones", row.zone_id) if row.zone_id else None
            table["has_bookings"] = row.id in protected
            table["seats"] = [
                item("seats", seat) for seat in rows["seats"].values() if seat.table_id == row.id
            ]
    return {
        "base_version": venue.layout_version,
        "version": venue.layout_version,
        "rooms": result,
        "problems": validate_rooms(result),
    }


def _check_items(body: dict, existing: dict) -> None:
    seen_keys: dict[str, set] = {name: set() for name in MODELS}
    seen_ids: dict[str, set] = {name: set() for name in MODELS}

    def check(name: str, item: dict) -> None:
        if (
            item["key"] in seen_keys[name]
            or item["id"] is not None
            and item["id"] in seen_ids[name]
        ):
            raise ApiError(422, "validation", "Layout keys and ids must be unique.")
        if item["id"] is not None and item["id"] not in existing[name]:
            raise ApiError(404, "not_found", "Layout object not found.")
        seen_keys[name].add(item["key"])
        seen_ids[name].add(item["id"])

    for room in body["rooms"]:
        check("rooms", room)
        for name in ("zones", "tables", "openings", "fixtures"):
            for obj in room[name]:
                check(name, obj)
        zone_keys = {z["key"] for z in room["zones"]}
        labels = [t["label"].strip() for t in room["tables"]]
        if any(not label for label in labels) or len(set(labels)) != len(labels):
            raise ApiError(
                422, "validation", "Table names must be nonblank and unique in each room."
            )
        if sum(len(t["seats"]) for t in room["tables"]) > 1000:
            raise ApiError(422, "validation", "A room can contain at most 1000 chairs.")
        for table in room["tables"]:
            if table["zone_key"] is not None and table["zone_key"] not in zone_keys:
                raise ApiError(422, "validation", "Choose a zone in the same room.")
            if table["min_party"] > table["max_party"]:
                raise ApiError(422, "validation", "Minimum party exceeds maximum party.")
            for seat in table["seats"]:
                check("seats", seat)


def save(session: Session, venue: Venue, body: dict, *, actor: str) -> dict[str, Any]:
    version = session.scalar(
        update(Venue)
        .where(Venue.id == venue.id, Venue.layout_version == body["base_version"])
        .values(layout_version=Venue.layout_version + 1)
        .returning(Venue.layout_version)
    )
    if version is None:
        raise ApiError(409, "stale_layout", "This layout was changed in another tab or device.")
    existing = _existing(session, venue)
    _check_items(body, existing)
    _check_bookings(session, venue, body, existing)
    keys: dict = {}
    keep: dict[str, set[int]] = {name: set() for name in MODELS}

    def upsert(name: str, item: dict, parents: dict) -> Any:
        row = existing[name][item["id"]] if item["id"] is not None else MODELS[name](**parents)
        for field, value in {**item, **parents}.items():
            if field not in {
                "id",
                "key",
                "zone_key",
                "seats",
                "zones",
                "tables",
                "openings",
                "fixtures",
            }:
                if field in {"sun_from", "sun_until"}:
                    value = time.fromisoformat(value) if value else None
                setattr(row, field, value)
        session.add(row)
        session.flush()
        keep[name].add(row.id)
        keys[(name, row.id)] = item["key"]
        return row

    for room in body["rooms"]:
        row = upsert("rooms", room, {"venue_id": venue.id})
        zones = {
            z["key"]: upsert("zones", z, {"venue_id": venue.id, "room_id": row.id}).id
            for z in room["zones"]
        }
        for name in ("openings", "fixtures"):
            for obj in room[name]:
                upsert(name, obj, {"room_id": row.id})
        for table in room["tables"]:
            saved_table = upsert(
                "tables",
                table,
                {"venue_id": venue.id, "room_id": row.id, "zone_id": zones.get(table["zone_key"])},
            )
            for seat in table["seats"]:
                upsert(
                    "seats",
                    seat,
                    {"venue_id": venue.id, "room_id": row.id, "table_id": saved_table.id},
                )
    old_seats = list(existing["seats"])
    session.execute(
        delete(SeatNeighbour).where(
            or_(SeatNeighbour.seat_id.in_(old_seats), SeatNeighbour.neighbour_id.in_(old_seats))
        )
    )
    removed_openings = set(existing["openings"]) - keep["openings"]
    session.execute(
        delete(VenuePhoto).where(
            VenuePhoto.venue_id == venue.id, VenuePhoto.opening_id.in_(removed_openings)
        )
    )
    try:
        for name in ("seats", "tables", "zones", "openings", "fixtures", "rooms"):
            session.execute(
                delete(MODELS[name]).where(MODELS[name].id.in_(set(existing[name]) - keep[name]))
            )
        rebuild_neighbours(session, venue.id)
        audit.record(
            session, actor=actor, action="rooms.save", entity="venue", entity_id=venue.public_id
        )
        session.commit()
    except IntegrityError:
        session.rollback()
        raise ApiError(
            409, "conflict", "An object is still in use. Make it unavailable instead."
        ) from None
    session.refresh(venue)
    return view(session, venue, keys)
