"""Save a full venue layout (zones, tables, seats) and rebuild seat neighbours.

The editor sends the whole layout every time. Each item carries a "key" that
the browser chose (for new items) and, for items that already exist, their
database "id". Saving is an upsert by id: items with an id are updated, items
without one are inserted, and existing items missing from the layout are
deleted. Tables point at zones by key and seats point at tables by key,
because a brand-new zone has no database id yet.
"""

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.core.neighbours import SeatPoint, TableShape, neighbour_pairs
from app.models import Seat, SeatNeighbour, Venue, VenueTable, Zone


@dataclass
class LayoutItem:
    """One zone, table or seat as sent by the editor."""

    id: int | None
    key: str
    parent_key: str | None  # zone key for a table, table key for a seat
    fields: dict[str, Any] = field(default_factory=dict)


def _check_keys(items: list[LayoutItem], existing_ids: set[int], what: str) -> None:
    keys = [item.key for item in items]
    if len(keys) != len(set(keys)):
        raise ApiError(422, "validation", f"Two {what} share the same key.")
    for item in items:
        # An id from another venue must never be updated through this one.
        if item.id is not None and item.id not in existing_ids:
            raise ApiError(422, "validation", f"Unknown {what} id {item.id}.")


def _upsert(
    session: Session,
    model: type[Zone] | type[VenueTable] | type[Seat],
    venue_id: int,
    items: list[LayoutItem],
    extra: dict[str, dict[str, Any]],
) -> dict[str, int]:
    """Insert or update every item and return {key: database id}.

    `extra` holds per-key fields resolved by the caller (zone_id, table_id).
    """
    existing = {
        row.id: row for row in session.scalars(select(model).where(model.venue_id == venue_id))
    }
    _check_keys(items, set(existing), model.__tablename__)
    ids: dict[str, int] = {}
    for item in items:
        row = existing[item.id] if item.id is not None else model(venue_id=venue_id)
        for name, value in {**item.fields, **extra.get(item.key, {})}.items():
            setattr(row, name, value)
        session.add(row)
        session.flush()  # gives new rows their id
        ids[item.key] = row.id
    return ids


def _resolve_parents(
    items: list[LayoutItem], parent_ids: dict[str, int], column: str, required: bool
) -> dict[str, dict[str, Any]]:
    """Turn each item's parent key into the parent's database id."""
    resolved: dict[str, dict[str, Any]] = {}
    for item in items:
        if item.parent_key is None and not required:
            resolved[item.key] = {column: None}
        elif item.parent_key in parent_ids:
            resolved[item.key] = {column: parent_ids[item.parent_key]}
        else:
            raise ApiError(422, "validation", f"Item {item.key} points at a missing parent.")
    return resolved


def _delete_missing(session: Session, venue_id: int, keep: dict[str, set[int]]) -> None:
    """Remove rows of this venue that the new layout no longer contains.

    Children go first (seats, then tables, then zones) so foreign keys never
    point at a row that is already gone.
    """
    for model, name in ((Seat, "seats"), (VenueTable, "tables"), (Zone, "zones")):
        session.execute(
            delete(model).where((model.venue_id == venue_id) & model.id.not_in(keep[name]))
        )


def _venue_seat_ids(session: Session, venue_id: int) -> list[int]:
    return list(session.scalars(select(Seat.id).where(Seat.venue_id == venue_id)))


def rebuild_neighbours(session: Session, venue_id: int) -> int:
    """Recompute seat_neighbours for the whole venue. Returns pairs stored."""
    seat_ids = _venue_seat_ids(session, venue_id)
    session.execute(
        delete(SeatNeighbour).where(
            or_(SeatNeighbour.seat_id.in_(seat_ids), SeatNeighbour.neighbour_id.in_(seat_ids))
        )
    )
    # .all() reads every row first, so adding rows inside the loop cannot
    # disturb a query that is still being read.
    tables = session.scalars(select(VenueTable).where(VenueTable.venue_id == venue_id)).all()
    stored = 0
    for table in tables:
        shape = TableShape(
            table.shape, table.x + table.w / 2, table.y + table.h / 2, table.rotation
        )
        seats = session.scalars(select(Seat).where(Seat.table_id == table.id)).all()
        points = [SeatPoint(seat.id, seat.x, seat.y) for seat in seats]
        for a, b in neighbour_pairs(shape, points):
            session.add_all(
                [SeatNeighbour(seat_id=a, neighbour_id=b), SeatNeighbour(seat_id=b, neighbour_id=a)]
            )
            stored += 1
    return stored


def save_layout(
    session: Session,
    venue: Venue,
    zones: list[LayoutItem],
    tables: list[LayoutItem],
    seats: list[LayoutItem],
) -> dict[str, int]:
    """Apply a full layout. Does not commit. Returns counts for the response."""
    # Neighbour rows reference seats, so they must go before any seat is deleted.
    session.execute(
        delete(SeatNeighbour).where(SeatNeighbour.seat_id.in_(_venue_seat_ids(session, venue.id)))
    )
    zone_ids = _upsert(session, Zone, venue.id, zones, {})
    table_extra = _resolve_parents(tables, zone_ids, "zone_id", required=False)
    table_ids = _upsert(session, VenueTable, venue.id, tables, table_extra)
    seat_extra = _resolve_parents(seats, table_ids, "table_id", required=True)
    seat_ids = _upsert(session, Seat, venue.id, seats, seat_extra)
    keep = {
        "zones": set(zone_ids.values()),
        "tables": set(table_ids.values()),
        "seats": set(seat_ids.values()),
    }
    _delete_missing(session, venue.id, keep)
    pairs = rebuild_neighbours(session, venue.id)
    return {
        "zones": len(zone_ids),
        "tables": len(table_ids),
        "seats": len(seat_ids),
        "neighbour_pairs": pairs,
    }
