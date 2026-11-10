"""Seating times, the table map and the recommended table."""

from datetime import time, timedelta
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from test_restaurant_helpers import (
    future_day,
    hold,
    hold_and_book,
    make_restaurant,
    place_booking,
)

from app.models import BlackoutDate, Organiser


def _slots(client: TestClient, public_id: str, day: Any, party: int) -> dict[str, Any]:
    response = client.get(
        f"/api/r/{public_id}/slots", params={"date": day.isoformat(), "party": party}
    )
    assert response.status_code == 200, response.text
    return response.json()


def _status_at(body: dict[str, Any], at: str) -> dict[str, Any]:
    return next(slot for slot in body["slots"] if slot["time"] == at)


def test_restaurant_page_lists_zones_and_schedule(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    body = client.get(f"/api/r/{place.public_id}").json()
    assert body["name"] == "Test Bistro"
    assert {zone["kind"] for zone in body["zones"]} == {"window", "terrace", "quiet", "bar"}
    assert len(body["schedule"]["service_periods"]) == 14  # lunch + dinner x 7 days
    assert body["schedule"]["turn_times"][0] == {"max_party": 2, "minutes": 90}


def test_unknown_restaurant_is_404(client: TestClient) -> None:
    assert client.get("/api/r/doesnotexist123").status_code == 404


def test_slots_list_every_seating_time(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    body = _slots(client, place.public_id, future_day(), 2)
    times = [slot["time"] for slot in body["slots"]]
    # Lunch 12:00-14:45 (12 times) and dinner 18:00-22:45 (20 times).
    assert len(times) == 32
    assert times[0] == "12:00" and "19:00" in times and times[-1] == "22:45"
    assert {slot["status"] for slot in body["slots"]} == {"available"}


def test_slot_becomes_limited_then_full_as_tables_go(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    """Party of 6 fits only T3 alone or T5+T6 together: two options."""
    place = make_restaurant(session, organiser)
    day = future_day()
    assert _status_at(_slots(client, place.public_id, day, 6), "19:00")["status"] == "limited"
    place_booking(session, place, ["T3"], day, time(19), 120, 6)
    place_booking(session, place, ["T5"], day, time(19), 105, 3)
    full = _status_at(_slots(client, place.public_id, day, 6), "19:00")
    assert full == {"time": "19:00", "service": "Dinner", "status": "full", "reason": "no_table"}


def test_blackout_date_is_closed(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    day = future_day()
    session.add(BlackoutDate(venue_id=place.venue_id, date=day, reason="Staff party"))
    session.commit()
    body = _slots(client, place.public_id, day, 2)
    assert body["closed"] is True and body["reason"] == "Staff party" and body["slots"] == []
    refused = hold(client, place, day, "19:00", 2)
    assert refused.status_code == 422
    assert "closed" in refused.json()["error"]["message"]


def test_past_times_are_not_bookable(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    yesterday = future_day(0) - timedelta(days=1)
    body = _slots(client, place.public_id, yesterday, 2)
    assert {(slot["status"], slot["reason"]) for slot in body["slots"]} == {("full", "past")}
    assert hold(client, place, yesterday, "19:00", 2).status_code == 422
    params = {"date": yesterday.isoformat(), "time": "19:00", "party": 2}
    assert client.get(f"/api/r/{place.public_id}/map", params=params).status_code == 422


def test_time_off_the_grid_is_refused(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    assert hold(client, place, future_day(), "19:05", 2).status_code == 422
    assert hold(client, place, future_day(), "16:00", 2).status_code == 422


def test_covers_cap_makes_a_time_full(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    """Cap 6 guests arriving per seating time: after a party of 5, a couple no longer fits."""
    place = make_restaurant(session, organiser, cap=6)
    day = future_day()
    hold_and_book(client, place, day, "19:00", 5)
    at_seven = _status_at(_slots(client, place.public_id, day, 2), "19:00")
    assert (at_seven["status"], at_seven["reason"]) == ("full", "covers_cap")
    assert _status_at(_slots(client, place.public_id, day, 1), "19:00")["status"] == "limited"
    assert _status_at(_slots(client, place.public_id, day, 2), "19:15")["status"] == "available"
    refused = hold(client, place, day, "19:00", 2)
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "conflict"


def _map(client: TestClient, public_id: str, day: Any, party: int, **extra: Any) -> dict[str, Any]:
    params = {"date": day.isoformat(), "time": "19:00", "party": party, **extra}
    response = client.get(f"/api/r/{public_id}/map", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def test_party_of_two_is_recommended_the_small_table(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    body = _map(client, place.public_id, future_day(), 2)
    best = body["recommended"][0]
    assert best["labels"] == ["T1"]
    assert best["waste"] == 0
    assert "Exact fit for 2" in best["reasons"]
    # The four-tops are not wasted on a couple: they come later, if at all.
    assert all(choice["waste"] == 0 for choice in body["recommended"][:2])


def test_map_states_and_table_details(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    day = future_day()
    place_booking(session, place, ["T2"], day, time(18, 30), 90, 3)  # until 20:00
    hold(client, place, day, "19:00", 2, table_id=place.table["T1"])
    states = {t["label"]: t for t in _map(client, place.public_id, day, 5)["tables"]}
    assert states["T1"]["state"] == "held"
    assert states["T2"]["state"] == "taken"
    assert states["T3"]["state"] == "free"
    assert states["T4"]["state"] == "too_small"
    assert states["T5"]["state"] == "too_small"
    assert states["T4"]["accessible"] is True and states["T4"]["high_chair_ok"] is True
    assert states["T4"]["zone_kind"] == "quiet"
    couple = {t["label"]: t["state"] for t in _map(client, place.public_id, day, 2)["tables"]}
    assert couple["T3"] == "blocked"  # T3 is kept for parties of 3 or more


def test_accessibility_need_changes_the_recommendation(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    body = _map(client, place.public_id, future_day(), 2, accessible="true")
    assert body["recommended"][0]["labels"] == ["T4"]
    assert "Accessible table as needed" in body["recommended"][0]["reasons"]
    states = {t["label"]: t["state"] for t in body["tables"]}
    assert states["T1"] == "blocked" and states["T4"] == "free"


def test_large_party_is_recommended_combined_tables(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    best = _map(client, place.public_id, future_day(), 8)["recommended"][0]
    assert best["labels"] == ["T5", "T6"]
    # Diners read the reasons, so they name tables by label, never by database id.
    assert best["reasons"][0].startswith("Joins tables T5 + T6")


def test_max_party_is_the_largest_party_a_table_can_take(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    """T3 seats 6 and T5 + T6 joined seat 8, so 8 is the biggest party, not a fixed 30."""
    place = make_restaurant(session, organiser)
    assert client.get(f"/api/r/{place.public_id}").json()["max_party"] == 8
    too_big = client.get(
        f"/api/r/{place.public_id}/slots", params={"date": future_day().isoformat(), "party": 9}
    )
    assert too_big.status_code == 422


def test_max_party_respects_the_covers_cap(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    """With at most 5 guests arriving per seating time, a party of 6 can never book."""
    place = make_restaurant(session, organiser, cap=5)
    assert client.get(f"/api/r/{place.public_id}").json()["max_party"] == 5
