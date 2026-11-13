"""The staff side of one evening: live floor, walk-ins, status changes, moves.

Floor status of a table at a given time comes from the booking that owns its
table_slots row for that slot:
  no row -> free,  confirmed -> reserved,  seated -> seated,  finishing -> finishing.
"""

from dataclasses import dataclass
from datetime import date, time
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError, SeatTaken
from app.core.holds import commit_or_seat_taken
from app.models import Booking, Organiser, TableSlot, Venue, VenueTable
from app.optimiser.restaurant_assign import recommend_table
from app.restaurant_service import booking_rows, chosen_seat, map_view, occupancy, schedule
from app.restaurant_service.availability import PartyNeeds, table_specs_for
from app.restaurant_service.changes import record_change
from app.restaurant_service.clock import booking_window, hhmm, slot_of
from app.restaurant_service.manage_flow import cancel_booking, needs_of
from app.security import hash_token, new_token

FLOOR_STATUS = {"confirmed": "reserved", "seated": "seated", "finishing": "finishing"}
# Statuses that hand the table back. Once there, a booking cannot be reopened,
# because its slots may already belong to someone else.
CLOSING_STATUSES = ("completed", "no_show", "cancelled")


def _owners_at(session: Session, venue: Venue, day: date, slot: int) -> dict[int, Booking]:
    """Table id -> the booking sitting there during this slot."""
    query = (
        select(TableSlot.table_id, Booking)
        .join(Booking, Booking.id == TableSlot.booking_id)
        .where(
            (Booking.venue_id == venue.id)
            & (TableSlot.date == day)
            & (TableSlot.slot_index == slot)
        )
    )
    return {table_id: booking for table_id, booking in session.execute(query)}


def _floor_table(table: VenueTable, owner: Booking | None) -> dict[str, Any]:
    status = FLOOR_STATUS[owner.status] if owner else "free"
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
        "min_party": table.min_party,
        "max_party": table.max_party,
        "accessible": table.is_accessible,
        "high_chair_ok": table.high_chair_ok,
        "combine_group": table.combine_group,
        "status": status,
        "booking_id": owner.public_id if owner else None,
        "party_size": owner.party_size if owner else None,
        "name": owner.name if owner else None,
    }


def _services(session: Session, venue: Venue, day: date) -> list[dict[str, str]]:
    """The day's opening hours, so the time slider knows where services start and end."""
    return [
        {
            "name": period.name,
            "start_time": hhmm(period.start_time),
            "end_time": hhmm(period.end_time),
        }
        for period in schedule.periods_for_day(session, venue, day)
    ]


def floor(session: Session, venue: Venue, day: date, at: time) -> dict[str, Any]:
    """GET /staff/{vid}/floor: every table's status now, plus the day's bookings.

    It also carries zones and seats, so the staff page draws the same map as diners.
    """
    owners = _owners_at(session, venue, day, slot_of(at))
    # A table that was switched off stays on the floor only while it still has a booking.
    venue_tables = [
        t
        for t in occupancy.venue_tables(session, venue, include_inactive=True)
        if t.is_active or t.id in owners
    ]
    tables = [_floor_table(t, owners.get(t.id)) for t in venue_tables]
    # A seat looks taken while its table has a booking at this time.
    seat_states = {t.id: "taken" if t.id in owners else "free" for t in venue_tables}
    bookings = [
        booking_rows.describe(session, venue, booking)
        for booking in occupancy.active_bookings(session, venue, day)
    ]
    return {
        "date": day.isoformat(),
        "time": hhmm(at),
        "width": venue.width,
        "height": venue.height,
        "zones": map_view.zones_payload(session, venue),
        "seats": map_view.seats_payload(session, venue, seat_states),
        "services": _services(session, venue, day),
        "tables": tables,
        "bookings": bookings,
    }


@dataclass(frozen=True)
class WalkIn:
    day: date
    at: time
    needs: PartyNeeds
    name: str
    table_ids: tuple[int, ...] | None


def _walkin_tables(
    session: Session, venue: Venue, walkin: WalkIn, window: tuple[int, int]
) -> tuple[int, ...]:
    busy = occupancy.merge(
        occupancy.booked_slots(session, venue, walkin.day),
        occupancy.held_slots(session, venue, walkin.day),
    )
    if walkin.table_ids:
        booking_rows.check_tables(session, venue, walkin.table_ids, walkin.needs)
        if not occupancy.is_free(walkin.table_ids, busy, window):
            raise SeatTaken("That table is not free for the whole stay.")
        return tuple(sorted(walkin.table_ids))
    picks = recommend_table(table_specs_for(session, venue), busy, walkin.needs.spec(window), 1)
    if not picks:
        raise SeatTaken("No table is free for this party now. Try the what-if planner.")
    return picks[0].table_ids


def seat_walkin(session: Session, venue: Venue, walkin: WalkIn, user: Organiser) -> Booking:
    """Seat a walk-in party straight away. Commits, or raises SeatTaken."""
    minutes = schedule.turn_minutes(session, venue, walkin.needs.size)
    window = schedule.window_for(walkin.at, minutes)
    table_ids = _walkin_tables(session, venue, walkin, window)
    booking = Booking(
        venue_id=venue.id,
        party_size=walkin.needs.size,
        name=walkin.name,
        email="",  # walk-ins get no emails
        needs_accessible=walkin.needs.needs_accessible,
        high_chairs=walkin.needs.high_chairs,
        status="seated",
        source="walk_in",
        table_choice="chosen" if walkin.table_ids else "auto",
        # Nobody receives this token, so no manage link can ever reach the booking.
        manage_token_hash=hash_token(new_token()),
    )
    booking_rows.set_times(venue, booking, walkin.day, window)
    session.add(booking)
    session.flush()
    booking_rows.write_slots(session, booking, table_ids, window)
    record_change(
        session,
        venue,
        [walkin.day],
        actor=user.email,
        action="booking.walkin",
        entity="booking",
        entity_id=booking.public_id,
        detail={"tables": list(table_ids)},
    )
    commit_or_seat_taken(session)
    return booking


def load_booking(session: Session, venue: Venue, public_id: str) -> Booking:
    booking = session.scalars(
        select(Booking).where((Booking.venue_id == venue.id) & (Booking.public_id == public_id))
    ).first()
    if booking is None:
        raise ApiError(404, "not_found", "Booking not found.")
    return booking


def set_status(
    session: Session, venue: Venue, booking: Booking, status: str, user: Organiser
) -> None:
    """Change a booking's status. Closing statuses give the tables back. Commits."""
    if booking.status in CLOSING_STATUSES:
        raise ApiError(409, "conflict", "This booking is already closed.")
    if status == "cancelled":
        cancel_booking(session, venue, booking, actor=user.email)
    else:
        if status in CLOSING_STATUSES:
            booking_rows.release_slots(session, booking)
        old_status, booking.status = booking.status, status
        record_change(
            session,
            venue,
            [booking.date],
            actor=user.email,
            action="booking.status",
            entity="booking",
            entity_id=booking.public_id,
            detail={"from": old_status, "to": status},
        )
    session.commit()


def move_booking(
    session: Session, venue: Venue, booking: Booking, table_ids: tuple[int, ...], user: Organiser
) -> None:
    """Move a booking to other tables (or a combination). Commits, or SeatTaken.

    The same rules as everywhere apply: the tables must suit the party
    (size, combine group, accessibility, high chairs) and be free for the stay.
    """
    if booking.status in CLOSING_STATUSES:
        raise ApiError(409, "conflict", "This booking is already closed.")
    booking_rows.check_tables(session, venue, table_ids, needs_of(booking))
    window = booking_window(venue, booking)
    busy = occupancy.merge(
        occupancy.booked_slots(session, venue, booking.date, ignore_booking=booking.id),
        occupancy.held_slots(session, venue, booking.date),
    )
    if not occupancy.is_free(table_ids, busy, window):
        raise SeatTaken("Those tables are not free for the whole stay.")
    old_tables = booking_rows.release_slots(session, booking)
    booking_rows.write_slots(session, booking, tuple(sorted(table_ids)), window)
    chosen_seat.keep_seat_if_still_valid(session, booking, tuple(sorted(table_ids)))
    record_change(
        session,
        venue,
        [booking.date],
        actor=user.email,
        action="booking.move",
        entity="booking",
        entity_id=booking.public_id,
        detail={"from": list(old_tables), "to": sorted(table_ids)},
    )
    commit_or_seat_taken(session)
