"""Fixes from the security and correctness reviews of guest accounts (2026-11-10).

Each test names the review finding it closes (docs/security.md, S30 to S40).
Every one of them failed before its fix; docs/test-report.md lists the runs.
"""

import threading

import pytest
from conftest import TEST_PASSWORD
from fastapi import FastAPI
from fastapi.testclient import TestClient
from guest_helpers import (
    account_headers,
    bearer,
    make_account,
    outbox,
    register,
    shared_event,
    sign_up,
    use_inbox_code,
    verify,
)
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_events_setup import add_guest

from app.config import get_settings
from app.events_service import accounts
from app.mail import templates
from app.mail.providers import OutgoingEmail
from app.models import EmailCode, Event, Guest, GuestAccount, Organiser

INVITED = [{"name": "Vera Victim", "email": "vera@example.com"}]


def _guest_rows(session: Session) -> list[Guest]:
    session.expire_all()
    return list(session.scalars(select(Guest).order_by(Guest.id)))


# ---------------------------------------------------------------- S30: the demo code


def test_the_demo_never_shows_the_code_of_an_invited_address(
    client: TestClient, organiser: Organiser
) -> None:
    """S30: in the demo, a shown code let anyone take over an invitation."""
    _setup, token = shared_event(client, organiser, INVITED)
    answer = register(client, token, "vera@example.com", name="Attacker")
    assert answer.status_code == 202 and "demo_code" not in answer.json()
    # Any case of the address counts as the same address.
    assert "demo_code" not in register(client, token, "VERA@example.com").json()


def test_the_demo_shows_codes_only_for_example_dot_com(
    client: TestClient, organiser: Organiser
) -> None:
    """S30: a real address in a demo deployment never gets its code on screen."""
    _setup, token = shared_event(client, organiser)
    assert "demo_code" in register(client, token, "made.up@example.com").json()
    assert "demo_code" not in register(client, token, "someone@gmail.test").json()


def test_an_account_made_with_a_shown_code_never_takes_an_invitation(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    """S30: the organiser invites the address after the code was shown on screen."""
    setup, token = shared_event(client, organiser)
    sent = register(client, token, "late.invite@example.com", name="Attacker")
    code = sent.json()["demo_code"]
    add_guest(client, setup, {"name": "Real Person", "email": "late.invite@example.com"})
    result = verify(client, "late.invite@example.com", code, sent).json()
    assert result["join"]["status"] == "joined"  # a row of its own, not the invitation
    invited = session.get(Guest, setup.guests["Real Person"])
    session.refresh(invited)
    assert invited.account_id is None and invited.name == "Real Person"
    account = session.scalars(select(GuestAccount)).one()
    assert account.email_proven is False
    joined = client.post(f"/api/j/{token}/join", headers=bearer(result["token"]), json={})
    assert joined.json()["status"] == "already_member"
    session.refresh(invited)
    assert invited.account_id is None


# ---------------------------------------------------------------- S31: the sign-up id


def test_a_code_works_only_with_the_sign_up_id_of_the_same_browser(
    client: TestClient, organiser: Organiser, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """S31: the victim signs up, an attacker signs up the same address with their
    own password; the victim types the newest code. Before: the attacker's
    password won. Now: the code works only with the attacker's sign-up id,
    which the victim's browser does not have."""
    _setup, token = shared_event(client, organiser, INVITED)
    code = use_inbox_code(monkeypatch)
    victim = register(client, token, "vera@example.com", name="Vera")
    attacker = register(client, token, "vera@example.com", name="Attacker")
    assert victim.json()["signup_id"] != attacker.json()["signup_id"]
    refused = verify(client, "vera@example.com", code, victim)
    assert refused.status_code == 404
    assert session.scalars(select(GuestAccount)).first() is None
    assert session.scalars(select(EmailCode)).one().attempts == 0  # no try used up


def test_a_made_up_sign_up_id_is_refused(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    _setup, token = shared_event(client, organiser)
    sent = register(client, token, "solo@example.com")
    body = {"email": "solo@example.com", "code": sent.json()["demo_code"], "signup_id": "x" * 43}
    assert client.post("/api/guest/verify", json=body).status_code == 404
    missing = {"email": "solo@example.com", "code": sent.json()["demo_code"]}
    assert client.post("/api/guest/verify", json=missing).status_code == 422
    assert session.scalars(select(GuestAccount)).first() is None


# ---------------------------------------------------------------- S32: timing


def test_register_hashes_a_password_for_known_addresses_too(
    client: TestClient, organiser: Organiser, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """S32: skipping scrypt for existing accounts made them answer faster."""
    _setup, token = shared_event(client, organiser)
    make_account(session, "known@example.com")
    calls: list[str] = []
    real = accounts.hash_password

    def counting(password: str) -> str:
        calls.append(password)
        return real(password)

    monkeypatch.setattr(accounts, "hash_password", counting)
    register(client, token, "known@example.com")
    register(client, token, "unknown@example.com")
    assert len(calls) == 2


# ---------------------------------------------------------------- S33: limits used up by others


def test_a_wrong_link_does_not_use_up_the_inbox_limit(
    client: TestClient, organiser: Organiser
) -> None:
    """S33: three calls with a made-up link blocked the real sign-up for an hour."""
    _setup, token = shared_event(client, organiser)
    body = {"name": "X", "email": "vic@example.com", "password": "a long password", "consent": True}
    for _ in range(3):
        assert client.post("/api/j/not-a-real-token/register", json=body).status_code == 404
    assert register(client, token, "vic@example.com").status_code == 202


def test_reset_codes_do_not_use_up_sign_up_codes(client: TestClient, organiser: Organiser) -> None:
    """S33: three "forgot password" calls blocked the sign-up of that address."""
    _setup, token = shared_event(client, organiser)
    for _ in range(3):
        sent = client.post("/api/guest/password/forgot", json={"email": "vic@example.com"})
        assert sent.status_code == 202
    assert register(client, token, "vic@example.com").status_code == 202


def test_the_app_wide_limit_counts_only_emails_really_queued(
    client: TestClient, organiser: Organiser, monkeypatch: pytest.MonkeyPatch
) -> None:
    """S33: "forgot" for addresses with no account sends nothing, so it counts nothing."""
    monkeypatch.setattr(accounts, "CODE_SENDS_PER_APP_HOUR", 1)
    _setup, token = shared_event(client, organiser)
    for n in range(3):
        sent = client.post("/api/guest/password/forgot", json={"email": f"nobody{n}@example.com"})
        assert sent.status_code == 202
    assert register(client, token, "real.one@example.com").status_code == 202
    assert register(client, token, "real.two@example.com").status_code == 429


def test_a_whole_room_on_one_network_can_sign_up(client: TestClient, organiser: Organiser) -> None:
    """S38: 21 people on one conference Wi-Fi used to get 429 from the 21st on."""
    _setup, token = shared_event(client, organiser, tables=6, per_table=4)
    answers = [register(client, token, f"delegate{n}@example.com").status_code for n in range(21)]
    assert answers == [202] * 21


# ---------------------------------------------------------------- S34: the name in emails


def test_the_code_email_does_not_repeat_the_typed_name(
    client: TestClient, organiser: Organiser, monkeypatch: pytest.MonkeyPatch
) -> None:
    """S34: the sign-up form sent any text, URLs included, to any inbox in our words.

    Read from the provider: the outbox copy is blanked once the code is sent.
    """
    sent: list[OutgoingEmail] = []

    class Inbox:
        def send(self, message: OutgoingEmail) -> str:
            sent.append(message)
            return "fake-1"

    monkeypatch.setattr(accounts, "provider_from_settings", lambda _settings: Inbox())
    monkeypatch.setenv("EMAIL_ALLOWLIST", "target@example.com")
    get_settings.cache_clear()
    _setup, token = shared_event(client, organiser)
    name = "Win a prize at https://evil.example.com/claim"
    assert register(client, token, "target@example.com", name=name).status_code == 202
    [message] = sent
    assert message.body_text.startswith("Hello,\n")
    assert "Never give this code to anyone" in message.body_text
    assert "evil.example.com" not in message.subject + message.body_text + message.body_html


# ---------------------------------------------------------------- S35: removed guests


def test_a_guest_the_organiser_removed_cannot_rejoin(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    """S35: the organiser removed a self-registered guest; they rejoined at once."""
    setup, token = shared_event(client, organiser)
    joined = sign_up(client, token, "pest@example.com")
    headers = bearer(joined["token"])
    guest_id = next(g.id for g in _guest_rows(session) if g.source == "self_registered")
    removed = client.delete(f"/api/events/{setup.eid}/guests/{guest_id}", headers=setup.headers)
    assert removed.status_code == 200
    again = client.post(f"/api/j/{token}/join", headers=headers, json={})
    assert again.status_code == 403 and again.json()["error"]["code"] == "forbidden"
    assert "removed you" in again.json()["error"]["message"]
    assert [g.token_revoked_at is not None for g in _guest_rows(session)] == [True]
    # Deleting the account still works and forgets the removed row's link to it.
    gone = client.post(
        "/api/guest/me/delete", headers=headers, json={"password": "a long guest password"}
    )
    assert gone.status_code == 200
    assert [g.account_id for g in _guest_rows(session)] == [None]


# ---------------------------------------------------------------- S36: ids reused on SQLite


def test_an_old_token_never_opens_the_next_account(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    """S36: SQLite gave a deleted account's id to the next account."""
    _setup, token = shared_event(client, organiser)
    first = sign_up(client, token, "first.one@example.com")
    old = bearer(first["token"])
    deleted = client.post(
        "/api/guest/me/delete", headers=old, json={"password": "a long guest password"}
    )
    assert deleted.status_code == 200
    sign_up(client, token, "second.one@example.com")
    assert client.get("/api/guest/me", headers=old).status_code == 401


# ---------------------------------------------------------------- S37: a new link


def test_a_sign_up_started_before_a_new_link_does_not_join(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    """S37: "Make a new link" did not stop sign-ups already started on the old one."""
    setup, token = shared_event(client, organiser)
    sent = register(client, token, "early@example.com")
    renewed = client.post(f"/api/events/{setup.eid}/share/regenerate", headers=setup.headers)
    assert renewed.status_code == 200
    result = verify(client, "early@example.com", sent.json()["demo_code"], sent)
    assert result.status_code == 201
    assert result.json()["join"] == {"status": "link_closed", "event_id": None}
    assert _guest_rows(session) == []


# ---------------------------------------------------------------- S39: failed logins


def test_wrong_passwords_from_one_network_do_not_lock_the_owner_out(
    app: FastAPI, client: TestClient, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """S39: 20 wrong passwords from anywhere locked the owner out for an hour."""
    monkeypatch.setattr(accounts, "LOGINS_PER_MINUTE", 1000)
    make_account(session, "owner@example.com")
    attacker = TestClient(app, client=("198.51.100.7", 50000))
    wrong = {"email": "owner@example.com", "password": "a wrong guess"}
    codes = [attacker.post("/api/guest/login", json=wrong).status_code for _ in range(21)]
    assert codes == [401] * 20 + [429]
    right = {"email": "owner@example.com", "password": TEST_PASSWORD}
    assert client.post("/api/guest/login", json=right).status_code == 200  # the owner, at home


def test_wrong_passwords_from_many_networks_still_stop(
    app: FastAPI, client: TestClient, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(accounts, "LOGINS_PER_MINUTE", 1000)
    monkeypatch.setattr(accounts, "FAILED_LOGINS_PER_ACCOUNT_HOUR", 3)
    make_account(session, "owner@example.com")
    wrong = {"email": "owner@example.com", "password": "a wrong guess"}
    for n in range(3):
        guesser = TestClient(app, client=(f"198.51.100.{n + 10}", 50000))
        assert guesser.post("/api/guest/login", json=wrong).status_code == 401
    right = {"email": "owner@example.com", "password": TEST_PASSWORD}
    assert client.post("/api/guest/login", json=right).status_code == 429


# ---------------------------------------------------------------- S40: parallel code tries


def test_a_right_code_after_the_last_counted_try_is_refused(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    """S40: parallel requests could all compare before any of them counted.

    Simulated here: five tries are already counted (as if five parallel
    requests just ran). The right code must not get through now.
    """
    _setup, token = shared_event(client, organiser)
    sent = register(client, token, "racer@example.com")
    row = session.scalars(select(EmailCode)).one()
    row.attempts = accounts.MAX_CODE_TRIES
    session.commit()
    late = verify(client, "racer@example.com", sent.json()["demo_code"], sent)
    assert late.status_code == 422
    assert session.scalars(select(GuestAccount)).first() is None


def test_parallel_wrong_codes_get_five_tries_between_them(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    _setup, token = shared_event(client, organiser)
    sent = register(client, token, "many@example.com")
    wrong = f"{(int(sent.json()['demo_code']) + 1) % 10**6:06d}"
    start = threading.Barrier(8)
    messages: list[str] = []

    def guess() -> None:
        start.wait()
        answer = verify(client, "many@example.com", wrong, sent)
        messages.append(answer.json()["error"]["message"])

    threads = [threading.Thread(target=guess) for _ in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    counted = [m for m in messages if "left" in m]
    assert len(counted) <= accounts.MAX_CODE_TRIES - 1
    assert session.scalars(select(EmailCode)).first() is None  # used up and gone


# ---------------------------------------------------------------- capacity


def test_coming_back_after_no_respects_the_seats(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    """Correctness review 3: "no", someone joins, then "yes" made 9 guests for 8 seats."""
    setup, token = shared_event(client, organiser, tables=2, per_table=4)
    tokens = [sign_up(client, token, f"p{n}@example.com")["token"] for n in range(8)]
    first = f"/api/guest/events/{setup.eid}/rsvp"
    assert client.post(first, headers=bearer(tokens[0]), json={"rsvp": "no"}).status_code == 200
    assert sign_up(client, token, "ninth@example.com")["join"]["status"] == "joined"
    back = client.post(first, headers=bearer(tokens[0]), json={"rsvp": "yes"})
    assert back.status_code == 409 and back.json()["error"]["code"] == "event_full"
    counts = client.get(f"/api/events/{setup.eid}/share", headers=setup.headers).json()
    assert (counts["guests"], counts["capacity"]) == (8, 8)


def test_coming_back_respects_the_cap(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    setup, token = shared_event(client, organiser)
    client.patch(f"/api/events/{setup.eid}/share", headers=setup.headers, json={"cap": 1})
    first = bearer(sign_up(client, token, "one@example.com")["token"])
    rsvp = f"/api/guest/events/{setup.eid}/rsvp"
    client.post(rsvp, headers=first, json={"rsvp": "no"})
    assert sign_up(client, token, "two@example.com")["join"]["status"] == "joined"
    assert client.post(rsvp, headers=first, json={"rsvp": "yes"}).status_code == 409


def test_an_invited_guest_can_still_say_yes_again_on_a_list_with_room(
    client: TestClient, organiser: Organiser
) -> None:
    """The check must not get in the way when there is room."""
    setup, _token = shared_event(client, organiser, [{"name": "Ana"}])
    ana = setup.tokens["Ana"]
    assert client.post(f"/api/a/{ana}/rsvp", json={"rsvp": "no"}).status_code == 200
    assert client.post(f"/api/a/{ana}/rsvp", json={"rsvp": "yes"}).status_code == 200


def test_places_left_leaves_out_seats_reserved_for_a_tag(
    client: TestClient, organiser: Organiser
) -> None:
    """Correctness review 4: reserved seats counted as places newcomers could take."""
    extras = {(0, s): {"reserved_tag": "vip"} for s in range(4)}
    setup, token = shared_event(client, organiser, extras=extras)
    view = client.get(f"/api/j/{token}").json()
    assert view["join"]["places_left"] == 4
    add_guest(client, setup, {"name": "A VIP", "reserved_tag": "vip"})
    add_guest(client, setup, {"name": "Plain guest"})
    assert client.get(f"/api/j/{token}").json()["join"]["places_left"] == 3


def test_an_invited_guest_can_make_an_account_when_the_event_is_full(
    client: TestClient, organiser: Organiser, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Correctness review 5: a full event refused even the people invited to it."""
    guests = [{"name": f"Guest {n}", "email": f"inv{n}@example.com"} for n in range(8)]
    _setup, token = shared_event(client, organiser, guests)
    code = use_inbox_code(monkeypatch)
    result = sign_up(client, token, "inv0@example.com", code=code)
    assert result["join"]["status"] == "linked"


# ---------------------------------------------------------------- emails


def test_the_account_exists_email_says_how_to_get_back_to_the_event(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    """Correctness review 7: the email led to an empty "My events" page."""
    _setup, token = shared_event(client, organiser)
    make_account(session, "back@example.com")
    register(client, token, "back@example.com")
    [row] = outbox(session, "account_exists")
    session.refresh(row)
    assert "I already have an account" in row.body_text


def test_the_picture_keeps_its_real_width_in_the_email() -> None:
    """Correctness review 9: a tall room's narrow picture was stretched to 560."""
    facts = templates.AccountSeat(
        "Kai",
        "Party",
        "Fri",
        "Hall",
        "1",
        "T1",
        None,
        "http://localhost:5173/my/x",
        None,
        False,
        240,
    )
    html = templates.account_seat_email(facts).body_html
    assert 'width="240"' in html and "max-width:240px" in html
    assert 'width="560"' not in html


def test_the_mailer_passes_the_png_width(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    from app.models import Venue

    setup, token = shared_event(client, organiser)
    event = session.scalars(select(Event).where(Event.public_id == setup.eid)).one()
    venue = session.get(Venue, event.venue_id)
    venue.width, venue.height = 200.0, 1000.0  # a tall, narrow room
    session.commit()
    headers = bearer(sign_up(client, token, "tall@example.com")["token"])
    base = f"/api/guest/events/{setup.eid}"
    seat = setup.seats[0][0]
    client.post(f"{base}/hold", headers=headers, json={"seat_id": seat})
    assert (
        client.post(f"{base}/confirm", headers=headers, json={"seat_id": seat}).status_code == 200
    )
    [row] = outbox(session, "seat_confirmed")
    assert 'width="240"' in row.body_html


def test_an_account_holder_left_by_a_shared_account_keeps_working(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    """A guard for S35: the block row does not stop the account's other events."""
    one, token_one = shared_event(client, organiser)
    _two, token_two = shared_event(client, organiser)
    account = make_account(session, "two.events@example.com")
    headers = account_headers(account)
    assert client.post(f"/api/j/{token_one}/join", headers=headers, json={}).status_code == 200
    guest_id = next(g.id for g in _guest_rows(session) if g.event_id is not None)
    client.delete(f"/api/events/{one.eid}/guests/{guest_id}", headers=one.headers)
    assert client.post(f"/api/j/{token_two}/join", headers=headers, json={}).status_code == 200
    events = client.get("/api/guest/me", headers=headers).json()["events"]
    assert len(events) == 1
