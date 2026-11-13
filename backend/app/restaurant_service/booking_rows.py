"""Small shared steps on booking rows: load, describe, and (re)write table slots.

table_slots is where "no double booking" is enforced: its primary key is
(table_id, date, slot_index), so the database refuses a second booking on the
same table in the same slot. We never check first and insert later; we insert
and let the database decide, at the flush in write_slots.
"""

from datetime import date
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ApiError, SeatTaken
from app.models import Booking, TableSlot, Venue, VenueTable
from app.optimiser.restaurant_model import choice_problem
from app.restaurant_service import occupancy
from app.restaurant_service.availability import PartyNeeds, table_specs_for
from app.restaurant_service.clock import booking_window, hhmm, slot_moment, venue_zone
from app.security import hash_token


def write_slots(
    session: Session, booking: Booking, table_ids: tuple[int, ...], window: tuple[int, int]
) -> None:
    """Add one table_slots row per table per slot, or raise SeatTaken. Does not commit.

    We flush straight away so the primary key is checked here, inside our own
    try. Without it, the next query would flush the rows by itself and the
    clash would surface as a raw database error somewhere else.
    """
    for table_id in table_ids:
        for slot in range(*window):
            session.add(
                TableSlot(
                    table_id=table_id, date=booking.date, slot_index=slot, booking_id=booking.id
                )
            )
    try:
        session.flush()
    except IntegrityError:
        session.rollback()
        raise SeatTaken() from None


def release_slots(session: Session, booking: Booking) -> tuple[int, ...]:
    """Give the booking's tables back. Returns the table ids it had."""
    table_ids = occupancy.tables_of(session, booking)
    session.execute(delete(TableSlot).where(TableSlot.booking_id == booking.id))
    return table_ids


def set_times(venue: Venue, booking: Booking, day: date, window: tuple[int, int]) -> None:
    booking.date = day
    booking.start_at = slot_moment(venue, day, window[0])
    booking.end_at = slot_moment(venue, day, window[1])


def check_tables(
    session: Session, venue: Venue, table_ids: tuple[int, ...], needs: PartyNeeds
) -> None:
    """422 unless these tables belong to the venue and can host the party."""
    specs = {spec.id: spec for spec in table_specs_for(session, venue)}
    if not table_ids or any(table_id not in specs for table_id in table_ids):
        raise ApiError(422, "validation", "Unknown table for this restaurant.")
    chosen = [specs[table_id] for table_id in table_ids]
    problem = choice_problem(chosen, needs.spec((0, 1)))
    if problem is not None:
        raise ApiError(422, "validation", f"These tables do not suit this party: {problem}.")


def load_by_token(session: Session, token: str) -> Booking:
    """Find a booking by its manage token. Unknown tokens are a plain 404."""
    booking = session.scalars(
        select(Booking).where(Booking.manage_token_hash == hash_token(token))
    ).first()
    if booking is None:
        raise ApiError(404, "not_found", "Booking not found.")
    return booking


def table_labels(session: Session, table_ids: tuple[int, ...]) -> list[str]:
    if not table_ids:
        return []
    rows = session.scalars(select(VenueTable).where(VenueTable.id.in_(table_ids)))
    labels = {row.id: row.label for row in rows}
    return [labels[table_id] for table_id in table_ids]


def describe(session: Session, venue: Venue, booking: Booking) -> dict[str, Any]:
    """A booking as the diner or staff sees it. No token, no hash."""
    zone = venue_zone(venue)
    table_ids = occupancy.tables_of(session, booking)
    start, end = booking_window(venue, booking)
    return {
        "id": booking.public_id,
        "restaurant": {"public_id": venue.public_id, "name": venue.name},
        "date": booking.date.isoformat(),
        "time": hhmm(booking.start_at.astimezone(zone).time()),
        "end_time": hhmm(booking.end_at.astimezone(zone).time()),
        "slots": [start, end],
        "party_size": booking.party_size,
        "name": booking.name,
        "notes": booking.notes,
        "needs_accessible": booking.needs_accessible,
        "high_chairs": booking.high_chairs,
        "prefs": list(booking.prefs or []),
        "status": booking.status,
        "source": booking.source,
        "table_choice": booking.table_choice,
        "table_ids": list(table_ids),
        "tables": table_labels(session, table_ids),
    }
