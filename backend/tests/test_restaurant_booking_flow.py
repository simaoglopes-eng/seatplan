"""Hold and book a table end to end, overlapping windows, holds, and the 20-thread race."""

import threading
import time as time_module
from datetime import UTC, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from test_restaurant_helpers import Place, book, future_day, hold, hold_and_book, make_restaurant

from app.models import (
    AuditLog,
    Booking,
    EmailOutbox,
    Hold,
    LiveVersion,
    Organiser,
    TableSlot,
    Venue,
)
from app.restaurant_service import occupancy


def _slots_of(session: Session, table_id: int) -> list[int]:
    session.expire_all()
    query = select(TableSlot.slot_index).where(TableSlot.table_id == table_id)
    return sorted(session.scalars(query))


def test_booking_flow_end_to_end(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    day = future_day()
    held = hold(client, place, day, "19:00", 2)
    assert held.status_code == 201, held.text
    assert held.json()["table"]["labels"] == ["T1"]
    assert held.json()["table_choice"] == "auto"

    booked = book(client, place, held.json()["hold_id"], 2, notes="Window please")
    assert booked.status_code == 201, booked.text
    body = booked.json()
    assert body["booking"]["tables"] == ["T1"]
    assert body["booking"]["time"] == "19:00" and body["booking"]["end_time"] == "20:30"
    assert body["manage_path"] == f"/b/{body['manage_token']}"
    assert "manage_token_hash" not in body["booking"]

    # Party of 2 stays 90 minutes: six 15-minute slots, 19:00 = slot 76.
    assert _slots_of(session, place.table["T1"]) == list(range(76, 82))
    assert session.scalar(select(func.count()).select_from(Hold)) == 0
    emails = {row.kind: row for row in session.scalars(select(EmailOutbox))}
    assert set(emails) == {"booking_confirmed", "booking_reminder"}
    assert body["manage_token"] in emails["booking_confirmed"].body_text
    # The confirmation carries a calendar invite; the reminder does not need one.
    assert "METHOD:PUBLISH" in (emails["booking_confirmed"].ics or "")
    assert "table T1" in emails["booking_confirmed"].body_text
    booking = session.scalars(select(Booking)).one()
    assert emails["booking_reminder"].next_attempt_at == booking.start_at - timedelta(hours=24)
    scope = f"venue-{place.public_id}-{day.isoformat()}"
    assert session.get(LiveVersion, scope).version >= 2  # the hold and the booking
    actions = set(session.scalars(select(AuditLog.action)))
    assert "booking.create" in actions


def test_booking_needs_a_live_hold(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    held = hold(client, place, future_day(), "19:00", 2).json()
    for row in session.scalars(select(Hold)):
        row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    session.commit()
    expired = book(client, place, held["hold_id"], 2)
    assert expired.status_code == 409
    assert expired.json()["error"]["code"] == "hold_expired"
    unknown = book(client, place, "not-a-real-hold-id", 2)
    assert unknown.json()["error"]["code"] == "hold_expired"


def test_party_size_must_match_the_hold(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    held = hold(client, place, future_day(), "19:00", 2).json()
    # A party of 6 stays 120 minutes, longer than the 90 minutes held for 2.
    assert book(client, place, held["hold_id"], 6).status_code == 422


def test_someone_else_holding_the_table_gets_409_with_alternatives(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    day = future_day()
    first = hold(client, place, day, "19:00", 2, table_id=place.table["T1"])
    assert first.status_code == 201
    second = hold(client, place, day, "19:00", 2, table_id=place.table["T1"])
    assert second.status_code == 409
    error = second.json()["error"]
    assert error["code"] == "seat_taken"
    assert ["T4"] in [table["labels"] for table in error["alternatives"]["tables"]]
    assert error["alternatives"]["times"][:2] == ["18:45", "19:15"]


def test_overlapping_window_is_rejected_and_adjacent_is_accepted(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    """T1 booked 19:00-20:30. 20:00 overlaps by half an hour; 20:30 starts as it frees."""
    place = make_restaurant(session, organiser)
    day = future_day()
    t1 = place.table["T1"]
    hold_and_book(client, place, day, "19:00", 2, table_id=t1)
    overlapping = hold(client, place, day, "20:00", 2, table_id=t1)
    assert overlapping.status_code == 409
    assert overlapping.json()["error"]["code"] == "seat_taken"
    earlier = hold(client, place, day, "17:45", 2, table_id=t1)
    assert earlier.status_code == 422  # not a seating time at all
    before = hold(client, place, day, "18:00", 2, table_id=t1)
    assert before.status_code == 409  # 18:00-19:30 overlaps the 19:00 start
    adjacent = hold_and_book(client, place, day, "20:30", 2, table_id=t1)
    assert adjacent["booking"]["tables"] == ["T1"]
    assert _slots_of(session, t1) == list(range(76, 88))


def test_two_overlapping_holds_clash_even_with_different_start_times(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    day = future_day()
    assert hold(client, place, day, "19:00", 2, table_id=place.table["T1"]).status_code == 201
    assert hold(client, place, day, "19:45", 2, table_id=place.table["T1"]).status_code == 409
    # The failed attempt gave back the slots it had taken: only the first hold's six remain.
    assert session.scalar(select(func.count()).select_from(Hold)) == 6


def test_combined_tables_are_held_and_booked_together(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    booked = hold_and_book(client, place, future_day(), "19:00", 8)
    assert booked["booking"]["tables"] == ["T5", "T6"]
    # Party of 8 stays 150 minutes = 10 slots, on both tables.
    assert len(_slots_of(session, place.table["T5"])) == 10
    assert len(_slots_of(session, place.table["T6"])) == 10


def test_unsuitable_table_choice_is_refused(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    too_small = hold(client, place, future_day(), "19:00", 4, table_id=place.table["T1"])
    assert too_small.status_code == 422
    not_combinable = hold(
        client, place, future_day(), "19:00", 8, table_ids=[place.table["T2"], place.table["T3"]]
    )
    assert not_combinable.status_code == 422


def test_unknown_fields_are_rejected(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    assert hold(client, place, future_day(), "19:00", 2, vip=True).status_code == 422


# ---------------------------------------------------------------- the race

THREADS = 20


def _hold_then_book(
    client: TestClient, place: Place, start: threading.Barrier, outcomes: list[str]
) -> None:
    """What one browser does: hold T1 at 19:00, then confirm with its own details."""
    day = future_day()
    start.wait()  # every thread fires at the same moment
    held = hold(client, place, day, "19:00", 2, table_id=place.table["T1"])
    if held.status_code != 201:
        outcomes.append(f"hold {held.status_code} {held.json()['error']['code']}")
        return
    booked = book(client, place, held.json()["hold_id"], 2)
    outcomes.append("booked" if booked.status_code == 201 else f"book {booked.status_code}")


def test_twenty_threads_book_the_same_table_exactly_one_wins(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    start = threading.Barrier(THREADS)
    outcomes: list[str] = []
    threads = [
        threading.Thread(target=_hold_then_book, args=(client, place, start, outcomes))
        for _ in range(THREADS)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=120)

    assert len(outcomes) == THREADS, outcomes
    assert outcomes.count("booked") == 1, outcomes
    losers = [outcome for outcome in outcomes if outcome != "booked"]
    assert all(outcome.endswith("409 seat_taken") or outcome == "book 409" for outcome in losers)
    session.expire_all()
    assert session.scalar(select(func.count()).select_from(Booking)) == 1
    assert _slots_of(session, place.table["T1"]) == list(range(76, 82))


def test_times_are_read_in_the_restaurant_time_zone(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    """19:00 in New York is 23:00 or 00:00 UTC (UTC-4 or UTC-5), never 19:00 UTC."""
    place = make_restaurant(session, organiser)
    venue = session.get(Venue, place.venue_id)
    assert venue is not None
    venue.timezone = "America/New_York"
    session.commit()
    day = future_day(30)
    booked = hold_and_book(client, place, day, "19:00", 2)
    assert booked["booking"]["time"] == "19:00"
    session.expire_all()
    start = session.scalars(select(Booking)).one().start_at
    new_york = datetime.combine(day, time(19), tzinfo=ZoneInfo("America/New_York"))
    assert start == new_york.astimezone(UTC)
    assert start.hour in (23, 0)
    assert _slots_of(session, place.table["T1"]) == list(range(76, 82))


# ---------------------------------------------------------------- hold flood


def test_one_client_can_hold_only_a_few_tables_per_date(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    """Without a cap, one address could hold every table of a service, again and again."""
    place = make_restaurant(session, organiser)
    day = future_day()
    for at in ("12:00", "13:00", "19:00"):
        assert hold(client, place, day, at, 2).status_code == 201
    fourth = hold(client, place, day, "21:00", 2)
    assert fourth.status_code == 429
    assert fourth.json()["error"]["code"] == "rate_limited"
    # Another date is a separate allowance.
    assert hold(client, place, future_day(8), "19:00", 2).status_code == 201


def test_holds_never_block_more_than_half_the_tables(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    """Six tables: at most three may be held at once at any time, whoever holds them."""
    place = make_restaurant(session, organiser)
    day = future_day()
    for number, label in enumerate(("T1", "T2", "T4")):
        headers = {"X-Forwarded-For": f"203.0.113.{number}"}
        body = {
            "date": day.isoformat(),
            "time": "19:00",
            "party": 2,
            "table_id": place.table[label],
        }
        held = client.post(f"/api/r/{place.public_id}/hold", json=body, headers=headers)
        assert held.status_code == 201, held.text
    body = {"date": day.isoformat(), "time": "19:30", "party": 2}
    crowded = client.post(
        f"/api/r/{place.public_id}/hold", json=body, headers={"X-Forwarded-For": "203.0.113.9"}
    )
    assert crowded.status_code == 429
    # Holds do not stop a booking at a time nobody is holding.
    assert hold(client, place, day, "12:00", 2).status_code == 201


def test_a_hold_can_be_released(client: TestClient, session: Session, organiser: Organiser) -> None:
    place = make_restaurant(session, organiser)
    day = future_day()
    held = hold(client, place, day, "19:00", 2, table_id=place.table["T1"]).json()
    url = f"/api/r/{place.public_id}/hold/{held['hold_id']}"
    assert client.delete(url).status_code == 204
    session.expire_all()
    assert session.scalar(select(func.count()).select_from(Hold)) == 0
    # The table is free again, and releasing twice is a plain 404.
    assert hold(client, place, day, "19:00", 2, table_id=place.table["T1"]).status_code == 201
    assert client.delete(url).status_code == 404


# ---------------------------------------------------------------- covers cap race


def _confirm(
    client: TestClient, place: Place, hold_id: str, start: threading.Barrier, codes: list[int]
) -> None:
    start.wait()
    codes.append(book(client, place, hold_id, 2).status_code)


def test_covers_cap_holds_under_concurrent_confirms(
    client: TestClient,
    session: Session,
    organiser: Organiser,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Cap 4 at 19:00. Three couples hold three different tables and confirm at once.

    The cap read is slowed down on purpose so that, without a lock, all three
    requests read "0 covers arriving" before any of them writes.
    """
    place = make_restaurant(session, organiser, cap=4)
    day = future_day()
    hold_ids = [
        hold(client, place, day, "19:00", 2, table_id=place.table[label]).json()["hold_id"]
        for label in ("T1", "T2", "T4")
    ]
    real_covers = occupancy.covers_by_start

    def slow_covers(*args: Any, **kwargs: Any) -> dict[int, int]:
        found = real_covers(*args, **kwargs)
        time_module.sleep(0.3)
        return found

    monkeypatch.setattr(occupancy, "covers_by_start", slow_covers)
    start = threading.Barrier(len(hold_ids))
    codes: list[int] = []
    threads = [
        threading.Thread(target=_confirm, args=(client, place, hold_id, start, codes))
        for hold_id in hold_ids
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=60)
    assert sorted(codes) == [201, 201, 409], codes
    session.expire_all()
    covers = session.scalars(select(Booking.party_size).where(Booking.status == "confirmed"))
    assert sum(covers) == 4


# ---------------------------------------------------------------- input checks


def test_control_characters_are_refused(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    """Postgres cannot store a NUL character: it must be a 422, never a 500."""
    place = make_restaurant(session, organiser)
    held = hold(client, place, future_day(), "19:00", 2).json()
    for field in ("name", "notes", "phone"):
        response = book(client, place, held["hold_id"], 2, **{field: "a\x00b"})
        assert response.status_code == 422, (field, response.text)
        assert response.json()["error"]["code"] == "validation"
    # A line break in the notes is fine.
    assert book(client, place, held["hold_id"], 2, notes="Window\nplease").status_code == 201
