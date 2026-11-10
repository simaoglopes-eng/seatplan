"""Staff optimiser endpoints: re-plan a service (preview, then apply) and the exact check.

The tiny restaurant of test_restaurant_helpers is used. Dinner tonight:

    booking   party  table  how it got there
    couple    2      T2     auto (the optimiser may move it)
    bar pair  2      T5     the diner chose T5 (never moved)
    trio      3      T3     auto but already seated (never moved)

T2 seats 4, so the couple wastes 2 seats there. T1 seats exactly 2 and is free:
the better plan moves the couple from T2 to T1 and nobody else.
"""

import json
from datetime import date, time
from pathlib import Path
from typing import Any

from conftest import auth_header
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from test_restaurant_helpers import Place, future_day, make_restaurant, place_booking

from app.models import Booking, Organiser
from app.optimiser import restaurant_assign
from app.restaurant_service import occupancy, service_plan


def _url(place: Place, path: str) -> str:
    return f"/api/staff/{place.public_id}/optimise/{path}"


def _tonight(session: Session, place: Place) -> tuple[date, dict[str, Booking]]:
    day = future_day()
    bookings = {
        "couple": place_booking(session, place, ["T2"], day, time(19), 90, 2),
        "bar": place_booking(session, place, ["T5"], day, time(19), 90, 2, choice="chosen"),
        "trio": place_booking(session, place, ["T3"], day, time(19), 105, 3, status="seated"),
    }
    return day, bookings


def _labels(session: Session, booking: Booking) -> tuple[int, ...]:
    session.expire_all()
    return occupancy.tables_of(session, booking)


def _post(client: TestClient, url: str, staff: Organiser, body: dict[str, Any]) -> Any:
    return client.post(url, json=body, headers=auth_header(staff))


def test_service_preview_moves_only_auto_bookings_and_changes_nothing(
    client: TestClient, session: Session, organiser: Organiser, staff: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    day, bookings = _tonight(session, place)
    body = {"date": day.isoformat(), "service": "Dinner"}
    response = _post(client, _url(place, "service"), staff, body)
    assert response.status_code == 200, response.text
    preview = response.json()
    assert preview["applied"] is False
    assert preview["moves"] == [
        {
            "booking_id": bookings["couple"].public_id,
            "name": "Hand Placed",
            "party_size": 2,
            "time": "19:00",
            "from_tables": ["T2"],
            "to_tables": ["T1"],
        }
    ]
    # Wasted seats: couple 2 + bar pair 2 + trio 3 = 7 before; 0 + 2 + 3 = 5 after.
    assert preview["before"] == {"covers_seated": 7, "wasted_seats": 7, "parties_unseated": 0}
    assert preview["after"] == {"covers_seated": 7, "wasted_seats": 5, "parties_unseated": 0}
    assert (preview["fixed"], preview["movable"]) == (2, 1)
    assert _labels(session, bookings["couple"]) == (place.table["T2"],)


def test_service_apply_needs_the_preview_and_keeps_human_choices(
    client: TestClient, session: Session, organiser: Organiser, staff: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    day, bookings = _tonight(session, place)
    body: dict[str, Any] = {"date": day.isoformat(), "service": "Dinner"}
    preview = _post(client, _url(place, "service"), staff, body).json()
    # Applying without the plan id of a preview is refused.
    assert _post(client, _url(place, "service"), staff, {**body, "apply": True}).status_code == 422
    stale = {**body, "apply": True, "plan_id": "0" * 16}
    assert _post(client, _url(place, "service"), staff, stale).status_code == 409
    applied = _post(
        client,
        _url(place, "service"),
        staff,
        {**body, "apply": True, "plan_id": preview["plan_id"]},
    )
    assert applied.status_code == 200, applied.text
    assert applied.json()["applied"] is True
    assert _labels(session, bookings["couple"]) == (place.table["T1"],)
    assert _labels(session, bookings["bar"]) == (place.table["T5"],)
    assert _labels(session, bookings["trio"]) == (place.table["T3"],)
    # A second preview finds nothing left to improve.
    assert _post(client, _url(place, "service"), staff, body).json()["moves"] == []


def test_unknown_service_is_404(
    client: TestClient, session: Session, organiser: Organiser, staff: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    body = {"date": future_day().isoformat(), "service": "Breakfast"}
    assert _post(client, _url(place, "service"), staff, body).status_code == 404


def test_exact_check_compares_the_heuristic_with_the_optimum(
    client: TestClient, session: Session, organiser: Organiser, staff: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    day, _bookings = _tonight(session, place)
    body = {"date": day.isoformat(), "service": "Dinner"}
    response = _post(client, _url(place, "exact-check"), staff, body)
    assert response.status_code == 200, response.text
    check = response.json()
    assert (check["parties_total"], check["parties_considered"], check["capped"]) == (3, 3, False)
    assert check["optimal"]["proven_optimal"] is True
    assert check["heuristic"]["wasted_seats"] == 5
    assert check["optimal"]["wasted_seats"] == 5
    assert check["gap"] == {"covers": 0, "wasted_seats": 0, "percent": 0.0}
    assert check["matches_optimum"] is True


def test_exact_check_caps_big_services(
    client: TestClient, session: Session, organiser: Organiser, staff: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    day = future_day()
    for hour in range(12, 15):
        for label in ("T1", "T4", "T2"):
            place_booking(session, place, [label], day, time(hour), 60, 2)
    for hour in (18, 19, 20, 21, 22):
        for label in ("T1", "T4"):
            place_booking(session, place, [label], day, time(hour), 60, 2)
    body = {"date": day.isoformat(), "service": "Dinner", "max_parties": 4}
    check = _post(client, _url(place, "exact-check"), staff, body).json()
    assert (check["parties_total"], check["parties_considered"], check["capped"]) == (10, 4, True)


def test_optimise_endpoints_need_staff(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    body = {"date": future_day().isoformat(), "service": "Dinner"}
    for path in ("service", "exact-check"):
        assert client.post(_url(place, path), json=body).status_code == 401


def test_restaurant_safety_cut_off_fires_before_the_platform_limit() -> None:
    # The exact check runs the heuristic AND the exact solver in one request,
    # so both limits together must end before Vercel stops the function.
    vercel = json.loads((Path(__file__).parents[2] / "vercel.json").read_text())
    platform_limit = vercel["functions"]["api/index.py"]["maxDuration"]
    assert restaurant_assign.SAFETY_TIME_LIMIT_S + service_plan.EXACT_TIME_LIMIT_S < platform_limit
