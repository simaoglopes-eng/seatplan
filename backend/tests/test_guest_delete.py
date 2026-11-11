"""Deleting a guest account (GDPR): seats freed, rows erased or unlinked, emails wiped."""

from typing import Any

from fastapi.testclient import TestClient
from guest_helpers import (
    GUEST_PASSWORD,
    INBOX_CODE,
    bearer,
    outbox,
    shared_event,
    sign_up,
    use_inbox_code,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Base, EmailCode, Guest, GuestAccount, Organiser, SeatAssignment

EMAIL = "ana.silva@example.com"
ACCOUNT_NAME = "Ana Account"


def _setup(client: TestClient, organiser: Organiser, monkeypatch: Any) -> dict[str, Any]:
    """One event joined with the link, one where the organiser invited the same address.

    The address is invited, so the demo shows no code: the test reads the inbox.
    """
    joined, joined_token = shared_event(client, organiser)
    invited, invited_token = shared_event(
        client, organiser, [{"name": "Ana Silva", "email": EMAIL}]
    )
    code = use_inbox_code(monkeypatch)
    result = sign_up(client, joined_token, EMAIL, name=ACCOUNT_NAME, code=code)
    headers = bearer(result["token"])
    linked = client.post(f"/api/j/{invited_token}/join", headers=headers, json={})
    assert linked.json()["status"] == "linked"
    for setup, seat in ((joined, joined.seats[0][0]), (invited, invited.seats[0][0])):
        base = f"/api/guest/events/{setup.eid}"
        client.post(f"{base}/hold", headers=headers, json={"seat_id": seat})
        assert (
            client.post(f"{base}/confirm", headers=headers, json={"seat_id": seat}).status_code
            == 200
        )
    assert client.post("/api/guest/password/forgot", json={"email": EMAIL}).status_code == 202
    return {"joined": joined, "invited": invited, "headers": headers}


def _everything(session: Session) -> list[tuple[str, str]]:
    """(table, row as text) for every row of every table."""
    rows = []
    with session.get_bind().connect() as connection:
        for table in Base.metadata.sorted_tables:
            for found in connection.execute(table.select()):
                rows.append((table.name, " ".join(str(value) for value in found)))
    return rows


def test_a_wrong_password_changes_nothing(
    client: TestClient, organiser: Organiser, session: Session, monkeypatch: Any
) -> None:
    world = _setup(client, organiser, monkeypatch)
    # The rate limit counts the try; nothing else may change.
    before = [row for row in _everything(session) if row[0] != "rate_limits"]
    refused = client.post(
        "/api/guest/me/delete", headers=world["headers"], json={"password": "nope"}
    )
    # 422 on the password field, not 401: a 401 would mean "signed out".
    assert refused.status_code == 422
    assert refused.json()["error"]["message"] == "password: That password is not correct."
    assert client.get("/api/guest/me", headers=world["headers"]).status_code == 200
    assert [row for row in _everything(session) if row[0] != "rate_limits"] == before


def test_deleting_the_account(
    client: TestClient, organiser: Organiser, session: Session, monkeypatch: Any
) -> None:
    world = _setup(client, organiser, monkeypatch)
    invited_id = world["invited"].guests["Ana Silva"]
    cancellations_before = len(outbox(session, "seat_cancelled"))
    deleted = client.post(
        "/api/guest/me/delete", headers=world["headers"], json={"password": GUEST_PASSWORD}
    )
    assert deleted.status_code == 200 and deleted.json() == {"deleted": True}
    session.expire_all()
    assert session.scalars(select(SeatAssignment)).all() == []  # both seats are free
    erased = session.scalars(select(Guest).where(Guest.source == "self_registered")).one()
    assert erased.token_revoked_at is not None and erased.name == "Deleted guest"
    kept = session.get(Guest, invited_id)
    assert kept is not None and (kept.name, kept.email, kept.account_id) == (
        "Ana Silva",
        EMAIL,
        None,
    )
    assert kept.token_revoked_at is None  # the organiser's record stays
    assert len(outbox(session, "seat_cancelled")) == cancellations_before  # no email
    assert session.scalars(select(EmailCode)).all() == []
    assert session.scalars(select(GuestAccount)).all() == []
    assert client.get("/api/guest/me", headers=world["headers"]).status_code == 401
    for table, text in _everything(session):
        assert ACCOUNT_NAME not in text, table
        if EMAIL in text:
            assert table == "guests" and "Ana Silva" in text, (table, text)
    assert all(row.status != "queued" or not row.to_email for row in outbox(session))


def test_the_address_can_sign_up_again(
    client: TestClient, organiser: Organiser, session: Session, monkeypatch: Any
) -> None:
    world = _setup(client, organiser, monkeypatch)
    client.post("/api/guest/me/delete", headers=world["headers"], json={"password": GUEST_PASSWORD})
    _setup_again, token = shared_event(client, organiser)
    again = sign_up(client, token, EMAIL, name="Ana Returns", code=INBOX_CODE)
    assert again["join"]["status"] == "joined"
    session.expire_all()
    assert session.scalars(select(GuestAccount)).one().name == "Ana Returns"
