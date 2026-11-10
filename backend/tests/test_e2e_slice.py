"""End-to-end smoke test: both verticals, through the real HTTP API, in-process.

It starts from POST /api/demo/reset, exactly like the demo, and walks the
main story of each vertical. If any router, service, the optimiser or the
email outbox stops fitting together, this file fails.
"""

from datetime import date, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import EmailOutbox
from app.seed.run import DEFAULT_DEMO_PASSWORDS

DEMO_KEY = "e2e-demo-key"


@pytest.fixture
def links(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    """Reset the demo with a demo key and return its entry links."""
    monkeypatch.setenv("DEMO_KEY", DEMO_KEY)
    get_settings.cache_clear()
    response = client.post("/api/demo/reset", headers={"X-Demo-Key": DEMO_KEY})
    assert response.status_code == 200, response.text
    return response.json()["links"]


def _login(client: TestClient, email: str, password_env: str) -> dict[str, str]:
    body = {"email": email, "password": DEFAULT_DEMO_PASSWORDS[password_env]}
    response = client.post("/api/auth/login", json=body)
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def _last_part(link: str) -> str:
    return link.rstrip("/").split("/")[-1]


def _emails(session: Session, kind: str) -> list[EmailOutbox]:
    session.expire_all()
    return list(session.scalars(select(EmailOutbox).where(EmailOutbox.kind == kind)))


# ---------------------------------------------------------------- events


def _pick_known_person(client: TestClient, token: str) -> tuple[dict[str, Any], list[dict]]:
    """Mark a seated guest as known, one at a time, until a recommendation lists them."""
    page = client.get(f"/api/a/{token}").json()
    for person in page["people"]:
        if person["seat_id"] is None:
            continue
        client.post(f"/api/a/{token}/knows", json={"guest_ids": [person["id"]]})
        recs = client.get(f"/api/a/{token}/recommendations").json()
        if any(person["id"] in [k["guest_id"] for k in rec["known_nearby"]] for rec in recs):
            return person, recs
    raise AssertionError("No recommendation ever mentioned a known person")


def test_events_slice(client: TestClient, session: Session, links: dict[str, str]) -> None:
    me_token = _last_part(links["wedding_guest_choosing"])
    other_token = _last_part(links["wedding_guest_seated"])
    event_id = _last_part(links["wedding_organiser"])

    # The attendee opens the link and says they are coming.
    page = client.get(f"/api/a/{me_token}")
    assert page.status_code == 200
    me = page.json()["me"]
    assert client.post(f"/api/a/{me_token}/rsvp", json={"rsvp": "yes"}).status_code == 200

    # They mark someone they know; a recommendation now names that person, with reasons.
    friend, recs = _pick_known_person(client, me_token)
    best = next(r for r in recs if friend["id"] in [k["guest_id"] for k in r["known_nearby"]])
    # Reasons stay general ("Same table as 1 person you know"); the page adds the
    # name from known_nearby, after the privacy rules have already been applied.
    assert any("you know" in reason for reason in best["reasons"])

    # Hold, then confirm that seat.
    seat_id = best["seat_id"]
    assert client.post(f"/api/a/{me_token}/hold", json={"seat_id": seat_id}).status_code == 200
    confirmed = client.post(f"/api/a/{me_token}/confirm", json={"seat_id": seat_id})
    assert confirmed.status_code == 200 and confirmed.json()["seat_id"] == seat_id

    # A second attendee cannot have the same seat.
    clash = client.post(f"/api/a/{other_token}/hold", json={"seat_id": seat_id})
    assert clash.status_code == 409
    assert clash.json()["error"]["code"] == "seat_taken"

    # The confirmation email is in the outbox, with a calendar invite and the personal link.
    sent = [e for e in _emails(session, "seat_confirmed") if f"/e/{me_token}" in e.body_text]
    assert len(sent) == 1
    assert sent[0].ics is not None and "BEGIN:VCALENDAR" in sent[0].ics

    # The organiser sees the attendee on that seat.
    organiser = _login(client, "organiser@example.com", "DEMO_ORGANISER_PASSWORD")
    detail = client.get(f"/api/events/{event_id}", headers=organiser).json()
    seat = next(s for s in detail["map"]["seats"] if s["id"] == seat_id)
    assert seat["guest_id"] == me["id"] and seat["source"] == "self"
    seated_before = detail["counts"]["seated"]

    # Auto-fill places the others and never moves the seat the attendee chose.
    body = {"seed": 0, "max_iterations": 3000}
    scenario = client.post(
        f"/api/events/{event_id}/optimise/autofill", headers=organiser, json=body
    )
    assert scenario.status_code == 200, scenario.text
    assert scenario.json()["assignments"][str(me["id"])] == seat_id
    applied = client.post(
        f"/api/events/{event_id}/scenarios/{scenario.json()['id']}/apply",
        headers=organiser,
        json={},
    )
    assert applied.status_code == 200 and applied.json()["applied"] > 0
    after = client.get(f"/api/events/{event_id}", headers=organiser).json()
    assert after["counts"]["seated"] > seated_before
    seat_after = next(s for s in after["map"]["seats"] if s["id"] == seat_id)
    assert seat_after["guest_id"] == me["id"] and seat_after["source"] == "self"

    # The exact check compares the heuristic with a proven optimum on a small part.
    exact = client.post(f"/api/events/{event_id}/optimise/exact-check", headers=organiser, json={})
    assert exact.status_code == 200, exact.text
    assert exact.json()["gap_percent"] >= 0
    assert exact.json()["optimal_score"] >= exact.json()["heuristic_score"]


# ---------------------------------------------------------------- restaurant


def _free_slot(client: TestClient, venue: str, day: str) -> str:
    slots = client.get(f"/api/r/{venue}/slots", params={"date": day, "party": 2}).json()
    return next(s["time"] for s in slots["slots"] if s["status"] == "available")


def _floor_status(client: TestClient, staff: dict[str, str], venue: str, day: str, at: str) -> dict:
    floor = client.get(f"/api/staff/{venue}/floor", headers=staff, params={"date": day, "time": at})
    assert floor.status_code == 200, floor.text
    return {table["id"]: table["status"] for table in floor.json()["tables"]}


def test_restaurant_slice(client: TestClient, session: Session, links: dict[str, str]) -> None:
    venue = _last_part(links["restaurant_booking"])
    day = (date.today() + timedelta(days=7)).isoformat()
    at = _free_slot(client, venue, day)

    # The map comes with a recommended table and the reasons for it.
    params = {"date": day, "time": at, "party": 2}
    table_map = client.get(f"/api/r/{venue}/map", params=params).json()
    best = table_map["recommended"][0]
    assert best["reasons"]
    table_id = best["table_ids"][0]

    # Hold it, then book it.
    held = client.post(f"/api/r/{venue}/hold", json={**params, "table_id": table_id})
    assert held.status_code == 201, held.text
    booking = {"hold_id": held.json()["hold_id"], "name": "Iris Lamego", "party": 2}
    booked = client.post(
        f"/api/r/{venue}/bookings", json={**booking, "email": "iris.lamego@example.com"}
    )
    assert booked.status_code == 201, booked.text
    token = booked.json()["manage_token"]

    # The confirmation email carries the manage link and a calendar invite.
    email = [e for e in _emails(session, "booking_confirmed") if f"/b/{token}" in e.body_text]
    assert len(email) == 1 and "METHOD:PUBLISH" in (email[0].ics or "")

    # Staff see the table as reserved for that time.
    staff = _login(client, "staff@example.com", "DEMO_STAFF_PASSWORD")
    assert _floor_status(client, staff, venue, day, at)[table_id] == "reserved"

    # Walk-in what-if: a best place, its reasons, and who would move (maybe nobody).
    whatif = client.post(
        f"/api/staff/{venue}/whatif", headers=staff, json={"party_size": 4, "time": at, "date": day}
    )
    assert whatif.status_code == 200, whatif.text
    assert whatif.json()["possible"] and whatif.json()["reasons"]
    assert isinstance(whatif.json()["displaced"], list)

    # Cancelling through the manage link frees the table.
    cancelled = client.delete(f"/api/b/{token}")
    assert cancelled.status_code == 200 and cancelled.json()["status"] == "cancelled"
    assert _floor_status(client, staff, venue, day, at)[table_id] == "free"
