"""Helpers shared by the guest account tests (not a test file itself).

The test settings run in demo mode with the console email provider, so the
register answer carries `demo_code` (docs/guest-accounts.md, 7.2). That is
how these tests read the emailed code.
"""

from typing import Any

from conftest import TEST_PASSWORD
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_events_setup import EventSetup, make_event

from app.events_service import accounts
from app.models import EmailOutbox, GuestAccount, utc_now
from app.security import create_guest_session, hash_password

GUEST_PASSWORD = "a long guest password"


def open_link(client: TestClient, setup: EventSetup) -> str:
    """Switch the event's shared link on; return its token."""
    response = client.patch(
        f"/api/events/{setup.eid}/share", headers=setup.headers, json={"enabled": True}
    )
    assert response.status_code == 200, response.text
    return response.json()["link"].removeprefix("/j/")


def shared_event(
    client: TestClient, organiser: Any, guests: list[dict[str, Any]] | None = None, **kwargs: Any
) -> tuple[EventSetup, str]:
    setup = make_event(client, organiser, guests or [], **kwargs)
    return setup, open_link(client, setup)


def register(
    client: TestClient, token: str, email: str, name: str = "New Guest", **extra: Any
) -> Any:
    body = {"name": name, "email": email, "password": GUEST_PASSWORD, "consent": True, **extra}
    return client.post(f"/api/j/{token}/register", json=body)


def verify(client: TestClient, email: str, code: str, sent: Any) -> Any:
    """POST /guest/verify with the sign-up id that the register answer `sent` gave."""
    body = {"email": email, "code": code, "signup_id": sent.json()["signup_id"]}
    return client.post("/api/guest/verify", json=body)


def sign_up(
    client: TestClient, token: str, email: str, name: str = "New Guest", code: str | None = None
) -> dict[str, Any]:
    """Register and type the right code. Returns the /guest/verify answer.

    The code comes from the demo answer, or from `code` when the test
    plays the inbox (see use_inbox_code) because the demo shows none.
    """
    sent = register(client, token, email, name)
    assert sent.status_code == 202, sent.text
    verified = verify(client, email, code or sent.json()["demo_code"], sent)
    assert verified.status_code == 201, verified.text
    return verified.json()


INBOX_CODE = "424242"


def use_inbox_code(monkeypatch: Any) -> str:
    """Make every new code INBOX_CODE, as if the test read it in the inbox."""
    monkeypatch.setattr(accounts, "_new_code", lambda: INBOX_CODE)
    return INBOX_CODE


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def make_account(session: Session, email: str, name: str = "Made Directly") -> GuestAccount:
    """An account written straight to the database (its address counts as proven)."""
    account = GuestAccount(
        email=email,
        name=name,
        password_hash=hash_password(TEST_PASSWORD),
        consent_at=utc_now(),
        consent_version="2026-11-10",
    )
    session.add(account)
    session.commit()
    return account


def account_headers(account: GuestAccount) -> dict[str, str]:
    return bearer(create_guest_session(account))


def outbox(session: Session, kind: str | None = None) -> list[EmailOutbox]:
    session.expire_all()
    rows = list(session.scalars(select(EmailOutbox).order_by(EmailOutbox.id)))
    return [row for row in rows if kind is None or row.kind == kind]
