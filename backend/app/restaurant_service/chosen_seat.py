"""The diner's optional chair (spec 9.4).

The booking is for the whole table; the chair is only a wish that is shown to
the diner, in their email and to the staff. So there is no hold and no check
against other bookings. The server only makes sure the chair is a real,
usable chair at one of the tables the booking owns, and drops it when a change
moves the booking to other tables.
"""

from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models import Booking, Seat, Venue
from app.restaurant_service import ambience_view


def check_chosen_seat(
    session: Session, venue: Venue, seat_id: int, table_ids: tuple[int, ...]
) -> Seat:
    """The chair, or 422 unless it is a free-to-sit chair at one of `table_ids`.

    A chair of another restaurant, an unknown id and a chair of another table
    all get the same answer, so the message tells nothing about other venues.
    """
    seat = session.get(Seat, seat_id)
    if seat is None or seat.venue_id != venue.id or seat.table_id not in table_ids:
        raise ApiError(422, "validation", "That chair is not at your table.")
    if seat.is_blocked:
        raise ApiError(422, "validation", "That chair cannot be chosen.")
    return seat


def keep_seat_if_still_valid(
    session: Session, booking: Booking, table_ids: tuple[int, ...]
) -> None:
    """After the booking moved to `table_ids`: forget a chair that is no longer there."""
    if booking.chosen_seat_id is None:
        return
    seat = session.get(Seat, booking.chosen_seat_id)
    if seat is None or seat.table_id not in table_ids or seat.is_blocked:
        booking.chosen_seat_id = None


def seat_payload(
    session: Session, venue: Venue, booking: Booking, with_phrase: bool = False
) -> dict[str, Any] | None:
    """The chosen chair as the diner and the staff see it, or None.

    `with_phrase` adds "Facing the window" and the like. It costs a few
    queries, so the staff floor, which lists many bookings, leaves it out.
    """
    if booking.chosen_seat_id is None:
        return None
    seat = session.get(Seat, booking.chosen_seat_id)
    if seat is None:
        return None
    answer: dict[str, Any] = {"id": seat.id, "label": seat.label, "table_id": seat.table_id}
    if with_phrase:
        answer["phrase"] = ambience_view.seat_sentence(session, venue, seat)
    return answer
