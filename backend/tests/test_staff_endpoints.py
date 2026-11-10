"""Staff floor, status changes, walk-ins, moves, what-if, dashboard and schedule."""

from datetime import time, timedelta
from typing import Any

import pytest
from conftest import auth_header, make_user
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_restaurant_helpers import Place, future_day, make_restaurant, place_booking

from app.models import Organiser, TableSlot


def _url(place: Place, path: str) -> str:
    return f"/api/staff/{place.public_id}/{path}"


def _floor(client: TestClient, place: Place, staff: Organiser, at: str) -> dict[str, str]:
    params = {"date": future_day().isoformat(), "time": at}
    body = client.get(_url(place, "floor"), params=params, headers=auth_header(staff)).json()
    return {table["label"]: table["status"] for table in body["tables"]}


def _status(client: TestClient, place: Place, staff: Organiser, booking: str, status: str) -> Any:
    return client.post(
        _url(place, f"bookings/{booking}/status"),
        json={"status": status},
        headers=auth_header(staff),
    )


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "floor"),
        ("post", "walkins"),
        ("post", "bookings/abc/status"),
        ("post", "bookings/abc/move"),
        ("post", "whatif"),
        ("get", "dashboard"),
        ("get", "schedule"),
        ("put", "schedule"),
    ],
)
def test_staff_endpoints_need_a_session(
    client: TestClient, session: Session, organiser: Organiser, method: str, path: str
) -> None:
    place = make_restaurant(session, organiser)
    response = client.request(method, _url(place, path), json={})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorised"


def test_other_organiser_cannot_see_the_floor(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    stranger = make_user(session, "someone.else@example.com")
    assert client.get(_url(place, "floor"), headers=auth_header(stranger)).status_code == 404


def test_floor_follows_the_booking_status(
    client: TestClient, session: Session, organiser: Organiser, staff: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    booking = place_booking(session, place, ["T2"], future_day(), time(19), 90, 3)
    assert _floor(client, place, staff, "19:15")["T2"] == "reserved"
    assert _floor(client, place, staff, "20:30")["T2"] == "free"  # 19:00-20:30 is over
    for status, shown in (("seated", "seated"), ("finishing", "finishing"), ("completed", "free")):
        assert _status(client, place, staff, booking.public_id, status).status_code == 200
        assert _floor(client, place, staff, "19:15")["T2"] == shown
    reopened = _status(client, place, staff, booking.public_id, "seated")
    assert reopened.status_code == 409


def test_no_show_frees_the_table(
    client: TestClient, session: Session, organiser: Organiser, staff: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    booking = place_booking(session, place, ["T2"], future_day(), time(19), 90, 3)
    assert _status(client, place, staff, booking.public_id, "no_show").json()["tables"] == []
    assert session.scalars(select(TableSlot)).first() is None


def test_walkin_is_placed_by_the_optimiser(
    client: TestClient, session: Session, organiser: Organiser, staff: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    body = {"party_size": 2, "date": future_day().isoformat(), "time": "19:00"}
    response = client.post(_url(place, "walkins"), json=body, headers=auth_header(staff))
    assert response.status_code == 201, response.text
    walkin = response.json()
    assert walkin["tables"] == ["T1"] and walkin["status"] == "seated"
    assert walkin["source"] == "walk_in"
    assert _floor(client, place, staff, "19:00")["T1"] == "seated"


def test_move_checks_the_rules_and_combines_tables(
    client: TestClient, session: Session, organiser: Organiser, staff: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    day = future_day()
    couple = place_booking(session, place, ["T1"], day, time(19), 90, 2)
    big = place_booking(session, place, ["T3"], day, time(19), 150, 6)
    place_booking(session, place, ["T2"], day, time(20), 90, 4)
    headers = auth_header(staff)

    def move(booking_id: str, labels: list[str]) -> Any:
        ids = [place.table[label] for label in labels]
        return client.post(
            _url(place, f"bookings/{booking_id}/move"), json={"table_ids": ids}, headers=headers
        )

    assert move(couple.public_id, ["T4"]).json()["tables"] == ["T4"]
    assert move(couple.public_id, ["T3"]).status_code == 422  # T3 needs at least 3
    assert move(couple.public_id, ["T2"]).status_code == 409  # T2 is booked from 20:00
    combined = move(big.public_id, ["T5", "T6"])
    assert combined.status_code == 200, combined.text
    assert combined.json()["tables"] == ["T5", "T6"]
    assert move(big.public_id, ["T2", "T5"]).status_code == 422  # T2 is not combinable


def test_whatif_on_an_empty_floor_needs_no_moves(
    client: TestClient, session: Session, organiser: Organiser, staff: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    body = {"party_size": 2, "time": "19:00", "date": future_day().isoformat()}
    answer = client.post(_url(place, "whatif"), json=body, headers=auth_header(staff)).json()
    assert answer["possible"] is True and answer["tables"] == ["T1"] and answer["displaced"] == []


def test_whatif_turns_an_optimiser_refusal_into_a_409(
    client: TestClient,
    session: Session,
    organiser: Organiser,
    staff: Organiser,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The optimiser raises ValueError for a fixed party that breaks a rule (for
    example after a layout change). Staff must get a clear 409, not a 500."""

    def refuse(*args: object) -> None:
        raise ValueError("party 7 is fixed to a table that is too small")

    monkeypatch.setattr("app.restaurant_service.whatif.whatif_walkin", refuse)
    place = make_restaurant(session, organiser)
    body = {"party_size": 2, "time": "19:00", "date": future_day().isoformat()}
    response = client.post(_url(place, "whatif"), json=body, headers=auth_header(staff))
    assert response.status_code == 409, response.text
    assert "too small" in response.json()["error"]["message"]


def test_whatif_shows_who_would_have_to_move(
    client: TestClient, session: Session, organiser: Organiser, staff: Organiser
) -> None:
    """A party of 6 walks in at 19:00. T3 (the only 6-top) has an auto-placed
    party of 3; T5 and T6 (which could be joined) are diners' own choices.
    Best answer: move the party of 3 to the free T2 and seat the walk-in at T3."""
    place = make_restaurant(session, organiser)
    day = future_day()
    three = place_booking(session, place, ["T3"], day, time(19), 105, 3, choice="auto")
    place_booking(session, place, ["T5"], day, time(19), 105, 4, choice="chosen")
    place_booking(session, place, ["T6"], day, time(19), 105, 4, choice="chosen")
    before = session.scalars(select(TableSlot)).all()
    body = {"party_size": 6, "time": "19:00", "date": day.isoformat()}
    answer = client.post(_url(place, "whatif"), json=body, headers=auth_header(staff)).json()
    assert answer["possible"] is True and answer["tables"] == ["T3"]
    assert answer["displaced"] == [
        {
            "booking_id": three.public_id,
            "name": "Hand Placed",
            "party_size": 3,
            "from_tables": ["T3"],
            "to_tables": ["T2"],
        }
    ]
    # Staff read names and table labels, never database ids.
    assert answer["reasons"][-1] == "Move Hand Placed (party of 3) from table T3 to table T2"
    assert all(str(three.id) not in reason.split() for reason in answer["reasons"])
    session.expire_all()
    assert len(session.scalars(select(TableSlot)).all()) == len(before)  # nothing changed


def test_dashboard_numbers_on_a_hand_countable_day(
    client: TestClient, session: Session, organiser: Organiser, staff: Organiser
) -> None:
    """Seats: 2 + 4 + 6 + 2 + 4 + 4 = 22. Dinner 18:00-23:00 = 300 minutes.
    Tonight: 4 people for 90 min and 2 people for 90 min = 540 seat-minutes,
    plus a cancelled party of 6. Utilisation 540 / (22 x 300) = 8.2 %.
    History: 8 completed and 2 no-shows in the last weeks: rate 0.2.
    Suggestion: 6 expected covers x 0.2 = 1.2, rounded down to 1."""
    place = make_restaurant(session, organiser)
    day = future_day(10)
    place_booking(session, place, ["T2"], day, time(19), 90, 4)
    place_booking(session, place, ["T1"], day, time(20), 90, 2)
    place_booking(session, place, ["T3"], day, time(19), 120, 6, status="cancelled")
    place_booking(session, place, ["T4"], day, time(19), 90, 2, status="no_show")
    for i in range(10):
        status = "no_show" if i < 2 else "completed"
        past = day - timedelta(days=i + 1)
        place_booking(session, place, ["T1"], past, time(19), 90, 2, status=status)
    params = {"date": day.isoformat()}
    body = client.get(_url(place, "dashboard"), params=params, headers=auth_header(staff)).json()
    assert body["covers"] == {"expected": 6, "seated": 0, "no_show": 2, "cancelled": 6}
    assert body["seats"] == 22
    assert (body["no_show_rate"], body["no_show_based_on"]) == (0.2, 10)
    lunch, dinner = body["services"]
    assert (lunch["service"], lunch["covers"], lunch["utilisation_percent"]) == ("Lunch", 0, 0.0)
    assert (dinner["covers"], dinner["utilisation_percent"]) == (6, 8.2)
    assert dinner["overbooking_suggestion"]["is_suggestion"] is True
    assert dinner["overbooking_suggestion"]["extra_covers"] == 1


def test_schedule_read_and_update(
    client: TestClient, session: Session, organiser: Organiser, staff: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    headers = auth_header(staff)
    day = future_day()
    new_schedule = {
        "service_periods": [
            {
                "name": "Dinner",
                "weekday": day.weekday(),
                "start_time": "19:00",
                "end_time": "21:00",
                "slot_minutes": 30,
                "max_covers_per_slot": 12,
            }
        ],
        "turn_times": [{"max_party": 4, "minutes": 90}, {"max_party": 10, "minutes": 120}],
        "blackout_dates": [{"date": (day + timedelta(days=1)).isoformat(), "reason": "Holiday"}],
    }
    saved = client.put(_url(place, "schedule"), json=new_schedule, headers=headers)
    assert saved.status_code == 200, saved.text
    read = client.get(_url(place, "schedule"), headers=headers).json()
    assert read["service_periods"] == new_schedule["service_periods"]
    assert read["blackout_dates"] == new_schedule["blackout_dates"]
    slots = client.get(
        f"/api/r/{place.public_id}/slots", params={"date": day.isoformat(), "party": 2}
    ).json()["slots"]
    assert [slot["time"] for slot in slots] == ["19:00", "19:30", "20:00", "20:30"]

    wrong = dict(new_schedule)
    wrong["service_periods"] = [{**new_schedule["service_periods"][0], "end_time": "18:00"}]
    assert client.put(_url(place, "schedule"), json=wrong, headers=headers).status_code == 422


def test_dashboard_counts_the_guests_who_are_really_seated(
    client: TestClient, session: Session, organiser: Organiser, staff: Organiser
) -> None:
    """Expected covers are a promise; seated covers are guests who actually came in."""
    place = make_restaurant(session, organiser)
    day = future_day(10)
    place_booking(session, place, ["T2"], day, time(19), 90, 4, status="seated")
    place_booking(session, place, ["T3"], day, time(19), 120, 5, status="finishing")
    place_booking(session, place, ["T1"], day, time(12), 90, 2, status="completed")
    place_booking(session, place, ["T4"], day, time(20), 90, 2)
    params = {"date": day.isoformat()}
    body = client.get(_url(place, "dashboard"), params=params, headers=auth_header(staff)).json()
    assert body["covers"]["expected"] == 13
    assert body["covers"]["seated"] == 11
    lunch, dinner = body["services"]
    assert (lunch["covers_seated"], dinner["covers_seated"]) == (2, 9)


def test_walkin_name_with_a_control_character_is_refused(
    client: TestClient, session: Session, organiser: Organiser, staff: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    day = future_day().isoformat()
    body = {"party_size": 2, "name": "Walk\x00in", "date": day, "time": "19:00"}
    response = client.post(_url(place, "walkins"), json=body, headers=auth_header(staff))
    assert response.status_code == 422
