"""Manage links (view, change, cancel) and the waitlist."""

from datetime import datetime, time
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_restaurant_helpers import (
    LISBON,
    Place,
    future_day,
    hold_and_book,
    make_restaurant,
    place_booking,
)

from app.models import EmailOutbox, Organiser, TableSlot, Venue, WaitlistEntry
from app.restaurant_service import manage_flow


def _emails(session: Session) -> dict[str, list[EmailOutbox]]:
    session.expire_all()
    found: dict[str, list[EmailOutbox]] = {}
    for row in session.scalars(select(EmailOutbox).order_by(EmailOutbox.id)):
        found.setdefault(row.kind, []).append(row)
    return found


def _booked(client: TestClient, place: Place, at: str = "19:00", party: int = 2) -> str:
    return hold_and_book(client, place, future_day(), at, party)["manage_token"]


def test_view_with_the_manage_link(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    token = _booked(client, place)
    body = client.get(f"/api/b/{token}").json()
    assert body["tables"] == ["T1"] and body["time"] == "19:00" and body["party_size"] == 2
    assert body["status"] == "confirmed" and body["can_change"] is True
    assert body["restaurant"]["name"] == "Test Bistro"


def test_wrong_manage_token_is_404(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    token = _booked(client, place)
    wrong = token[:-2] + ("aa" if not token.endswith("aa") else "bb")
    for response in (
        client.get(f"/api/b/{wrong}"),
        client.patch(f"/api/b/{wrong}", json={"time": "20:00"}),
        client.delete(f"/api/b/{wrong}"),
    ):
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "not_found"


def test_change_time_keeps_the_table_and_reschedules_the_reminder(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    token = _booked(client, place)
    changed = client.patch(f"/api/b/{token}", json={"time": "20:00"})
    assert changed.status_code == 200, changed.text
    assert changed.json()["time"] == "20:00" and changed.json()["tables"] == ["T1"]
    slots = sorted(session.scalars(select(TableSlot.slot_index)))
    assert slots == list(range(80, 86))  # 20:00-21:30
    emails = _emails(session)
    assert len(emails["booking_changed"]) == 1
    reminders = emails["booking_reminder"]
    assert [r.status for r in reminders] == ["skipped", "queued"]


def test_bigger_party_is_moved_to_a_table_that_fits(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    token = _booked(client, place)
    changed = client.patch(f"/api/b/{token}", json={"party_size": 5})
    assert changed.status_code == 200, changed.text
    body = changed.json()
    assert body["tables"] == ["T3"] and body["party_size"] == 5
    assert body["end_time"] == "21:00"  # a party of 5 stays 120 minutes
    assert body["table_choice"] == "auto"


def test_change_to_a_full_time_gives_409_and_keeps_the_booking(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    day = future_day()
    token = _booked(client, place, party=6)  # T3, 19:00-21:00
    # Every table that could seat 6 at 21:00 is taken.
    place_booking(session, place, ["T5", "T6"], day, time(20, 30), 120, 8)
    place_booking(session, place, ["T3"], day, time(21), 120, 4)
    refused = client.patch(f"/api/b/{token}", json={"time": "21:00"})
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "seat_taken"
    assert "alternatives" in refused.json()["error"]
    still = client.get(f"/api/b/{token}").json()
    assert still["time"] == "19:00" and still["tables"] == ["T3"]


def test_cancel_frees_the_table_and_emails(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    token = _booked(client, place)
    cancelled = client.delete(f"/api/b/{token}")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled" and cancelled.json()["tables"] == []
    assert session.scalars(select(TableSlot)).first() is None
    emails = _emails(session)
    assert len(emails["booking_cancelled"]) == 1
    # Same UID as the confirmation, METHOD:CANCEL: the calendar entry is removed.
    assert "METHOD:CANCEL" in (emails["booking_cancelled"][0].ics or "")
    assert token in emails["booking_cancelled"][0].body_text
    assert emails["booking_reminder"][0].status == "skipped"
    assert client.delete(f"/api/b/{token}").status_code == 409
    assert client.patch(f"/api/b/{token}", json={"time": "20:00"}).status_code == 409


def _join(client: TestClient, place: Place, party: int, name: str) -> dict[str, int]:
    body = {
        "date": future_day().isoformat(),
        "time": "19:00",
        "party": party,
        "name": name,
        "email": f"{name.lower()}@example.com",
    }
    response = client.post(f"/api/r/{place.public_id}/waitlist", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def test_waitlist_position_and_estimated_wait(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    """Party of 2 fits T1, T2, T4, T5, T6 (k = 5; T3 needs 3 or more people).
    Their turn times are 90, 105, 90, 105, 105: average 99 minutes.
    First in line: 1 x 99 / 5 = 19.8, rounded up to 20. Second: 39.6 -> 40."""
    place = make_restaurant(session, organiser)
    first = _join(client, place, 2, "Nora")
    second = _join(client, place, 2, "Omar")
    assert (first["position"], first["estimated_wait_minutes"]) == (1, 20)
    assert (second["position"], second["estimated_wait_minutes"]) == (2, 40)


def test_cancel_offers_the_table_to_the_first_matching_waitlist_entry(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    token = _booked(client, place)  # a couple on T1, 19:00-20:30
    _join(client, place, 6, "Pedro")  # first in line, but T1 cannot seat 6
    _join(client, place, 2, "Quinta")
    assert client.delete(f"/api/b/{token}").status_code == 200
    session.expire_all()
    statuses = {e.name: e.status for e in session.scalars(select(WaitlistEntry))}
    assert statuses == {"Pedro": "waiting", "Quinta": "offered"}
    offers = _emails(session)["waitlist_offer"]
    assert [offer.to_email for offer in offers] == ["quinta@example.com"]
    assert f"/r/{place.public_id}?" in offers[0].body_text


def test_waitlist_is_rate_limited(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    for i in range(10):
        _join(client, place, 2, f"Guest{i}")
    body = {
        "date": future_day().isoformat(),
        "time": "19:00",
        "party": 2,
        "name": "One Too Many",
        "email": "one.too.many@example.com",
    }
    response = client.post(f"/api/r/{place.public_id}/waitlist", json=body)
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "rate_limited"


# ---------------------------------------------------------------- review fixes


def _queued_reminders(session: Session) -> list[EmailOutbox]:
    return [r for r in _emails(session).get("booking_reminder", []) if r.status == "queued"]


def test_party_size_change_keeps_a_queued_reminder(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    """Same start time, new party size: the old reminder is dropped, a new one must exist."""
    place = make_restaurant(session, organiser)
    token = _booked(client, place)
    assert client.patch(f"/api/b/{token}", json={"party_size": 1}).status_code == 200
    assert len(_queued_reminders(session)) == 1


def test_changing_back_and_forth_emails_every_change(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    """19:00 -> 20:00 -> 19:00 -> 20:00: three changes, three change emails, one reminder."""
    place = make_restaurant(session, organiser)
    token = _booked(client, place)
    for at in ("20:00", "19:00", "20:00"):
        assert client.patch(f"/api/b/{token}", json={"time": at}).status_code == 200
    emails = _emails(session)
    assert len(emails["booking_changed"]) == 3
    assert "20:00" in emails["booking_changed"][-1].body_text
    queued = _queued_reminders(session)
    assert len(queued) == 1
    assert "20:00" in queued[0].body_text


def _add_entry(session: Session, place: Place, day: Any, at: time, name: str) -> None:
    session.add(
        WaitlistEntry(
            venue_id=place.venue_id,
            date=day,
            wanted_time=at,
            party_size=2,
            name=name,
            email=f"{name.lower()}@example.com",
            status="waiting",
        )
    )
    session.commit()


def _cancel(session: Session, place: Place, booking: Any) -> None:
    venue = session.get(Venue, place.venue_id)
    assert venue is not None
    manage_flow.cancel_booking(session, venue, booking, actor="test")
    session.commit()


def test_waitlist_entry_whose_time_has_passed_gets_no_offer(
    session: Session, organiser: Organiser, monkeypatch: pytest.MonkeyPatch
) -> None:
    """It is 19:30. A 19:00 booking on T1 is cancelled; Rui wanted 19:00: too late to offer."""
    place = make_restaurant(session, organiser)
    day = future_day()
    booking = place_booking(session, place, ["T1"], day, time(19), 90, 2)
    _add_entry(session, place, day, time(19), "Rui")
    fake_now = datetime.combine(day, time(19, 30), tzinfo=LISBON)
    monkeypatch.setattr("app.restaurant_service.clock.now_local", lambda venue: fake_now)
    _cancel(session, place, booking)
    session.expire_all()
    assert session.scalars(select(WaitlistEntry)).one().status == "waiting"
    assert "waitlist_offer" not in _emails(session)


def test_waitlist_offer_needs_the_window_the_cancellation_freed(
    session: Session, organiser: Organiser
) -> None:
    """A 22:00 booking is cancelled. Rui wants 12:00, which that booking never blocked."""
    place = make_restaurant(session, organiser)
    day = future_day()
    booking = place_booking(session, place, ["T1"], day, time(22), 60, 2)
    _add_entry(session, place, day, time(12), "Rui")
    _cancel(session, place, booking)
    session.expire_all()
    assert session.scalars(select(WaitlistEntry)).one().status == "waiting"


def test_manage_view_tells_the_largest_party_the_restaurant_can_seat(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    """The biggest table seats 6; T5 + T6 joined seat 8. So the change form stops at 8."""
    place = make_restaurant(session, organiser)
    token = _booked(client, place)
    assert client.get(f"/api/b/{token}").json()["max_party"] == 8
    too_big = client.patch(f"/api/b/{token}", json={"party_size": 9})
    assert too_big.status_code == 422
    assert too_big.json()["error"]["code"] == "validation"
