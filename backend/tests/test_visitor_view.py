"""What a visitor on the shared link sees: names filtered, nothing personal, no seat actions."""

import json
import time

import pytest
from fastapi.testclient import TestClient
from guest_helpers import shared_event
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_events_setup import choose

from app.models import Guest, Organiser

GUESTS = [
    {
        "name": "Ana Silva",
        "email": "ana.silva@example.com",
        "dietary_note": "Vegetarian lentil-only",
    },
    {"name": "Bruno Costa", "email": "bruno.costa@example.com", "wants_anonymous": True},
]


def _occupants(page: dict) -> set[str]:
    return {seat["occupant"] for seat in page["map"]["seats"] if seat["occupant"]}


@pytest.mark.parametrize(
    ("mode", "ana"),
    [("full_name", "Ana Silva"), ("first_initial", "Ana S."), ("anonymous", "Guest")],
)
def test_occupant_follows_privacy_mode_and_wish(
    client: TestClient, organiser: Organiser, mode: str, ana: str
) -> None:
    setup, token = shared_event(client, organiser, GUESTS, privacy_mode=mode)
    choose(client, setup, "Ana Silva", setup.seats[0][0])
    choose(client, setup, "Bruno Costa", setup.seats[0][1])
    page = client.get(f"/api/j/{token}").json()
    # Bruno asked to be anonymous, so he is "Guest" whatever the mode.
    assert _occupants(page) == {ana, "Guest"}


def test_visitor_json_holds_nothing_personal(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    setup, token = shared_event(client, organiser, GUESTS, privacy_mode="full_name")
    choose(client, setup, "Ana Silva", setup.seats[0][0])
    text = client.get(f"/api/j/{token}").text
    for guest in session.scalars(select(Guest)):
        assert guest.email not in text
        assert guest.token_hash not in text
    for token_value in setup.tokens.values():
        assert token_value not in text
    assert "lentil" not in text and "people" not in json.loads(text)
    seat_keys = {key for seat in json.loads(text)["map"]["seats"] for key in seat}
    assert seat_keys == {"id", "table_id", "label", "x", "y", "accessible", "state", "occupant"}


def test_only_four_states_and_reserved_seats_are_blocked(
    client: TestClient, organiser: Organiser
) -> None:
    extras = {(1, 0): {"reserved_tag": "vip"}, (1, 1): {"is_blocked": True}}
    setup, token = shared_event(client, organiser, GUESTS, extras=extras)
    choose(client, setup, "Ana Silva", setup.seats[0][0])
    held = client.post(
        f"/api/a/{setup.tokens['Bruno Costa']}/hold", json={"seat_id": setup.seats[0][1]}
    )
    assert held.status_code == 200
    states = {
        seat["id"]: seat["state"] for seat in client.get(f"/api/j/{token}").json()["map"]["seats"]
    }
    assert set(states.values()) == {"free", "held", "taken", "blocked"}
    assert states[setup.seats[1][0]] == "blocked"  # reserved for a tag
    assert states[setup.seats[1][1]] == "blocked"
    assert states[setup.seats[0][0]] == "taken" and states[setup.seats[0][1]] == "held"


def test_visitors_cannot_hold_or_confirm(client: TestClient, organiser: Organiser) -> None:
    setup, token = shared_event(client, organiser, GUESTS)
    body = {"seat_id": setup.seats[0][0]}
    for action in ("hold", "confirm"):
        assert client.post(f"/api/j/{token}/{action}", json=body).status_code in (404, 405)
    assert client.delete(f"/api/j/{token}/seat").status_code in (404, 405)


def test_join_panel_reports_places_and_reasons(client: TestClient, organiser: Organiser) -> None:
    setup, token = shared_event(client, organiser, GUESTS)
    join = client.get(f"/api/j/{token}").json()["join"]
    assert join == {"open": True, "places_left": 6, "reason": None}
    client.patch(f"/api/events/{setup.eid}/share", headers=setup.headers, json={"cap": 1})
    assert client.get(f"/api/j/{token}").json()["join"]["places_left"] == 1
    client.patch(
        f"/api/events/{setup.eid}",
        headers=setup.headers,
        json={"change_deadline": "2020-01-01T00:00:00Z"},
    )
    join = client.get(f"/api/j/{token}").json()["join"]
    assert join == {"open": False, "places_left": 0, "reason": "deadline_passed"}


def test_wrong_and_overlong_tokens_are_404(client: TestClient, organiser: Organiser) -> None:
    shared_event(client, organiser, GUESTS)
    assert client.get(f"/api/j/{'a' * 43}").status_code == 404
    assert client.get(f"/api/j/{'a' * 129}").status_code == 404


def test_the_121st_view_in_a_minute_is_refused(
    client: TestClient, organiser: Organiser, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.routers import visitor

    _setup, token = shared_event(client, organiser, GUESTS)
    # The limit counts per calendar minute; start early in one so all calls land in it.
    if time.time() % 60 > 45:
        time.sleep(61 - time.time() % 60)
    codes = [client.get(f"/api/j/{token}").status_code for _ in range(visitor.VIEWS_PER_MINUTE)]
    assert set(codes) == {200}
    refused = client.get(f"/api/j/{token}")
    assert refused.status_code == 429 and refused.json()["error"]["code"] == "rate_limited"
