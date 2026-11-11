"""Guest sessions are kept apart from organiser sessions, and end when they should."""

import time

import pytest
from conftest import TEST_PASSWORD, auth_header
from fastapi import FastAPI
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from guest_helpers import (
    account_headers,
    bearer,
    make_account,
    shared_event,
    sign_up,
    use_inbox_code,
)
from sqlalchemy.orm import Session

from app.events_service import accounts
from app.models import Organiser
from app.security import (
    create_guest_session,
    create_session_token,
    verify_guest_session,
    verify_session_token,
)


def _routes(app: FastAPI, prefix: str) -> list[tuple[str, str]]:
    found = []
    for route in app.routes:
        if isinstance(route, APIRoute) and route.path.startswith(prefix):
            for method in sorted(route.methods):
                found.append((method, route.path))
    return found


def _fill(path: str, eid: str) -> str:
    return (
        path.replace("{eid}", eid)
        .replace("{gid}", "1")
        .replace("{sid}", "1")
        .replace("{token}", "x" * 43)
    )


def test_the_two_token_shapes_never_cross(session: Session, organiser: Organiser) -> None:
    # Account 1 and organiser 1 share the number: each token must open only its own door.
    account = make_account(session, "same.number@example.com")
    assert account.id == organiser.id
    assert verify_session_token(create_guest_session(account)) is None
    assert verify_guest_session(create_session_token(organiser.id)) is None
    assert verify_guest_session(create_guest_session(account)) == (account.id, 0)


def test_a_guest_token_opens_no_organiser_route(
    app: FastAPI, client: TestClient, organiser: Organiser, session: Session
) -> None:
    setup, token = shared_event(client, organiser)
    guest = bearer(sign_up(client, token, "door@example.com")["token"])
    for prefix in ("/api/events", "/api/venues", "/api/emails", "/api/auth/me", "/api/staff"):
        for method, path in _routes(app, prefix):
            answer = client.request(method, _fill(path, setup.eid), headers=guest)
            assert answer.status_code == 401, (method, path, answer.text)


def test_an_organiser_token_opens_no_guest_route(
    app: FastAPI, client: TestClient, organiser: Organiser
) -> None:
    setup, token = shared_event(client, organiser)
    sign_up(client, token, "member@example.com")
    staff_like = auth_header(organiser)
    personal = bearer(next(iter(setup.tokens.values()), "a" * 43))
    for method, path in _routes(app, "/api/guest") + [("POST", "/api/j/{token}/join")]:
        if path.endswith(("/verify", "/login", "/forgot", "/reset")):
            continue  # open to anyone by design
        url = _fill(path, setup.eid).replace("x" * 43, token)
        for headers in (staff_like, personal):
            answer = client.request(method, url, headers=headers, json={})
            assert answer.status_code == 401, (method, path, answer.text)


def test_tampered_expired_and_old_version_tokens_are_refused(
    client: TestClient, session: Session
) -> None:
    account = make_account(session, "tam@example.com")
    good = create_guest_session(account)
    parts = good.split(".")
    tampered = ".".join([parts[0], parts[1], parts[2], str(int(parts[3]) + 999), parts[4]])
    expired = create_guest_session(account, now=time.time() - 13 * 3600)
    for token in (tampered, expired, good[:-1] + ("0" if good[-1] != "0" else "1"), "g.1.0.1.x"):
        assert client.get("/api/guest/me", headers=bearer(token)).status_code == 401
    assert client.get("/api/guest/me", headers=bearer(good)).status_code == 200
    account.session_version += 1
    session.commit()
    answer = client.get("/api/guest/me", headers=bearer(good))
    assert (
        answer.status_code == 401 and answer.json()["error"]["message"] == "Please sign in again."
    )


def test_logout_ends_every_session(client: TestClient, session: Session) -> None:
    account = make_account(session, "out@example.com")
    first, second = account_headers(account), account_headers(account)
    assert client.post("/api/guest/logout", headers=first, json={}).json() == {"signed_out": True}
    assert client.get("/api/guest/me", headers=second).status_code == 401


def test_login_hides_whether_the_account_exists(client: TestClient, session: Session) -> None:
    make_account(session, "real@example.com")
    wrong = client.post("/api/guest/login", json={"email": "real@example.com", "password": "nope"})
    unknown = client.post(
        "/api/guest/login", json={"email": "ghost@example.com", "password": "nope"}
    )
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()
    ok = client.post(
        "/api/guest/login", json={"email": "REAL@example.com", "password": TEST_PASSWORD}
    )
    assert ok.status_code == 200 and ok.json()["account"]["email"] == "real@example.com"


def test_failed_logins_stop_at_twenty_but_a_reset_still_works(
    client: TestClient, organiser: Organiser, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(accounts, "LOGINS_PER_MINUTE", 1000)
    account = make_account(session, "target@example.com")
    old_session = account_headers(account)
    body = {"email": "target@example.com", "password": "guess"}
    codes = [client.post("/api/guest/login", json=body).status_code for _ in range(21)]
    assert codes == [401] * 20 + [429]
    right = {"email": "target@example.com", "password": TEST_PASSWORD}
    assert client.post("/api/guest/login", json=right).status_code == 429  # no guessing through
    code = use_inbox_code(monkeypatch)  # reset codes are never shown, not even in the demo
    sent = client.post("/api/guest/password/forgot", json={"email": "target@example.com"})
    assert sent.status_code == 202 and "demo_code" not in sent.json()
    new_password = "a brand new password"
    reset = client.post(
        "/api/guest/password/reset",
        json={
            "email": "target@example.com",
            "code": code,
            "new_password": new_password,
        },
    )
    assert reset.status_code == 200
    assert client.get("/api/guest/me", headers=bearer(reset.json()["token"])).status_code == 200
    assert client.get("/api/guest/me", headers=old_session).status_code == 401
    login = {"email": "target@example.com", "password": new_password}
    assert client.post("/api/guest/login", json=login).status_code == 200


def test_forgot_answers_the_same_for_unknown_addresses(
    client: TestClient, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.config import get_settings

    monkeypatch.setenv("DEMO_MODE", "0")
    get_settings.cache_clear()
    make_account(session, "known@example.com")
    known = client.post("/api/guest/password/forgot", json={"email": "known@example.com"}).json()
    unknown = client.post("/api/guest/password/forgot", json={"email": "nobody@example.com"}).json()
    assert {**known, "sent_to": ""} == {**unknown, "sent_to": ""}


def test_reset_needs_a_good_new_password(
    client: TestClient, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    make_account(session, "pw@example.com")
    code = use_inbox_code(monkeypatch)
    client.post("/api/guest/password/forgot", json={"email": "pw@example.com"})
    short = client.post(
        "/api/guest/password/reset",
        json={"email": "pw@example.com", "code": code, "new_password": "short"},
    )
    assert short.status_code == 422
