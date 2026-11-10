"""Finding S8: one client must not fill a restaurant with confirmed bookings.

Two caps on POST /r/{vid}/bookings (see restaurant_service/booking_caps.py):
- one email address may hold only a few upcoming diner bookings per restaurant;
- one client address may make only a limited number of bookings per
  restaurant per day.
Real diners never meet them: a change, a cancel-then-rebook, staff bookings
and walk-ins all stay possible.
"""

from datetime import UTC, datetime, time, timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from test_restaurant_helpers import (
    Place,
    book,
    future_day,
    hold,
    hold_and_book,
    make_restaurant,
    place_booking,
)

from app.models import Booking, Hold, Organiser

# The documented limits, repeated here on purpose: if someone changes the
# constants, these tests make them think about whether real diners are still safe.
EMAIL_CAP = 4
ADDRESS_CAP = 10


def _hold_then_book(client: TestClient, place: Place, days: int, email: str) -> Response:
    """Hold a table for two at 19:00, `days` from today, then book it as `email`."""
    held = hold(client, place, future_day(days), "19:00", 2)
    assert held.status_code == 201, held.text
    return book(client, place, held.json()["hold_id"], 2, email=email)


def _fill_email_cap(client: TestClient, place: Place) -> list[str]:
    """Book EMAIL_CAP nights as lia.moreno@example.com. Returns the manage tokens."""
    tokens = []
    for offset in range(EMAIL_CAP):
        booked = _hold_then_book(client, place, 7 + offset, "lia.moreno@example.com")
        assert booked.status_code == 201, booked.text
        tokens.append(booked.json()["manage_token"])
    return tokens


def _bookings(session: Session) -> int:
    session.expire_all()
    return session.scalar(select(func.count()).select_from(Booking)) or 0


def test_one_email_can_hold_only_a_few_upcoming_bookings(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    _fill_email_cap(client, place)
    # Upper case is the same mailbox, so it is the same diner.
    refused = _hold_then_book(client, place, 20, "LIA.MORENO@example.com")
    assert refused.status_code == 429
    error = refused.json()["error"]
    assert error["code"] == "rate_limited"
    assert "upcoming bookings" in error["message"]
    assert _bookings(session) == EMAIL_CAP
    # The refused hold was not used up: the table is still held, not booked.
    assert session.scalar(select(func.count()).select_from(Hold)) > 0
    # Another diner on the same connection can still book.
    other = _hold_then_book(client, place, 21, "noor.haddad@example.com")
    assert other.status_code == 201, other.text


def test_a_normal_diner_can_book_change_and_view(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    token = hold_and_book(client, place, future_day(), "19:00", 2)["manage_token"]
    assert client.get(f"/api/b/{token}").json()["status"] == "confirmed"
    second = hold_and_book(client, place, future_day(14), "13:00", 3)
    assert second["booking"]["party_size"] == 3


def test_a_change_still_works_at_the_cap(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    tokens = _fill_email_cap(client, place)
    changed = client.patch(f"/api/b/{tokens[0]}", json={"time": "20:00", "party_size": 3})
    assert changed.status_code == 200, changed.text
    assert changed.json()["time"] == "20:00" and changed.json()["party_size"] == 3
    assert _bookings(session) == EMAIL_CAP


def test_cancel_then_rebook_works_at_the_cap(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    tokens = _fill_email_cap(client, place)
    assert client.delete(f"/api/b/{tokens[0]}").status_code == 200
    rebooked = _hold_then_book(client, place, 7, "lia.moreno@example.com")
    assert rebooked.status_code == 201, rebooked.text


def test_past_bookings_do_not_count(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    _fill_email_cap(client, place)
    # Pretend the first visit already happened.
    first = session.scalars(select(Booking).order_by(Booking.id)).first()
    assert first is not None
    first.start_at = datetime.now(UTC) - timedelta(days=2, hours=2)
    first.end_at = datetime.now(UTC) - timedelta(days=2)
    session.commit()
    again = _hold_then_book(client, place, 20, "lia.moreno@example.com")
    assert again.status_code == 201, again.text


def test_staff_bookings_and_walk_ins_do_not_count(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    labels = ("T1", "T2", "T3", "T4", "T5", "T6")
    for offset, label in enumerate(labels):
        made = place_booking(session, place, [label], future_day(30), time(19), 90, 2)
        made.email = "lia.moreno@example.com"
        made.source = "walk_in" if offset % 2 else "staff"
    session.commit()
    booked = _hold_then_book(client, place, 7, "lia.moreno@example.com")
    assert booked.status_code == 201, booked.text


def test_one_address_can_make_only_a_few_bookings_per_day(
    app: FastAPI, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    one = TestClient(app, client=("198.51.100.7", 50000))
    for offset in range(ADDRESS_CAP):
        email = f"diner{offset}@example.com"  # a new email each time: only the address repeats
        booked = _hold_then_book(one, place, 7 + offset, email)
        assert booked.status_code == 201, booked.text
    refused = _hold_then_book(one, place, 30, "diner-extra@example.com")
    assert refused.status_code == 429
    assert refused.json()["error"]["code"] == "rate_limited"
    assert "today" in refused.json()["error"]["message"]
    assert _bookings(session) == ADDRESS_CAP
    # Another address, and the same address at another restaurant, are not blocked.
    two = TestClient(app, client=("198.51.100.8", 50000))
    assert _hold_then_book(two, place, 31, "noor.haddad@example.com").status_code == 201
    elsewhere = make_restaurant(session, organiser)
    assert _hold_then_book(one, elsewhere, 7, "diner-extra@example.com").status_code == 201


# ---------------------------------------------------------------- attacks (verifier, 2026-11-10)


def test_plus_tags_and_capitals_are_the_same_mailbox(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    _fill_email_cap(client, place)
    # "+anything" reaches the same inbox at almost every provider.
    for variant in ("lia.moreno+again@example.com", "Lia.Moreno+X@EXAMPLE.COM"):
        refused = _hold_then_book(client, place, 20, variant)
        assert refused.status_code == 429, variant
    assert _bookings(session) == EMAIL_CAP


def test_spaces_around_the_email_do_not_make_a_new_diner(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    _fill_email_cap(client, place)
    padded = _hold_then_book(client, place, 20, "  lia.moreno@example.com ")
    # Either refused as invalid or counted as the same diner, never booked.
    assert padded.status_code in (422, 429), padded.text
    assert _bookings(session) == EMAIL_CAP


def _book_from(client: TestClient, place: Place, days: int, email: str, **headers: str) -> int:
    held = client.post(
        f"/api/r/{place.public_id}/hold",
        json={"date": future_day(days).isoformat(), "time": "19:00", "party": 2},
        headers=headers,
    )
    assert held.status_code == 201, held.text
    body = {"hold_id": held.json()["hold_id"], "party": 2, "name": "Lia Moreno", "email": email}
    return client.post(f"/api/r/{place.public_id}/bookings", json=body, headers=headers).status_code


def test_a_typed_forwarded_header_does_not_reset_the_daily_cap(
    app: FastAPI, session: Session, organiser: Organiser
) -> None:
    # Off Vercel the header is whatever the caller typed (S1), so it is ignored.
    place = make_restaurant(session, organiser)
    one = TestClient(app, client=("198.51.100.9", 50000))
    for offset in range(ADDRESS_CAP):
        fake = {"X-Forwarded-For": f"203.0.113.{offset + 1}"}
        assert _book_from(one, place, 7 + offset, f"d{offset}@example.com", **fake) == 201
    fake = {"X-Forwarded-For": "203.0.113.250"}
    assert _book_from(one, place, 30, "d-extra@example.com", **fake) == 429


def test_ipv6_addresses_of_one_network_share_the_daily_cap(
    app: FastAPI, session: Session, organiser: Organiser
) -> None:
    # One home connection gets a whole /64 of IPv6 addresses: a new address
    # per request costs nothing, so the cap counts the /64 network.
    place = make_restaurant(session, organiser)
    for offset in range(ADDRESS_CAP):
        here = TestClient(app, client=(f"2001:db8:1:2::{offset + 1:x}", 50000))
        assert _book_from(here, place, 7 + offset, f"v6-{offset}@example.com") == 201
    same_network = TestClient(app, client=("2001:db8:1:2:ffff::1", 50000))
    assert _book_from(same_network, place, 30, "v6-extra@example.com") == 429
    other_network = TestClient(app, client=("2001:db8:1:3::1", 50000))
    assert _book_from(other_network, place, 31, "v6-other@example.com") == 201


def test_cancel_and_rebook_loops_stop_at_the_daily_cap(
    app: FastAPI, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    one = TestClient(app, client=("198.51.100.10", 50000))
    for _ in range(ADDRESS_CAP):
        booked = _hold_then_book(one, place, 9, "lia.moreno@example.com")
        assert booked.status_code == 201, booked.text
        assert one.delete(f"/api/b/{booked.json()['manage_token']}").status_code == 200
    refused = _hold_then_book(one, place, 9, "lia.moreno@example.com")
    assert refused.status_code == 429
    assert "today" in refused.json()["error"]["message"]


def test_joining_the_waitlist_does_not_use_up_the_booking_caps(
    app: FastAPI, session: Session, organiser: Organiser
) -> None:
    # The waitlist has its own per-minute limit (S10 is open); it never books.
    place = make_restaurant(session, organiser)
    one = TestClient(app, client=("198.51.100.11", 50000))
    for offset in range(5):
        body = {
            "date": future_day(7 + offset).isoformat(),
            "time": "19:00",
            "party": 2,
            "name": "Lia Moreno",
            "email": "lia.moreno@example.com",
        }
        assert one.post(f"/api/r/{place.public_id}/waitlist", json=body).status_code == 201
    assert _hold_then_book(one, place, 20, "lia.moreno@example.com").status_code == 201
