"""The attendee journey through /a/{token}: hold, confirm, change, release,
plus the deadline and two people racing for one seat."""

import threading
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from test_events_setup import choose, make_event, recorded_writes, seat_state

from app.core import live
from app.models import AuditLog, EmailOutbox, Organiser, SeatAssignment

GUESTS = [
    {
        "name": "Ana Silva",
        "email": "ana.silva@example.com",
        "group": "Silva family",
        "keep_adjacent": True,
    },
    {"name": "Bruno Costa", "email": "bruno.costa@example.com"},
    {"name": "Carla Dias", "email": "carla.dias@example.com", "group": "Silva family"},
]


def _live_version(client: TestClient, page: dict[str, Any]) -> int:
    return client.get(f"/api/live/{page['event']['live_scope']}/version").json()["version"]


def _emails(session: Session, kind: str = "seat") -> list[EmailOutbox]:
    """Seat emails by default; kind="event_reminder" gives the reminders."""
    session.expire_all()
    rows = session.scalars(select(EmailOutbox).order_by(EmailOutbox.id))
    return [row for row in rows if row.kind.startswith(kind)]


def test_full_attendee_flow(client: TestClient, organiser: Organiser, session: Session) -> None:
    setup = make_event(client, organiser, GUESTS)
    ana, bruno = setup.tokens["Ana Silva"], setup.tokens["Bruno Costa"]
    first, second = setup.seats[0][0], setup.seats[1][0]
    page = setup.page(client, "Ana Silva")
    assert page["me"]["name"] == "Ana Silva" and page["me"]["seat_id"] is None
    version_before = _live_version(client, page)

    assert client.post(f"/api/a/{ana}/rsvp", json={"rsvp": "yes"}).status_code == 200
    knows = client.post(f"/api/a/{ana}/knows", json={"guest_ids": [setup.guests["Bruno Costa"]]})
    assert knows.json() == {"knows": [setup.guests["Bruno Costa"]]}

    held = client.post(f"/api/a/{ana}/hold", json={"seat_id": first})
    assert held.status_code == 200 and held.json()["expires_at"]
    assert seat_state(setup.page(client, "Bruno Costa"), first) == "held"
    assert client.post(f"/api/a/{ana}/confirm", json={"seat_id": first}).status_code == 200
    assert seat_state(setup.page(client, "Ana Silva"), first) == "mine"
    assert seat_state(setup.page(client, "Bruno Costa"), first) == "taken"

    # Bruno sits down; Ana marked him as known, so to her his seat is "friend".
    choose(client, setup, "Bruno Costa", setup.seats[0][1])
    assert seat_state(setup.page(client, "Ana Silva"), setup.seats[0][1]) == "friend"

    # Changing seat frees the old one in the same step.
    choose(client, setup, "Ana Silva", second)
    page = setup.page(client, "Ana Silva")
    assert seat_state(page, first) == "free" and seat_state(page, second) == "mine"

    assert client.delete(f"/api/a/{ana}/seat").status_code == 200
    assert seat_state(setup.page(client, "Ana Silva"), second) == "free"
    assert client.delete(f"/api/a/{bruno}/seat").status_code == 200

    kinds = [(mail.kind, mail.to_email) for mail in _emails(session)]
    assert kinds == [
        ("seat_confirmed", "ana.silva@example.com"),
        ("seat_confirmed", "bruno.costa@example.com"),
        ("seat_changed", "ana.silva@example.com"),
        ("seat_cancelled", "ana.silva@example.com"),
        ("seat_cancelled", "bruno.costa@example.com"),
    ]
    assert all(mail.status == "queued" for mail in _emails(session))
    # Both gave their seat back, so neither reminder will go out.
    assert [mail.status for mail in _emails(session, "event_reminder")] == ["skipped", "skipped"]
    # Real templates and a calendar invite; the guest's own link comes back to them.
    first_email = _emails(session)[0]
    assert f"/e/{ana}" in first_email.body_text
    assert first_email.ics is not None and "METHOD:PUBLISH" in first_email.ics
    assert "METHOD:CANCEL" in (_emails(session)[3].ics or "")
    assert _live_version(client, page) > version_before
    actions = set(session.scalars(select(AuditLog.action)))
    assert {"seat.hold", "seat.confirm", "seat.release", "guest.knows", "guest.rsvp"} <= actions


def test_recommendations_name_only_people_i_know(client: TestClient, organiser: Organiser) -> None:
    setup = make_event(client, organiser, GUESTS)
    choose(client, setup, "Bruno Costa", setup.seats[1][0])
    choose(client, setup, "Carla Dias", setup.seats[1][2])
    ana = setup.tokens["Ana Silva"]
    client.post(f"/api/a/{ana}/knows", json={"guest_ids": [setup.guests["Bruno Costa"]]})
    picks = client.get(f"/api/a/{ana}/recommendations").json()
    assert picks and picks[0]["seat_id"] in setup.seats[1]
    assert any("you know" in reason for reason in picks[0]["reasons"])
    named = {person["name"] for pick in picks for person in pick["known_nearby"]}
    assert named == {"Bruno C."}  # Carla is in Ana's group but not on her own list


def test_confirm_without_hold_is_refused(client: TestClient, organiser: Organiser) -> None:
    setup = make_event(client, organiser, GUESTS)
    response = client.post(
        f"/api/a/{setup.tokens['Ana Silva']}/confirm", json={"seat_id": setup.seats[0][0]}
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "hold_expired"


def test_held_or_taken_seat_gives_helpful_409(client: TestClient, organiser: Organiser) -> None:
    setup = make_event(client, organiser, GUESTS)
    seat = setup.seats[0][0]
    choose(client, setup, "Ana Silva", seat)
    response = client.post(f"/api/a/{setup.tokens['Bruno Costa']}/hold", json={"seat_id": seat})
    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "seat_taken" and "choose another seat" in error["message"]


def test_reserved_and_blocked_seats_are_refused(client: TestClient, organiser: Organiser) -> None:
    extras = {(0, 0): {"reserved_tag": "vip"}, (0, 1): {"is_blocked": True}}
    setup = make_event(client, organiser, GUESTS, extras=extras)
    page = setup.page(client, "Ana Silva")
    assert seat_state(page, setup.seats[0][0]) == "blocked"
    for seat in setup.seats[0][:2]:
        response = client.post(f"/api/a/{setup.tokens['Ana Silva']}/hold", json={"seat_id": seat})
        assert response.status_code == 409


def test_deadline_passed_blocks_seat_changes(client: TestClient, organiser: Organiser) -> None:
    setup = make_event(client, organiser, GUESTS, change_deadline="2020-01-01T00:00:00Z")
    token = setup.tokens["Ana Silva"]
    page = setup.page(client, "Ana Silva")
    assert page["event"]["deadline_passed"] is True
    for response in (
        client.post(f"/api/a/{token}/hold", json={"seat_id": setup.seats[0][0]}),
        client.post(f"/api/a/{token}/confirm", json={"seat_id": setup.seats[0][0]}),
        client.delete(f"/api/a/{token}/seat"),
        client.post(f"/api/a/{token}/rsvp", json={"rsvp": "no"}),
    ):
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "deadline_passed"
    # Privacy is not a seat change, so it stays possible.
    assert client.post(f"/api/a/{token}/privacy", json={"wants_anonymous": True}).status_code == 200


def test_two_attendees_race_for_one_seat(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    setup = make_event(client, organiser, GUESTS)
    seat = setup.seats[0][0]
    start = threading.Barrier(2)
    results: dict[str, int] = {}

    def grab(name: str) -> None:
        token = setup.tokens[name]
        start.wait()
        held = client.post(f"/api/a/{token}/hold", json={"seat_id": seat})
        if held.status_code != 200:
            results[name] = held.status_code
            return
        results[name] = client.post(f"/api/a/{token}/confirm", json={"seat_id": seat}).status_code

    threads = [threading.Thread(target=grab, args=(n,)) for n in ("Ana Silva", "Bruno Costa")]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sorted(results.values()) == [200, 409]
    session.expire_all()
    owners = list(session.scalars(select(SeatAssignment).where(SeatAssignment.seat_id == seat)))
    assert len(owners) == 1


def test_rsvp_no_releases_the_seat(client: TestClient, organiser: Organiser) -> None:
    setup = make_event(client, organiser, GUESTS)
    choose(client, setup, "Ana Silva", setup.seats[0][0])
    token = setup.tokens["Ana Silva"]
    assert client.post(f"/api/a/{token}/rsvp", json={"rsvp": "no"}).status_code == 200
    assert seat_state(setup.page(client, "Bruno Costa"), setup.seats[0][0]) == "free"
    refused = client.post(f"/api/a/{token}/hold", json={"seat_id": setup.seats[0][0]})
    assert refused.status_code == 409


def test_recommendations_do_not_reveal_who_listed_me(
    client: TestClient, organiser: Organiser
) -> None:
    # Bruno listed Ana; Ana listed nobody and has no group. If Bruno's list
    # counted for Ana, the seats next to Bruno would rise to the top and tell
    # her that Bruno listed her.
    setup = make_event(client, organiser, [{"name": "Ana Silva"}, {"name": "Bruno Costa"}])
    client.post(
        f"/api/a/{setup.tokens['Bruno Costa']}/knows",
        json={"guest_ids": [setup.guests["Ana Silva"]]},
    )
    choose(client, setup, "Bruno Costa", setup.seats[1][2])
    picks = client.get(f"/api/a/{setup.tokens['Ana Silva']}/recommendations").json()
    assert picks
    # Nothing to gain anywhere, so the order is simply by seat id.
    assert [pick["seat_id"] for pick in picks] == sorted(pick["seat_id"] for pick in picks)
    for rank, pick in enumerate(picks, start=1):
        assert "gain" not in pick  # a raw number could still leak small differences
        assert pick["rank"] == rank and pick["match"] == "none"


def test_attendee_page_names_the_venue(client: TestClient, organiser: Organiser) -> None:
    setup = make_event(client, organiser, GUESTS)
    assert setup.page(client, "Ana Silva")["venue"] == {"name": "Hall"}


@pytest.mark.parametrize("action", ["hold", "confirm"])
def test_seat_writes_lock_the_event_first(
    client: TestClient, organiser: Organiser, action: str
) -> None:
    """Every seat write takes the event's live_versions row first.

    One lock order for every transaction means two of them can never wait on
    each other in a circle (a Postgres deadlock), whatever they touch next.
    """
    setup = make_event(client, organiser, GUESTS)
    token, seat = setup.tokens["Ana Silva"], setup.seats[0][0]
    if action == "confirm":
        assert client.post(f"/api/a/{token}/hold", json={"seat_id": seat}).status_code == 200
    with recorded_writes() as writes:
        response = client.post(f"/api/a/{token}/{action}", json={"seat_id": seat})
    assert response.status_code == 200, response.text
    assert "live_versions" in writes[0]


class _FakeDeadlock(Exception):
    sqlstate = "40P01"  # what psycopg reports when Postgres breaks a deadlock


def test_database_deadlock_becomes_a_clean_409(
    client: TestClient, organiser: Organiser, monkeypatch: pytest.MonkeyPatch
) -> None:
    setup = make_event(client, organiser, GUESTS)

    def deadlocked(*_args: Any) -> None:
        raise OperationalError("UPDATE live_versions", {}, _FakeDeadlock())

    monkeypatch.setattr(live, "bump", deadlocked)
    token = setup.tokens["Ana Silva"]
    response = client.post(f"/api/a/{token}/hold", json={"seat_id": setup.seats[0][0]})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "conflict"
    assert "try again" in response.json()["error"]["message"]
