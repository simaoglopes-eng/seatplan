"""Seat emails for account holders (with the picture) and everything else left as today."""

import base64
import threading
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from guest_helpers import bearer, outbox, shared_event, sign_up
from sqlalchemy.orm import Session
from test_events_setup import choose
from test_seat_picture import read_png

from app import db
from app.config import get_settings
from app.events_service.mailer import forget_guest_emails
from app.mail import templates
from app.mail.outbox import enqueue, process_due, scrub_expired, send_now
from app.mail.providers import OutgoingEmail, ResendProvider
from app.models import EmailOutbox, Event, Organiser, utc_now

INVITED = [{"name": "Ana Silva", "email": "ana.silva@example.com"}]


def _account_holder(client: TestClient, organiser: Organiser) -> tuple:
    setup, token = shared_event(client, organiser, INVITED)
    joined = sign_up(client, token, "kai.lobo@example.com", name="Kai Lobo")
    return setup, bearer(joined["token"])


def _confirm(client: TestClient, eid: str, headers: dict, seat: int) -> None:
    base = f"/api/guest/events/{eid}"
    assert client.post(f"{base}/hold", headers=headers, json={"seat_id": seat}).status_code == 200
    assert (
        client.post(f"{base}/confirm", headers=headers, json={"seat_id": seat}).status_code == 200
    )


def test_an_account_holder_gets_the_picture_email(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    setup, headers = _account_holder(client, organiser)
    _confirm(client, setup.eid, headers, setup.seats[1][2])
    [row] = outbox(session, "seat_confirmed")
    assert row.to_email == "kai.lobo@example.com"
    assert row.subject == "Your seat for Test party: seat 3 at table T2"
    assert row.image_png is not None
    width, _height, _palette, _rows = read_png(base64.b64decode(row.image_png))
    assert width == 640
    link = f"{get_settings().public_base_url}/my/{setup.eid}"
    assert 'src="cid:seatmap"' in row.body_html and f'href="{link}"' in row.body_html
    assert "marked with a large black dot inside a ring and the label YOU" in row.body_html
    assert "Your seat: seat 3 at table T2" in row.body_text and link in row.body_text
    assert "/e/" not in row.body_text + row.body_html and "/a/" not in row.body_text
    assert row.ics is not None and "BEGIN:VCALENDAR" in row.ics
    [reminder] = outbox(session, "event_reminder")
    assert link in reminder.body_text


def test_an_organiser_move_sends_the_changed_picture_email(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    setup, headers = _account_holder(client, organiser)
    _confirm(client, setup.eid, headers, setup.seats[0][0])
    guests = client.get(f"/api/events/{setup.eid}/guests", headers=setup.headers).json()
    kai = next(g for g in guests if g["has_account"])
    moved = client.put(
        f"/api/events/{setup.eid}/assignments/{kai['id']}",
        headers=setup.headers,
        json={"seat_id": setup.seats[1][0]},
    )
    assert moved.status_code == 200
    [row] = outbox(session, "seat_changed")
    assert row.image_png is not None and "The organiser moved you to a new seat." in row.body_text
    assert "Before: seat 1 at table T1. Now: seat 1 at table T2." in row.body_text
    assert row.subject == "Your seat for Test party has changed: now seat 1 at table T2"


def test_personal_link_guests_get_todays_emails(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    setup, _token = shared_event(client, organiser, INVITED)
    choose(client, setup, "Ana Silva", setup.seats[0][0])
    [row] = outbox(session, "seat_confirmed")
    event = session.query(Event).filter(Event.public_id == setup.eid).one()
    link = f"{get_settings().public_base_url}/e/{setup.tokens['Ana Silva']}"
    expected = templates.event_seat_confirmation(
        "Ana Silva",
        "Test party",
        "Hall",
        templates.format_when(event.starts_at, "Europe/Lisbon"),
        "1",
        "T1",
        link,
    )
    assert (row.subject, row.body_text, row.body_html) == tuple(expected)
    assert row.image_png is None


def test_applying_a_plan_emails_only_the_account_holder(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    """A plan is the organiser moving people: account holders get the picture email,
    guests with only a personal link get none (unchanged)."""
    setup, _headers = _account_holder(client, organiser)
    scenario = client.post(
        f"/api/events/{setup.eid}/optimise/autofill", headers=setup.headers, json={}
    )
    assert scenario.status_code == 200
    applied = client.post(
        f"/api/events/{setup.eid}/scenarios/{scenario.json()['id']}/apply", headers=setup.headers
    )
    assert applied.status_code == 200 and applied.json()["applied"] >= 2
    guests = client.get(f"/api/events/{setup.eid}/guests", headers=setup.headers).json()
    kai = next(g for g in guests if g["has_account"])
    ana = next(g for g in guests if not g["has_account"])
    assert kai["seat_id"] is not None and ana["seat_id"] is not None  # both were seated
    rows = [row for row in outbox(session) if row.kind.startswith("seat_")]
    assert [(row.kind, row.to_email) for row in rows] == [
        ("seat_confirmed", "kai.lobo@example.com")
    ]
    assert rows[0].image_png and "cid:seatmap" in rows[0].body_html


def test_resend_sends_the_picture_inline() -> None:
    message = OutgoingEmail(
        "kai@example.com", "Hi", "text", "<p>x</p>", "BEGIN:VCALENDAR", "key-1", image_png="UE5H"
    )
    payload = ResendProvider("re_test_not_real", "SeatPlan <noreply@example.com>")._payload(message)
    assert payload["attachments"] == [
        {"filename": "invite.ics", "content": base64.b64encode(b"BEGIN:VCALENDAR").decode()},
        {"filename": "seat-map.png", "content": "UE5H", "content_id": "seatmap"},
    ]


def test_retention_and_erasure_drop_the_picture(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    setup, headers = _account_holder(client, organiser)
    _confirm(client, setup.eid, headers, setup.seats[0][0])
    [row] = outbox(session, "seat_confirmed")
    row.status, row.sent_at = "sent", utc_now() - timedelta(days=31)
    session.commit()
    assert scrub_expired(session, utc_now()) >= 1
    assert outbox(session, "seat_confirmed")[0].image_png is None
    _confirm(client, setup.eid, headers, setup.seats[0][1])
    [changed] = outbox(session, "seat_changed")
    assert changed.image_png is not None
    event = session.query(Event).filter(Event.public_id == setup.eid).one()
    guest_id = int(changed.idempotency_key.split(":")[1])
    forget_guest_emails(session, event, guest_id)
    session.commit()
    assert outbox(session, "seat_changed")[0].image_png is None


class CountingProvider:
    def __init__(self) -> None:
        self.sent: list[str] = []
        self.lock = threading.Lock()

    def send(self, message: OutgoingEmail) -> str:
        with self.lock:
            self.sent.append(message.idempotency_key)
        return "counted"


def test_send_now_and_the_cron_send_a_code_once(
    app: object, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("EMAIL_ALLOWLIST", "code.once@example.com")
    get_settings.cache_clear()
    with db.new_session() as setup_session:
        enqueue(
            setup_session,
            idempotency_key="account-code:1",
            to_email="code.once@example.com",
            kind="account_code",
            subject="Your SeatPlan code",
            body_text="Your code is 123456",
            body_html="<p>Your code is 123456</p>",
        )
        setup_session.commit()
    provider = CountingProvider()
    start = threading.Barrier(2)

    def by_hand() -> None:
        with db.new_session() as own:
            start.wait()
            send_now(own, provider, "account-code:1", utc_now())

    def by_cron() -> None:
        with db.new_session() as own:
            start.wait()
            process_due(own, provider, utc_now())

    threads = [threading.Thread(target=by_hand), threading.Thread(target=by_cron)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert provider.sent == ["account-code:1"]
    with db.new_session() as check:
        row = check.query(EmailOutbox).one()
        assert row.status == "sent" and row.body_text == row.body_html == "[code removed]"


def test_email_log_says_which_rows_have_a_picture(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    setup, headers = _account_holder(client, organiser)
    _confirm(client, setup.eid, headers, setup.seats[0][0])
    log = client.get("/api/emails/log", headers=setup.headers).json()
    pictures = {item["kind"]: item["has_picture"] for item in log}
    assert pictures["seat_confirmed"] is True and pictures["event_reminder"] is False
    assert all("image" not in key for item in log for key in item)


def test_the_cron_clears_expired_codes(
    client: TestClient, organiser: Organiser, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    from guest_helpers import register

    from app.models import EmailCode

    monkeypatch.setenv("CRON_SECRET", "a-cron-secret-for-tests")
    get_settings.cache_clear()
    _setup, token = shared_event(client, organiser)
    register(client, token, "slow@example.com")
    row = session.query(EmailCode).one()
    row.expires_at = utc_now() - timedelta(minutes=1)
    session.commit()
    ran = client.post(
        "/api/internal/email/process", headers={"X-Cron-Secret": "a-cron-secret-for-tests"}
    )
    assert ran.status_code == 200
    session.expire_all()
    assert session.query(EmailCode).count() == 0
