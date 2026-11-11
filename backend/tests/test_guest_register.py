"""Signing up through the shared link: the code, the account, capacity, races and limits."""

import re
import threading
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from guest_helpers import (
    GUEST_PASSWORD,
    account_headers,
    make_account,
    outbox,
    register,
    shared_event,
    sign_up,
    verify,
)
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session
from test_events_setup import add_guest

from app.config import get_settings
from app.events_service import accounts, share
from app.mail.providers import OutgoingEmail
from app.models import Base, EmailCode, Guest, GuestAccount, Organiser


class FakeProvider:
    def __init__(self) -> None:
        self.sent: list[OutgoingEmail] = []

    def send(self, message: OutgoingEmail) -> str:
        self.sent.append(message)
        return f"fake-{len(self.sent)}"


@pytest.fixture
def provider(monkeypatch: pytest.MonkeyPatch) -> FakeProvider:
    fake = FakeProvider()
    monkeypatch.setattr(accounts, "provider_from_settings", lambda _settings: fake)
    return fake


def _allow(monkeypatch: pytest.MonkeyPatch, *addresses: str) -> None:
    monkeypatch.setenv("EMAIL_ALLOWLIST", ",".join(addresses))
    get_settings.cache_clear()


def _count(session: Session, model: Any) -> int:
    session.expire_all()
    return session.scalar(select(func.count()).select_from(model)) or 0


def _wrong(code: str) -> str:
    return f"{(int(code) + 1) % 10**6:06d}"


# ---------------------------------------------------------------- the code


def test_new_address_gets_a_code_sent_at_once_and_never_stored_plainly(
    client: TestClient,
    organiser: Organiser,
    session: Session,
    provider: FakeProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _allow(monkeypatch, "mia.new@example.com")
    _setup, token = shared_event(client, organiser)
    sent = register(client, token, "Mia.New@example.com", name="Mia New")
    assert sent.status_code == 202
    body = sent.json()
    code = body.pop("demo_code")
    # A random id for this browser only; the database keeps only its keyed hash.
    signup_id = body.pop("signup_id")
    assert len(signup_id) >= 40
    assert body == {
        "status": "code_sent",
        "sent_to": "mi***@example.com",
        "expires_in_seconds": 900,
    }
    assert _count(session, EmailCode) == 1
    assert len(provider.sent) == 1 and code in provider.sent[0].body_text
    assert code not in provider.sent[0].subject  # lock screens show subjects
    [row] = outbox(session, "account_code")
    assert row.status == "sent" and row.body_text == row.body_html == "[code removed]"
    pattern = re.compile(rf"(?<!\d){code}(?!\d)")
    with session.get_bind().connect() as connection:
        for table in Base.metadata.sorted_tables:
            for found in connection.execute(table.select()):
                assert not pattern.search(" ".join(str(value) for value in found)), table.name


def test_an_existing_account_gets_the_same_answer_and_no_code(
    client: TestClient, organiser: Organiser, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DEMO_MODE", "0")
    get_settings.cache_clear()
    _setup, token = shared_event(client, organiser)
    make_account(session, "has.account@example.com")
    new = register(client, token, "no.account@example.com")
    known = register(client, token, "has.account@example.com")
    assert new.status_code == known.status_code == 202
    blank = {"sent_to": "", "signup_id": ""}
    assert {**new.json(), **blank} == {**known.json(), **blank}
    assert len(new.json()["signup_id"]) == len(known.json()["signup_id"])
    assert "demo_code" not in new.json()
    assert _count(session, EmailCode) == 1
    assert [row.kind for row in outbox(session)] == ["account_code", "account_exists"]
    assert "has.account" not in outbox(session)[1].idempotency_key


def test_demo_code_needs_demo_mode_and_the_console(
    client: TestClient, organiser: Organiser, monkeypatch: pytest.MonkeyPatch, provider: Any
) -> None:
    _setup, token = shared_event(client, organiser)
    assert "demo_code" in register(client, token, "one@example.com").json()
    monkeypatch.setenv("EMAIL_PROVIDER", "resend")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_not_real")
    get_settings.cache_clear()
    assert "demo_code" not in register(client, token, "two@example.com").json()


# ---------------------------------------------------------------- verify


def test_wrong_codes_count_down_then_the_code_is_gone(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    _setup, token = shared_event(client, organiser)
    sent = register(client, token, "lea@example.com")
    code = sent.json()["demo_code"]
    messages = []
    for _ in range(5):
        answer = verify(client, "lea@example.com", _wrong(code), sent)
        assert answer.status_code == 422
        messages.append(answer.json()["error"]["message"])
    assert messages[0] == "That code is not right. You have 4 tries left."
    assert messages[3] == "That code is not right. You have 1 try left."
    assert messages[4] == "That code is not right. Please ask for a new code."
    assert _count(session, EmailCode) == 0
    late = verify(client, "lea@example.com", code, sent)
    assert late.status_code == 404 and _count(session, GuestAccount) == 0


def test_an_expired_code_is_404(client: TestClient, organiser: Organiser, session: Session) -> None:
    _setup, token = shared_event(client, organiser)
    sent = register(client, token, "old@example.com")
    code = sent.json()["demo_code"]
    row = session.scalars(select(EmailCode)).one()
    row.expires_at = row.created_at - timedelta(seconds=1)
    session.commit()
    answer = verify(client, "old@example.com", code, sent)
    assert answer.status_code == 404 and answer.json()["error"]["code"] == "not_found"


def test_the_right_code_makes_account_session_and_guest_row(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    setup, token = shared_event(client, organiser)
    sent = register(client, token, "nia@example.com", name="Nia Neves", needs_accessible=True)
    verified = verify(client, "NIA@example.com", sent.json()["demo_code"], sent)
    assert verified.status_code == 201
    data = verified.json()
    assert data["join"] == {"status": "joined", "event_id": setup.eid}
    assert data["account"]["email"] == "nia@example.com" and data["token"].startswith("g.")
    guest = session.scalars(select(Guest)).one()
    assert (guest.source, guest.rsvp, guest.needs_accessible) == ("self_registered", "yes", True)
    me = client.get("/api/guest/me", headers={"Authorization": f"Bearer {data['token']}"})
    assert [event["event_id"] for event in me.json()["events"]] == [setup.eid]
    listed = client.get(f"/api/events/{setup.eid}/guests", headers=setup.headers).json()
    assert [(g["source"], g["has_account"]) for g in listed] == [("self_registered", True)]


# ---------------------------------------------------------------- capacity


def test_a_full_event_makes_the_account_but_no_guest_row(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    """Register is not refused (that would reveal who is invited); the join step says full."""
    guests = [{"name": f"Guest {n}"} for n in range(8)]  # 8 seats, 8 guests
    _setup, token = shared_event(client, organiser, guests)
    result = sign_up(client, token, "late@example.com")
    assert result["join"] == {"status": "event_full", "event_id": None}
    assert session.scalars(select(Guest).where(Guest.account_id.is_not(None))).first() is None


def test_filling_up_during_sign_up_still_makes_the_account(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    setup, token = shared_event(client, organiser, [{"name": f"Guest {n}"} for n in range(7)])
    sent = register(client, token, "almost@example.com")
    code = sent.json()["demo_code"]
    add_guest(client, setup, {"name": "The last invited guest"})
    verified = verify(client, "almost@example.com", code, sent)
    assert verified.status_code == 201
    assert verified.json()["join"] == {"status": "event_full", "event_id": None}
    assert _count(session, GuestAccount) == 1
    assert session.scalars(select(Guest).where(Guest.account_id.is_not(None))).first() is None


def test_the_cap_is_honoured(client: TestClient, organiser: Organiser) -> None:
    setup, token = shared_event(client, organiser)
    client.patch(f"/api/events/{setup.eid}/share", headers=setup.headers, json={"cap": 1})
    assert sign_up(client, token, "first@example.com")["join"]["status"] == "joined"
    assert sign_up(client, token, "second@example.com")["join"]["status"] == "event_full"


def test_two_visitors_race_for_the_last_place(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    _setup, token = shared_event(client, organiser, [{"name": f"Guest {n}"} for n in range(7)])
    emails = ["racer.one@example.com", "racer.two@example.com"]
    sents = {email: register(client, token, email) for email in emails}
    start = threading.Barrier(2)
    results: dict[str, str] = {}

    def finish(email: str) -> None:
        start.wait()
        answer = verify(client, email, sents[email].json()["demo_code"], sents[email])
        results[email] = answer.json()["join"]["status"]

    threads = [threading.Thread(target=finish, args=(email,)) for email in emails]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sorted(results.values()) == ["event_full", "joined"]
    rows = session.scalars(select(Guest).where(Guest.source == "self_registered")).all()
    assert len(rows) == 1 and _count(session, GuestAccount) == 2


def test_ten_accounts_join_for_three_places(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    _setup, token = shared_event(client, organiser, [{"name": f"Guest {n}"} for n in range(5)])
    people = [make_account(session, f"joiner{n}@example.com") for n in range(10)]
    start = threading.Barrier(len(people))
    statuses: list[int] = []

    def join(account: GuestAccount) -> None:
        start.wait()
        response = client.post(f"/api/j/{token}/join", headers=account_headers(account), json={})
        statuses.append(response.status_code)

    threads = [threading.Thread(target=join, args=(person,)) for person in people]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sorted(statuses) == [200] * 3 + [409] * 7
    session.expire_all()
    count = session.scalar(
        select(func.count()).select_from(Guest).where(Guest.source == "self_registered")
    )
    assert count == 3


# ---------------------------------------------------------------- limits


def _codes_hash(session: Session) -> list[str]:
    session.expire_all()
    return [row.code_hash for row in session.scalars(select(EmailCode).order_by(EmailCode.id))]


@pytest.mark.parametrize(
    "limit",
    [
        "CODE_SENDS_PER_NETWORK_HOUR",
        "CODE_SENDS_PER_NETWORK_DAY",
        "CODE_SENDS_PER_APP_HOUR",
    ],
)
def test_code_sending_limits(
    client: TestClient,
    organiser: Organiser,
    session: Session,
    monkeypatch: pytest.MonkeyPatch,
    limit: str,
) -> None:
    monkeypatch.setattr(accounts, limit, 2)
    _setup, token = shared_event(client, organiser)
    assert register(client, token, "a1@example.com").status_code == 202
    assert register(client, token, "a2@example.com").status_code == 202
    before = _codes_hash(session)
    refused = register(client, token, "a3@example.com")
    assert refused.status_code == 429 and _codes_hash(session) == before


def test_three_codes_an_hour_per_mailbox(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    _setup, token = shared_event(client, organiser)
    for email in ("max@example.com", "MAX@example.com", "max+x@example.com"):
        assert register(client, token, email).status_code == 202
    before = _codes_hash(session)
    assert register(client, token, "max+again@example.com").status_code == 429
    assert _codes_hash(session) == before


def test_code_checks_are_limited_per_network(
    client: TestClient, organiser: Organiser, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(accounts, "CODE_CHECKS_PER_NETWORK", 2)
    _setup, token = shared_event(client, organiser)
    sent = register(client, token, "kim@example.com")
    code = sent.json()["demo_code"]
    for _ in range(2):
        verify(client, "kim@example.com", _wrong(code), sent)
    refused = verify(client, "kim@example.com", code, sent)
    assert refused.status_code == 429
    session.expire_all()
    assert session.scalars(select(EmailCode)).one().attempts == 2
    assert _count(session, GuestAccount) == 0


def test_joins_per_event_are_limited(
    client: TestClient, organiser: Organiser, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(share, "JOINS_PER_HOUR", 1)
    _setup, token = shared_event(client, organiser)
    assert sign_up(client, token, "one.join@example.com")["join"]["status"] == "joined"
    sent = register(client, token, "two.join@example.com")
    code = sent.json()["demo_code"]
    refused = verify(client, "two.join@example.com", code, sent)
    assert refused.status_code == 429
    assert _count(session, GuestAccount) == 1 and _count(session, EmailCode) == 1


def test_logins_are_limited_per_address(
    client: TestClient, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(accounts, "LOGINS_PER_MINUTE", 2)
    make_account(session, "lin@example.com")
    body = {"email": "lin@example.com", "password": "wrong password"}
    assert [client.post("/api/guest/login", json=body).status_code for _ in range(3)] == [
        401,
        401,
        429,
    ]


def test_account_event_routes_are_limited(
    client: TestClient, organiser: Organiser, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.routers import guest_events

    monkeypatch.setattr(guest_events, "REQUESTS_PER_MINUTE", 2)
    setup, token = shared_event(client, organiser)
    headers = {"Authorization": f"Bearer {sign_up(client, token, 'eve@example.com')['token']}"}
    codes = [
        client.get(f"/api/guest/events/{setup.eid}", headers=headers).status_code for _ in range(3)
    ]
    assert codes == [200, 200, 429]


# ---------------------------------------------------------------- validation


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"consent": False}, "consent"),
        ({"password": "123456789"}, "password: Use at least 10 characters."),
        ({"password": "nora@example.com"}, "password: Do not use your email address."),
        ({"surprise": 1}, "surprise"),
        ({"name": "a\x00b"}, "name"),
        ({"name": "   "}, "name: Type your name."),
    ],
)
def test_bad_sign_ups_are_422(
    client: TestClient, organiser: Organiser, session: Session, change: dict, message: str
) -> None:
    _setup, token = shared_event(client, organiser)
    body = {
        "name": "Nora",
        "email": "nora@example.com",
        "password": GUEST_PASSWORD,
        "consent": True,
        **change,
    }
    answer = client.post(f"/api/j/{token}/register", json=body)
    assert answer.status_code == 422 and message in answer.json()["error"]["message"]
    assert _count(session, EmailCode) == 0


def test_register_after_the_deadline_is_refused(client: TestClient, organiser: Organiser) -> None:
    _setup, token = shared_event(client, organiser, change_deadline="2020-01-01T00:00:00Z")
    answer = register(client, token, "too.late@example.com")
    assert answer.status_code == 409 and answer.json()["error"]["code"] == "deadline_passed"


def test_two_verifies_at_once_make_one_account(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    _setup, token = shared_event(client, organiser)
    sent = register(client, token, "twin@example.com")
    code = sent.json()["demo_code"]
    start = threading.Barrier(2)
    statuses: list[int] = []

    def finish() -> None:
        start.wait()
        answer = verify(client, "twin@example.com", code, sent)
        statuses.append(answer.status_code)

    threads = [threading.Thread(target=finish) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert 201 in statuses and set(statuses) <= {201, 404, 409}
    with session.get_bind().connect() as connection:
        assert connection.execute(text("SELECT count(*) FROM guest_accounts")).scalar() == 1
