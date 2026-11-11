"""Linking an account to an invited guest: only with a code from that inbox (section 7.3)."""

import pytest
from fastapi.testclient import TestClient
from guest_helpers import (
    account_headers,
    make_account,
    register,
    shared_event,
    sign_up,
    use_inbox_code,
)
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_events_setup import choose

from app.models import Acquaintance, Guest, GuestAccount, Organiser

INVITED = [
    {"name": "Ana Silva", "email": "Ana.Silva@example.com", "group": "Silva family"},
    {"name": "Bruno Costa", "email": "bruno.costa@example.com"},
]


def test_the_code_links_the_invited_guest_and_keeps_everything(
    client: TestClient, organiser: Organiser, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    setup, token = shared_event(client, organiser, INVITED)
    ana = setup.tokens["Ana Silva"]
    choose(client, setup, "Ana Silva", setup.seats[0][0])
    client.post(f"/api/a/{ana}/knows", json={"guest_ids": [setup.guests["Bruno Costa"]]})
    # An invited address gets no code on screen, even in the demo: the test reads the inbox.
    code = use_inbox_code(monkeypatch)
    result = sign_up(client, token, "ana.silva@example.com", name="Someone Else", code=code)
    assert result["join"] == {"status": "linked", "event_id": setup.eid}
    session.expire_all()
    rows = session.scalars(select(Guest).where(Guest.event_id.is_not(None))).all()
    assert len(rows) == 2  # still one row for Ana
    linked = session.get(Guest, setup.guests["Ana Silva"])
    assert linked is not None and linked.account_id is not None
    assert (linked.name, linked.source, linked.email) == (
        "Ana Silva",
        "invited",
        "Ana.Silva@example.com",
    )
    known = session.scalars(
        select(Acquaintance.knows_guest_id).where(Acquaintance.guest_id == linked.id)
    )
    assert list(known) == [setup.guests["Bruno Costa"]]
    page = client.get(f"/api/a/{ana}")  # the personal link still works
    assert page.status_code == 200 and page.json()["me"]["seat_id"] == setup.seats[0][0]
    headers = {"Authorization": f"Bearer {result['token']}"}
    mine = client.get(f"/api/guest/events/{setup.eid}", headers=headers).json()
    assert mine["me"]["seat_id"] == setup.seats[0][0] and mine["me"]["name"] == "Ana Silva"


def test_typing_an_address_without_the_code_changes_nothing(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    setup, token = shared_event(client, organiser, INVITED)
    assert register(client, token, "ana.silva@example.com", name="Stranger").status_code == 202
    session.expire_all()
    ana = session.get(Guest, setup.guests["Ana Silva"])
    assert ana is not None and ana.account_id is None and ana.name == "Ana Silva"
    assert session.scalars(select(GuestAccount)).first() is None


def test_an_erased_invited_row_is_never_linked(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    setup, token = shared_event(client, organiser, INVITED)
    client.delete(
        f"/api/events/{setup.eid}/guests/{setup.guests['Bruno Costa']}", headers=setup.headers
    )
    result = sign_up(client, token, "bruno.costa@example.com", name="Bruno Again")
    assert result["join"]["status"] == "joined"
    session.expire_all()
    erased = session.get(Guest, setup.guests["Bruno Costa"])
    assert erased is not None and erased.account_id is None
    new_row = session.scalars(select(Guest).where(Guest.source == "self_registered")).one()
    assert new_row.name == "Bruno Again"


def test_join_with_a_session_follows_the_same_rules(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    setup, token = shared_event(client, organiser, INVITED)
    ana = make_account(session, "ana.silva@example.com")
    stranger = make_account(session, "someone.new@example.com")
    first = client.post(f"/api/j/{token}/join", headers=account_headers(ana), json={})
    assert first.json() == {"status": "linked", "event_id": setup.eid}
    again = client.post(f"/api/j/{token}/join", headers=account_headers(ana), json={})
    assert again.json() == {"status": "already_member", "event_id": setup.eid}
    new = client.post(f"/api/j/{token}/join", headers=account_headers(stranger))
    assert new.json()["status"] == "joined"
    assert client.post(f"/api/j/{token}/join", json={}).status_code == 401


def test_join_refusals_use_the_error_codes(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    setup, token = shared_event(client, organiser, [{"name": f"G{n}"} for n in range(8)])
    headers = account_headers(make_account(session, "full@example.com"))
    full = client.post(f"/api/j/{token}/join", headers=headers, json={})
    assert full.status_code == 409 and full.json()["error"]["code"] == "event_full"
    client.patch(f"/api/events/{setup.eid}/share", headers=setup.headers, json={"enabled": False})
    closed = client.post(f"/api/j/{token}/join", headers=headers, json={})
    assert closed.status_code == 403 and closed.json()["error"]["code"] == "link_closed"
