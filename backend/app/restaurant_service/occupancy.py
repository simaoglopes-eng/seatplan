"""Who uses which table when: read from table_slots, holds and bookings.

Turns database rows into the plain shapes the optimiser understands:
TableSpec for each table, and "busy" maps of table id -> set of slot indexes.
"""

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Booking, Hold, TableSlot, Venue, VenueTable, Zone, utc_now
from app.optimiser.restaurant_model import TableSpec
from app.restaurant_service.clock import booking_window

# Bookings in these states own their table_slots rows. Every other state
# (completed, cancelled, no_show) has already handed its table back.
ACTIVE_STATUSES = ("confirmed", "seated", "finishing")

Busy = dict[int, set[int]]


def scope_for(venue: Venue, day: date) -> str:
    """Live-update scope of one restaurant on one date (contract section 5).

    Holds use the same text as their scope, so "all holds of this evening" is
    one simple WHERE clause.
    """
    return f"venue-{venue.public_id}-{day.isoformat()}"


def venue_tables(session: Session, venue: Venue) -> list[VenueTable]:
    query = select(VenueTable).where(VenueTable.venue_id == venue.id).order_by(VenueTable.id)
    return list(session.scalars(query))


def zone_kinds(session: Session, venue: Venue) -> dict[int, str]:
    """Zone id -> kind ("window", "terrace", ...). The optimiser compares kinds."""
    rows = session.scalars(select(Zone).where(Zone.venue_id == venue.id))
    return {zone.id: zone.kind for zone in rows}


def table_specs(tables: list[VenueTable], kinds: dict[int, str]) -> list[TableSpec]:
    return [
        TableSpec(
            id=table.id,
            min_party=table.min_party,
            max_party=table.max_party,
            zone=kinds.get(table.zone_id, "general") if table.zone_id else "general",
            accessible=table.is_accessible,
            high_chair_ok=table.high_chair_ok,
            combine_group=table.combine_group,
            label=table.label,
        )
        for table in tables
    ]


def booked_slots(
    session: Session, venue: Venue, day: date, ignore_booking: int | None = None
) -> Busy:
    """Slots taken by real bookings. `ignore_booking` leaves one booking out,
    which is how a booking that is being changed stops blocking itself."""
    query = (
        select(TableSlot)
        .join(VenueTable, VenueTable.id == TableSlot.table_id)
        .where((VenueTable.venue_id == venue.id) & (TableSlot.date == day))
    )
    busy: Busy = {}
    for row in session.scalars(query):
        if row.booking_id != ignore_booking:
            busy.setdefault(row.table_id, set()).add(row.slot_index)
    return busy


def held_slots(session: Session, venue: Venue, day: date) -> Busy:
    """Slots that diners are holding right now (live holds only).

    A table hold has one row per slot, and its slot_key is the slot index as
    text, so overlapping windows really do clash (see holding.py).
    """
    query = select(Hold).where(
        (Hold.scope == scope_for(venue, day))
        & (Hold.resource_kind == "table")
        & (Hold.expires_at > utc_now())
    )
    busy: Busy = {}
    for hold in session.scalars(query):
        busy.setdefault(hold.resource_id, set()).add(int(hold.slot_key))
    return busy


def merge(first: Busy, second: Busy) -> Busy:
    merged: Busy = {table_id: set(slots) for table_id, slots in first.items()}
    for table_id, slots in second.items():
        merged.setdefault(table_id, set()).update(slots)
    return merged


def is_free(choice: tuple[int, ...], busy: Busy, window: tuple[int, int]) -> bool:
    slots = range(*window)
    return all(slot not in busy.get(table_id, set()) for table_id in choice for slot in slots)


def active_bookings(session: Session, venue: Venue, day: date) -> list[Booking]:
    query = (
        select(Booking)
        .where(
            (Booking.venue_id == venue.id)
            & (Booking.date == day)
            & Booking.status.in_(ACTIVE_STATUSES)
        )
        .order_by(Booking.start_at, Booking.id)
    )
    return list(session.scalars(query))


def tables_of(session: Session, booking: Booking) -> tuple[int, ...]:
    """The sorted table ids a booking owns (empty once it has handed them back)."""
    query = select(TableSlot.table_id).where(TableSlot.booking_id == booking.id).distinct()
    return tuple(sorted(session.scalars(query)))


def covers_by_start(
    session: Session, venue: Venue, day: date, ignore_booking: int | None = None
) -> dict[int, int]:
    """Start slot -> covers (guests) of the active bookings arriving in that slot."""
    covers: dict[int, int] = {}
    for booking in active_bookings(session, venue, day):
        if booking.id == ignore_booking:
            continue
        start, _end = booking_window(venue, booking)
        covers[start] = covers.get(start, 0) + booking.party_size
    return covers
