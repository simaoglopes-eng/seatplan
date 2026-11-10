"""Change or cancel an existing booking (manage link, and staff cancelling).

Change: re-run the fit for the new date, time or party size. Keep the same
tables when they still suit the party and are free; otherwise let the
optimiser pick new ones. Old slots are deleted and new slots inserted in one
transaction, so the booking is never half-moved.
"""

from dataclasses import dataclass
from datetime import date, time

from sqlalchemy.orm import Session

from app.core.errors import ApiError, SeatTaken
from app.core.holds import commit_or_seat_taken
from app.models import Booking, Venue, WaitlistEntry
from app.optimiser.restaurant_assign import recommend_table
from app.optimiser.restaurant_model import choice_problem
from app.restaurant_service import booking_rows, emails, occupancy, schedule, waitlist
from app.restaurant_service.availability import PartyNeeds, check_covers_cap, table_specs_for
from app.restaurant_service.changes import record_change
from app.restaurant_service.clock import is_past, venue_zone


@dataclass(frozen=True)
class Change:
    day: date
    at: time
    party_size: int


def needs_of(booking: Booking, party_size: int | None = None) -> PartyNeeds:
    size = booking.party_size if party_size is None else party_size
    return PartyNeeds(size, booking.needs_accessible, booking.high_chairs)


def check_changeable(venue: Venue, booking: Booking) -> None:
    local_start = booking.start_at.astimezone(venue_zone(venue))
    if booking.status != "confirmed":
        raise ApiError(409, "conflict", "This booking can no longer be changed.")
    if is_past(venue, booking.date, local_start.time()):
        raise ApiError(409, "deadline_passed", "This booking has already started.")


def _pick_tables(
    session: Session, venue: Venue, booking: Booking, change: Change, window: tuple[int, int]
) -> tuple[int, ...]:
    """Same tables if they still work, else the optimiser's best free choice."""
    needs = needs_of(booking, change.party_size)
    busy = occupancy.merge(
        occupancy.booked_slots(session, venue, change.day, ignore_booking=booking.id),
        occupancy.held_slots(session, venue, change.day),
    )
    specs = table_specs_for(session, venue)
    current = occupancy.tables_of(session, booking)
    current_specs = [spec for spec in specs if spec.id in current]
    fits = bool(current) and choice_problem(current_specs, needs.spec(window)) is None
    if fits and occupancy.is_free(current, busy, window):
        return current
    picks = recommend_table(specs, busy, needs.spec(window), top=1)
    if not picks:
        raise SeatTaken("Sorry, no table is free for this change.")
    return picks[0].table_ids


def change_booking(
    session: Session, venue: Venue, booking: Booking, change: Change, token: str = ""
) -> None:
    """Move the booking to the new time and size. Commits, or raises SeatTaken.

    `token` is the diner's raw manage token, so the change email can link back.
    """
    check_changeable(venue, booking)
    period = schedule.check_bookable(session, venue, change.day, change.at)
    check_covers_cap(session, venue, change.day, period, change.at, change.party_size, booking.id)
    minutes = schedule.turn_minutes(session, venue, change.party_size)
    window = schedule.window_for(change.at, minutes)
    table_ids = _pick_tables(session, venue, booking, change, window)
    old_day = booking.date
    emails.drop_reminder(session, booking)
    old_tables = booking_rows.release_slots(session, booking)
    if table_ids != old_tables:
        # The optimiser chose the new tables, so they are no longer the diner's pick.
        booking.table_choice = "auto"
    booking.party_size = change.party_size
    booking_rows.set_times(venue, booking, change.day, window)
    session.flush()
    booking_rows.write_slots(session, booking, table_ids, window)
    emails.queue_change(session, venue, booking, token)
    record_change(
        session,
        venue,
        [old_day, change.day],
        actor="diner",
        action="booking.change",
        entity="booking",
        entity_id=booking.public_id,
        detail={"tables": list(table_ids), "party": change.party_size},
    )
    commit_or_seat_taken(session)


def cancel_booking(
    session: Session, venue: Venue, booking: Booking, actor: str, token: str = ""
) -> WaitlistEntry | None:
    """Cancel, free the tables, and offer them to the waitlist. Does not commit.

    Returns the waitlist entry that received the offer, if any. `token` is the
    diner's raw manage token when the diner cancels with their own link.
    """
    emails.drop_reminder(session, booking)
    freed = booking_rows.release_slots(session, booking)
    booking.status = "cancelled"
    session.flush()  # the freed slots must be gone before we look for free tables
    emails.queue_cancellation(session, venue, booking, token)
    offered = waitlist.offer_freed_tables(session, venue, booking, freed)
    record_change(
        session,
        venue,
        [booking.date],
        actor=actor,
        action="booking.cancel",
        entity="booking",
        entity_id=booking.public_id,
        detail={"offered_to_waitlist": offered is not None},
    )
    return offered
