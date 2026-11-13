"""A booking made with wishes (sun, view, ...) is never moved by the staff planner (what-if, service re-plan).

The planner does not weigh wishes per party, so moving such a booking could quietly lose what the diner asked
for. It keeps the table it was given with those wishes; bookings without wishes may still move.
"""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from test_restaurant_helpers import book, future_day, hold, make_restaurant

from app.models import Booking, Organiser, Venue
from app.restaurant_service.whatif import tonight


def book_at(client: TestClient, place, at: str, **extra) -> None:
    held = hold(
        client, place, future_day(), at, 2, **{k: v for k, v in extra.items() if k == "prefs"}
    )
    assert held.status_code == 201, held.text
    answer = book(client, place, held.json()["hold_id"], 2, **extra)
    assert answer.status_code == 201, answer.text


def test_a_booking_with_wishes_is_fixed_for_the_planner_and_one_without_is_not(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    book_at(client, place, "19:00", prefs=["sun"])
    book_at(client, place, "19:00", email="other.diner@example.com")
    venue = session.get(Venue, place.venue_id)
    assert venue is not None
    parties, _plan, by_id = tonight(session, venue, future_day())
    fixed = {by_id[p.id].prefs and "wishes" or "plain": p.fixed_tables for p in parties}
    assert fixed["wishes"] is not None  # stays where it is
    assert fixed["plain"] is None  # the optimiser may still move it
    assert session.query(Booking).count() == 2
