"""What one attendee can learn about the others, in every privacy mode,
and why a wrong link, an old link and a revoked link all look the same."""

import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_events_setup import make_event

from app.models import Guest, Organiser

VIEWER = {"name": "Vera Viewer", "email": "vera.viewer@example.com"}
OTHERS = [
    {
        "name": "Olivia Quintanilha",
        "email": "olivia.q@example.com",
        "dietary_note": "Peanut allergy",
        "needs_accessible": True,
    },
    {"name": "Rodrigo Zambujal", "email": "rodrigo.z@example.com", "dietary_note": "Halal"},
    {"name": "Henrique Xavier", "email": "henrique.x@example.com", "wants_anonymous": True},
]
EXTRAS = {(0, 0): {"is_accessible": True}}
FORBIDDEN = [
    "olivia.q@example.com",
    "rodrigo.z@example.com",
    "henrique.x@example.com",
    "Peanut allergy",
    "Halal",
    "dietary",
    "email",
    "token",
]
EXPECTED_NAMES = {
    "full_name": {"Olivia Quintanilha", "Rodrigo Zambujal", "Guest"},
    "first_initial": {"Olivia Q.", "Rodrigo Z.", "Guest"},
    "anonymous": {"Guest"},
}


def _everything_vera_sees(client: TestClient, token: str) -> str:
    """Every attendee endpoint that returns data about other people, as one text."""
    parts = [
        client.get(f"/api/a/{token}").json(),
        client.get(f"/api/a/{token}/people").json(),
        client.get(f"/api/a/{token}/people", params={"q": "o"}).json(),
        client.get(f"/api/a/{token}/recommendations").json(),
    ]
    return json.dumps(parts)


@pytest.mark.parametrize("mode", ["full_name", "first_initial", "anonymous"])
def test_names_follow_the_privacy_mode(
    client: TestClient, organiser: Organiser, session: Session, mode: str
) -> None:
    setup = make_event(client, organiser, [VIEWER, *OTHERS], privacy_mode=mode, extras=EXTRAS)
    for index, guest in enumerate(OTHERS):
        seat = setup.seats[0][index]
        moved = client.put(
            f"/api/events/{setup.eid}/assignments/{setup.guests[guest['name']]}",
            headers=setup.headers,
            json={"seat_id": seat},
        )
        assert moved.status_code == 200, moved.text
    token = setup.tokens["Vera Viewer"]
    ids = [setup.guests[g["name"]] for g in OTHERS]
    client.post(f"/api/a/{token}/knows", json={"guest_ids": ids})
    page = client.get(f"/api/a/{token}").json()

    shown = {seat["occupant"] for seat in page["map"]["seats"] if seat["occupant"]}
    assert shown == EXPECTED_NAMES[mode]
    assert {person["name"] for person in page["people"]} == EXPECTED_NAMES[mode]

    text = _everything_vera_sees(client, token)
    for forbidden in FORBIDDEN:
        assert forbidden not in text, forbidden
    # Henrique asked to be anonymous: his name never appears, in any mode.
    assert "Henrique" not in text and "Xavier" not in text
    if mode != "full_name":
        assert "Quintanilha" not in text and "Zambujal" not in text
    # Raw tokens and their hashes never leave the server.
    for guest in session.scalars(select(Guest)):
        assert guest.token_hash not in text
    for name, raw in setup.tokens.items():
        if name != "Vera Viewer":
            assert raw not in text
    # Only my own "needs_accessible" is in the payload, never someone else's.
    assert text.count("needs_accessible") == 1


def test_people_entries_carry_only_safe_fields(client: TestClient, organiser: Organiser) -> None:
    setup = make_event(client, organiser, [VIEWER, *OTHERS], privacy_mode="full_name")
    people = client.get(f"/api/a/{setup.tokens['Vera Viewer']}/people").json()
    assert all(set(person) == {"id", "name", "seat_id", "known"} for person in people)
    seat_keys = {"id", "table_id", "label", "x", "y", "accessible", "state", "occupant"}
    page = client.get(f"/api/a/{setup.tokens['Vera Viewer']}").json()
    assert all(set(seat) == seat_keys for seat in page["map"]["seats"])


def test_search_only_matches_the_visible_name(client: TestClient, organiser: Organiser) -> None:
    setup = make_event(client, organiser, [VIEWER, *OTHERS], privacy_mode="first_initial")
    token = setup.tokens["Vera Viewer"]
    # "Quintanilha" is hidden in first_initial mode, so searching it finds nobody.
    assert client.get(f"/api/a/{token}/people", params={"q": "Quintanilha"}).json() == []
    found = client.get(f"/api/a/{token}/people", params={"q": "olivia"}).json()
    assert [person["name"] for person in found] == ["Olivia Q."]


def test_wants_anonymous_switch(client: TestClient, organiser: Organiser) -> None:
    setup = make_event(client, organiser, [VIEWER, *OTHERS], privacy_mode="full_name")
    rodrigo = setup.tokens["Rodrigo Zambujal"]
    answer = client.post(f"/api/a/{rodrigo}/privacy", json={"wants_anonymous": True}).json()
    assert answer["shown_to_others_as"] == "Guest"
    text = json.dumps(client.get(f"/api/a/{setup.tokens['Vera Viewer']}").json())
    assert "Rodrigo" not in text


def test_knows_refuses_guests_of_other_events(client: TestClient, organiser: Organiser) -> None:
    first = make_event(client, organiser, [VIEWER])
    second = make_event(client, organiser, [{"name": "Outside Person"}])
    response = client.post(
        f"/api/a/{first.tokens['Vera Viewer']}/knows",
        json={"guest_ids": [second.guests["Outside Person"]]},
    )
    assert response.status_code == 422


def test_wrong_old_and_revoked_links_look_identical(
    client: TestClient, organiser: Organiser
) -> None:
    setup = make_event(client, organiser, [VIEWER, *OTHERS])
    olivia, rodrigo = setup.tokens["Olivia Quintanilha"], setup.tokens["Rodrigo Zambujal"]
    renewed = client.post(
        f"/api/events/{setup.eid}/guests/{setup.guests['Olivia Quintanilha']}/new-link",
        headers=setup.headers,
    )
    assert renewed.status_code == 200
    erased = client.delete(
        f"/api/events/{setup.eid}/guests/{setup.guests['Rodrigo Zambujal']}", headers=setup.headers
    )
    assert erased.status_code == 200
    wrong = client.get("/api/a/this-token-was-never-issued-to-anyone-at-all-x")
    old = client.get(f"/api/a/{olivia}")
    revoked = client.get(f"/api/a/{rodrigo}")
    assert wrong.status_code == old.status_code == revoked.status_code == 404
    assert wrong.json() == old.json() == revoked.json()
    # The new link works.
    assert client.get(renewed.json()["link"].replace("/e/", "/api/a/")).status_code == 200


def test_attendee_endpoints_are_rate_limited(
    client: TestClient, organiser: Organiser, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.routers import attendee

    monkeypatch.setattr(attendee, "REQUESTS_PER_MINUTE", 3)
    codes = [client.get("/api/a/guessing-a-token").status_code for _ in range(5)]
    assert codes[:3] == [404, 404, 404]
    assert codes[3:] == [429, 429]
