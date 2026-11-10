"""The seat map payload: {width, height, zones, tables, seats}.

Two views of the same floor:
- attendee_map: what one attendee may see. Names of other people pass through
  core/privacy.py and nothing else about them (email, dietary note,
  accessibility need, token) is ever added.
- organiser_map: the full picture with real names, for the organiser only.
Shape agreed with the frontend in docs/decisions-log.md (MapSeat, MapTable).
"""

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.privacy import display_name
from app.events_service.access import event_scope
from app.events_service.problem import current_rows, event_guests, venue_seats
from app.models import (
    Acquaintance,
    Event,
    Guest,
    Hold,
    Seat,
    SeatAssignment,
    Venue,
    VenueTable,
    Zone,
    utc_now,
)


def map_frame(session: Session, venue: Venue) -> dict[str, Any]:
    """Everything except the seats: size, zones and tables."""
    zones = session.scalars(select(Zone).where(Zone.venue_id == venue.id).order_by(Zone.id))
    tables = session.scalars(
        select(VenueTable).where(VenueTable.venue_id == venue.id).order_by(VenueTable.id)
    )
    return {
        "width": venue.width,
        "height": venue.height,
        "zones": [
            {"id": z.id, "name": z.name, "kind": z.kind, "x": z.x, "y": z.y, "w": z.w, "h": z.h}
            for z in zones
        ],
        "tables": [_table_dict(table) for table in tables],
    }


def _table_dict(table: VenueTable) -> dict[str, Any]:
    return {
        "id": table.id,
        "label": table.label,
        "shape": table.shape,
        "x": table.x,
        "y": table.y,
        "w": table.w,
        "h": table.h,
        "rotation": table.rotation,
        "zone_id": table.zone_id,
        "accessible": table.is_accessible,
    }


def live_holds(session: Session, event: Event) -> dict[int, str]:
    """seat id -> holder key, for holds that have not expired yet."""
    query = select(Hold).where(
        (Hold.scope == event_scope(event))
        & (Hold.resource_kind == "seat")
        & (Hold.expires_at > utc_now())
    )
    return {hold.resource_id: hold.holder_key for hold in session.scalars(query)}


def holder_key(guest: Guest) -> str:
    """How holds name their holder. Never the token: holds are not secret."""
    return f"guest-{guest.id}"


def known_ids(session: Session, guest: Guest) -> set[int]:
    """People this guest marked as "I know them" (their own list only)."""
    query = select(Acquaintance.knows_guest_id).where(Acquaintance.guest_id == guest.id)
    return set(session.scalars(query))


def _seat_base(seat: Seat) -> dict[str, Any]:
    return {
        "id": seat.id,
        "table_id": seat.table_id,
        "label": seat.label,
        "x": seat.x,
        "y": seat.y,
        "accessible": seat.is_accessible,
    }


def _attendee_state(
    seat: Seat, me: Guest, owner: SeatAssignment | None, holder: str | None, knows: set[int]
) -> str:
    """One state per seat, from the attendee's point of view (contract section 5)."""
    if owner is not None and owner.guest_id == me.id:
        return "mine"
    if owner is not None:
        return "friend" if owner.guest_id in knows else "taken"
    # A reserved seat for a tag this attendee does not have cannot be chosen
    # by them, so to them it is simply not available.
    if seat.is_blocked or (seat.reserved_tag is not None and seat.reserved_tag != me.reserved_tag):
        return "blocked"
    if holder is not None:
        return "held"
    return "free"


def attendee_map(session: Session, event: Event, venue: Venue, me: Guest) -> dict[str, Any]:
    rows = current_rows(session, event)
    owner_of = {row.seat_id: row for row in rows.values()}
    guests = {guest.id: guest for guest in event_guests(session, event)}
    holds = live_holds(session, event)
    knows = known_ids(session, me)
    seats = []
    for seat in venue_seats(session, venue.id):
        owner = owner_of.get(seat.id)
        state = _attendee_state(seat, me, owner, holds.get(seat.id), knows)
        occupant = None
        if state == "mine":
            occupant = "You"
        elif owner is not None:
            other = guests[owner.guest_id]
            occupant = display_name(other.name, event.privacy_mode, other.wants_anonymous)
        seats.append({**_seat_base(seat), "state": state, "occupant": occupant})
    return {**map_frame(session, venue), "seats": seats}


def _organiser_state(seat: Seat, owner: SeatAssignment | None, holder: str | None) -> str:
    if owner is not None:
        return "taken"
    if seat.is_blocked:
        return "blocked"
    return "held" if holder is not None else "free"


def organiser_map(session: Session, event: Event, venue: Venue) -> dict[str, Any]:
    """Real names, sources and reserved tags: the organiser's working view."""
    rows = current_rows(session, event)
    owner_of = {row.seat_id: row for row in rows.values()}
    guests = {guest.id: guest for guest in event_guests(session, event)}
    holds = live_holds(session, event)
    seats = []
    for seat in venue_seats(session, venue.id):
        owner = owner_of.get(seat.id)
        seats.append(
            {
                **_seat_base(seat),
                "state": _organiser_state(seat, owner, holds.get(seat.id)),
                "occupant": guests[owner.guest_id].name if owner else None,
                "guest_id": owner.guest_id if owner else None,
                "source": owner.source if owner else None,
                "blocked": seat.is_blocked,
                "reserved_tag": seat.reserved_tag,
            }
        )
    return {**map_frame(session, venue), "seats": seats}
