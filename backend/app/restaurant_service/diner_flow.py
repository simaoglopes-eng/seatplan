"""The diner's journey: hold a table, confirm the booking.

hold:    check the time -> check the covers cap -> pick tables (the diner's or
         the optimiser's) -> hold every slot for 5 minutes.
confirm: read the hold -> check it still fits -> consume the hold -> insert
         the booking and ALL its table_slots rows -> commit once. The table_slots
         primary key has the final say (409 with alternatives if it refuses).
"""

from dataclasses import dataclass
from datetime import date, time

from sqlalchemy.orm import Session

from app.core.errors import ApiError, SeatTaken
from app.core.holds import commit_or_seat_taken
from app.models import Booking, Venue
from app.optimiser.restaurant_assign import recommend_table
from app.restaurant_service import booking_rows, emails, occupancy, schedule
from app.restaurant_service.availability import PartyNeeds, check_covers_cap, table_specs_for
from app.restaurant_service.changes import record_change
from app.restaurant_service.clock import time_of_slot
from app.restaurant_service.holding import (
    HeldTables,
    check_hold_caps,
    consume_hold,
    hold_tables,
)
from app.security import hash_token, new_token


@dataclass(frozen=True)
class HoldResult:
    hold_id: str
    table_ids: tuple[int, ...]
    expires_at: str
    table_choice: str


@dataclass(frozen=True)
class Contact:
    name: str
    email: str
    phone: str | None
    notes: str


def _auto_choices(
    session: Session, venue: Venue, day: date, window: tuple[int, int], needs: PartyNeeds
) -> list[tuple[int, ...]]:
    """The optimiser's top picks among tables nobody has booked or held."""
    busy = occupancy.merge(
        occupancy.booked_slots(session, venue, day), occupancy.held_slots(session, venue, day)
    )
    picks = recommend_table(table_specs_for(session, venue), busy, needs.spec(window), top=3)
    return [pick.table_ids for pick in picks]


@dataclass(frozen=True)
class HoldRequest:
    """What the diner asked to hold, and who asked (holding.client_key)."""

    day: date
    at: time
    needs: PartyNeeds
    table_ids: tuple[int, ...] | None
    client: str


def _options(
    session: Session, venue: Venue, request: HoldRequest, window: tuple[int, int]
) -> tuple[list[tuple[int, ...]], str]:
    """The table choices to try in order, and whether the diner chose them."""
    if not request.table_ids:
        return _auto_choices(session, venue, request.day, window, request.needs), "auto"
    booking_rows.check_tables(session, venue, request.table_ids, request.needs)
    # Holds do not know about confirmed bookings, so check those first.
    booked = occupancy.booked_slots(session, venue, request.day)
    if not occupancy.is_free(request.table_ids, booked, window):
        raise SeatTaken("Sorry, this table is already booked at that time.")
    return [tuple(sorted(request.table_ids))], "chosen"


def take_table_hold(session: Session, venue: Venue, request: HoldRequest) -> HoldResult:
    """Hold the diner's tables, or the best free ones. Raises SeatTaken when gone."""
    period = schedule.check_bookable(session, venue, request.day, request.at)
    check_covers_cap(session, venue, request.day, period, request.at, request.needs.size)
    minutes = schedule.turn_minutes(session, venue, request.needs.size)
    window = schedule.window_for(request.at, minutes)
    options, choice = _options(session, venue, request, window)
    table_count = len(occupancy.venue_tables(session, venue))
    for option in options:
        check_hold_caps(session, venue, request.day, request.client, (option, window), table_count)
        try:
            hold_id, expires_at = hold_tables(
                session, venue, request.day, option, window, choice, request.client
            )
        except SeatTaken:
            continue  # someone was faster on this one; try the next best
        # Open maps should show the table as held straight away.
        record_change(
            session,
            venue,
            [request.day],
            actor="diner",
            action="table.hold",
            entity="table",
            entity_id=",".join(str(t) for t in option),
            detail={"party": request.needs.size},
        )
        session.commit()
        return HoldResult(hold_id, option, expires_at.isoformat(), choice)
    if choice == "chosen":
        raise SeatTaken("Sorry, someone else is holding this table right now.")
    raise SeatTaken("Sorry, no table is free for this party at that time.")


def _check_hold_fits(session: Session, venue: Venue, held: HeldTables, needs: PartyNeeds) -> time:
    """The hold must still describe a bookable stay for this party. Returns its time."""
    at = time_of_slot(held.window[0])
    period = schedule.check_bookable(session, venue, held.day, at)
    expected = schedule.window_for(at, schedule.turn_minutes(session, venue, needs.size))
    if expected != held.window:
        raise ApiError(422, "validation", "The party size changed. Please pick the table again.")
    booking_rows.check_tables(session, venue, held.table_ids, needs)
    check_covers_cap(session, venue, held.day, period, at, needs.size)
    return at


def confirm_booking(
    session: Session, venue: Venue, held: HeldTables, needs: PartyNeeds, contact: Contact
) -> tuple[Booking, str]:
    """Turn a hold (see holding.read_hold) into a booking.

    Returns (booking, manage token). Raises SeatTaken if the database refuses
    the table_slots rows, HoldExpired if the hold ran out.
    """
    _check_hold_fits(session, venue, held, needs)
    consume_hold(session, venue, held)
    token = new_token()
    booking = Booking(
        venue_id=venue.id,
        party_size=needs.size,
        name=contact.name,
        email=contact.email,
        phone=contact.phone,
        notes=contact.notes,
        needs_accessible=needs.needs_accessible,
        high_chairs=needs.high_chairs,
        status="confirmed",
        source="diner",
        table_choice=held.table_choice,
        manage_token_hash=hash_token(token),
    )
    booking_rows.set_times(venue, booking, held.day, held.window)
    session.add(booking)
    session.flush()  # gives the booking its id for the table_slots rows
    booking_rows.write_slots(session, booking, held.table_ids, held.window)
    emails.queue_confirmation(session, venue, booking, token)
    record_change(
        session,
        venue,
        [held.day],
        actor="diner",
        action="booking.create",
        entity="booking",
        entity_id=booking.public_id,
        detail={"tables": list(held.table_ids), "party": needs.size},
    )
    commit_or_seat_taken(session)
    return booking, token
