"""Finding S9: no working personal link stays in the outbox once it is of no use.

Queued rows keep the link (the email must still work when it is sent or
retried); finished rows lose it; old finished rows lose their words entirely;
the organiser email log never shows a raw link.
"""

from datetime import UTC, datetime, timedelta

import pytest
from conftest import auth_header
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_events_setup import choose, make_event
from test_mail_outbox import FakeInbox
from test_restaurant_helpers import book, future_day, hold, make_restaurant

from app.config import get_settings
from app.mail.ics import build_invite
from app.mail.outbox import (
    LINK_REMOVED,
    MAX_ATTEMPTS,
    RETENTION_DAYS,
    enqueue,
    process_due,
    redact_links,
)
from app.mail.providers import OutgoingEmail, ProviderError
from app.mail.reminders import sync_event_reminder
from app.models import Base, Booking, EmailOutbox, Event, Guest, Organiser
from app.restaurant_service.emails import drop_reminder

NOW = datetime(2027, 3, 14, 12, 0, tzinfo=UTC)
ALLOWED = "ana.silva@example.com"
SECRET = "cron-secret-for-tests-only"
# Same length and alphabet as security.new_token(): 43 url-safe characters.
# Plainly fake and low in entropy, so a secret scanner does not take it for one.
TOKEN = "s9fake-s9fake-s9fake-s9fake-s9fake-s9fake-s"
LINK = f"https://seatplan.example.com/b/{TOKEN}"


@pytest.fixture
def env(app: FastAPI, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EMAIL_ALLOWLIST", ALLOWED)
    monkeypatch.setenv("CRON_SECRET", SECRET)
    monkeypatch.setenv("EMAIL_PROVIDER", "console")
    get_settings.cache_clear()


def _queue(session: Session, key: str, to_email: str = ALLOWED) -> None:
    """A row whose words and invite all carry the raw link, as real ones do."""
    enqueue(
        session,
        idempotency_key=key,
        to_email=to_email,
        kind="booking_confirmed",
        subject="Booking confirmed",
        body_text=f"Manage your booking: {LINK}",
        body_html=f'<a href="{LINK}">Manage</a> or copy {LINK}',
        ics=f"BEGIN:VCALENDAR\r\nDESCRIPTION:{LINK}\r\nEND:VCALENDAR\r\n",
        send_after=NOW - timedelta(minutes=1),
    )
    session.commit()


def _row(session: Session, key: str) -> EmailOutbox:
    query = select(EmailOutbox).where(EmailOutbox.idempotency_key == key)
    return session.scalars(query.execution_options(populate_existing=True)).one()


def _stored(row: EmailOutbox) -> str:
    """Every stored text column of a row, joined, to search for the token."""
    parts = (row.subject, row.body_text, row.body_html, row.ics, row.last_error, row.to_email)
    return " ".join(part or "" for part in parts)


def test_redact_links_handles_every_personal_link_shape() -> None:
    text = f"a {LINK} b http://localhost:5173/e/{TOKEN}. c /a/{TOKEN}"
    assert TOKEN not in redact_links(text)
    assert redact_links(text).count(LINK_REMOVED) == 3
    # Restaurant pages are public, not personal: they stay.
    public = "https://seatplan.example.com/r/abc123?date=2027-03-14"
    assert redact_links(public) == public


def test_sent_row_keeps_log_fields_but_no_link(session: Session, env: None) -> None:
    inbox = FakeInbox()
    _queue(session, "k-sent")
    process_due(session, inbox, NOW)
    assert TOKEN in inbox.sent[0].body_text  # the email itself had the link
    row = _row(session, "k-sent")
    assert TOKEN not in _stored(row)
    assert LINK_REMOVED in row.body_text and LINK_REMOVED in (row.ics or "")
    assert (row.status, row.to_email, row.subject) == ("sent", ALLOWED, "Booking confirmed")
    assert row.sent_at == NOW
    assert row.idempotency_key == "k-sent"


def test_skipped_row_loses_the_link(session: Session, env: None) -> None:
    _queue(session, "k-stranger", to_email="stranger@example.com")
    process_due(session, FakeInbox(), NOW)
    row = _row(session, "k-stranger")
    assert row.status == "skipped"
    assert TOKEN not in _stored(row)


def test_retry_keeps_the_link_until_the_email_goes(session: Session, env: None) -> None:
    inbox = FakeInbox(failures=1)
    _queue(session, "k-retry")
    process_due(session, inbox, NOW)
    row = _row(session, "k-retry")
    assert row.status == "queued" and TOKEN in row.body_text
    process_due(session, inbox, NOW + timedelta(hours=1))
    assert TOKEN in inbox.sent[0].body_text and TOKEN in (inbox.sent[0].ics or "")
    assert inbox.sent[0].idempotency_key == "k-retry"
    assert TOKEN not in _stored(_row(session, "k-retry"))


def test_failed_for_good_loses_the_link(session: Session, env: None) -> None:
    inbox = FakeInbox(failures=MAX_ATTEMPTS)
    _queue(session, "k-fail")
    moment = NOW
    for _ in range(MAX_ATTEMPTS):
        process_due(session, inbox, moment)
        moment += timedelta(hours=2)
    row = _row(session, "k-fail")
    assert row.status == "failed" and row.attempts == MAX_ATTEMPTS
    assert TOKEN not in _stored(row)


def _cron(client: TestClient) -> None:
    response = client.post("/api/internal/email/process", headers={"X-Cron-Secret": SECRET})
    assert response.status_code == 200, response.text


def _finished_row(session: Session, key: str, sent_at: datetime) -> None:
    session.add(
        EmailOutbox(
            idempotency_key=key,
            to_email=ALLOWED,
            kind="booking_confirmed",
            subject="Booking confirmed",
            body_text=f"Manage: {LINK}",
            body_html=f"<p>{LINK}</p>",
            ics="BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n",
            status="sent",
            attempts=0,
            next_attempt_at=sent_at,
            sent_at=sent_at,
        )
    )
    session.commit()


def test_cron_blanks_finished_rows_past_retention(
    client: TestClient, session: Session, env: None
) -> None:
    now = datetime.now(UTC)
    _finished_row(session, "old", now - timedelta(days=RETENTION_DAYS + 1))
    _finished_row(session, "recent", now - timedelta(days=RETENTION_DAYS - 1))
    enqueue(
        session,
        idempotency_key="old-but-queued",
        to_email="stranger@example.com",
        kind="booking_reminder",
        subject="Reminder",
        body_text=f"Manage: {LINK}",
        body_html=f"<p>{LINK}</p>",
        send_after=now + timedelta(days=1),
    )
    session.commit()
    _cron(client)
    old = _row(session, "old")
    assert (old.body_text, old.body_html, old.ics) == ("", "", None)
    assert (old.subject, old.to_email, old.status) == ("Booking confirmed", ALLOWED, "sent")
    assert _row(session, "recent").body_text != ""
    # Not finished yet: the reminder must still carry a working link.
    assert TOKEN in _row(session, "old-but-queued").body_text


def test_email_log_never_shows_a_raw_link(
    client: TestClient, session: Session, organiser: Organiser, env: None
) -> None:
    _queue(session, "k-log")
    row = _row(session, "k-log")
    row.subject = f"Your link {LINK}"
    row.last_error = f"HTTPStatusError: 422 body mentions {LINK}"
    session.commit()
    response = client.get("/api/emails/log", headers=auth_header(organiser))
    assert response.status_code == 200
    assert TOKEN not in response.text
    assert response.json()[0]["status"] == "queued"


def test_cancelled_reminders_drop_their_words(session: Session, env: None) -> None:
    booking = Booking(public_id="pubS9booking")
    _queue(session, "booking-reminder-pubS9booking-0")
    drop_reminder(session, booking)
    session.commit()
    row = _row(session, "booking-reminder-pubS9booking-0")
    assert row.status == "skipped" and TOKEN not in _stored(row)

    # venue_id 0 matches no venue; the reminder then falls back to UTC.
    event = Event(public_id="evS9", venue_id=0, starts_at=NOW + timedelta(days=3))
    guest = Guest(id=7, email=ALLOWED, name="Ana Silva")
    sync_event_reminder(session, event=event, guest=guest, seat_label="5 at table 3", link=LINK)
    session.commit()
    key = "event-reminder-evS9-7"
    assert TOKEN in _row(session, key).body_text
    sync_event_reminder(session, event=event, guest=guest, seat_label=None, link=LINK)
    session.commit()
    row = _row(session, key)
    assert row.status == "skipped" and TOKEN not in _stored(row)


def test_real_booking_confirmation_loses_its_manage_token(
    client: TestClient, session: Session, organiser: Organiser, env: None
) -> None:
    place = make_restaurant(session, organiser)
    held = hold(client, place, future_day(), "19:00", 2)
    booked = book(client, place, held.json()["hold_id"], 2)
    assert booked.status_code == 201, booked.text
    token = booked.json()["manage_token"]
    _cron(client)
    rows = {row.kind: row for row in session.scalars(select(EmailOutbox))}
    confirmation = rows["booking_confirmed"]
    assert confirmation.status == "skipped"  # diner not on the allowlist
    assert token not in _stored(confirmation)
    # The reminder waits a week; it must keep the link it will deliver.
    assert rows["booking_reminder"].status == "queued"
    assert token in rows["booking_reminder"].body_text


# ---------------------------------------------------------------- attacks (verifier, 2026-11-10)


class LeakyProvider:
    """A provider whose error text quotes the link, as a bounce message might."""

    def send(self, message: OutgoingEmail) -> str:
        raise ProviderError(f"422: refused {LINK}")


def test_folded_invites_and_stored_errors_lose_the_link(session: Session, env: None) -> None:
    # A real invite folds long lines at 75 octets, which can cut a link in two.
    invite = build_invite(
        uid="booking-s9@seatplan.example.com",
        start=NOW + timedelta(days=2),
        end=NOW + timedelta(days=2, hours=2),
        summary="Table at Casa Teste",
        location="Casa Teste",
        description=f"Manage your booking at {LINK}",
        organizer_name="SeatPlan",
        organizer_email="noreply@example.com",
        attendee_email=ALLOWED,
    )
    assert TOKEN not in invite  # folded: the token is split across two lines
    enqueue(
        session,
        idempotency_key="k-folded",
        to_email=ALLOWED,
        kind="booking_confirmed",
        subject="Booking confirmed",
        body_text=LINK,
        body_html=LINK,
        ics=invite,
        send_after=NOW - timedelta(minutes=1),
    )
    session.commit()
    moment = NOW
    for _ in range(MAX_ATTEMPTS):
        process_due(session, LeakyProvider(), moment)
        moment += timedelta(hours=2)
    row = _row(session, "k-folded")
    assert row.status == "failed"
    unfolded = (row.ics or "").replace("\r\n ", "")
    assert TOKEN[:20] not in unfolded and TOKEN[-20:] not in unfolded
    assert TOKEN not in (row.last_error or "")


def test_email_log_is_closed_to_staff_and_strangers(
    client: TestClient, session: Session, staff: Organiser, env: None
) -> None:
    _queue(session, "k-closed")
    assert client.get("/api/emails/log").status_code == 401
    assert client.get("/api/emails/log", headers=auth_header(staff)).status_code == 403
    # A personal link is not a session.
    bearer = {"Authorization": f"Bearer {TOKEN}"}
    assert client.get("/api/emails/log", headers=bearer).status_code == 401


def _rows_holding(session: Session, secret: str) -> list[tuple[str, str]]:
    """(table, status) of every row in the whole database with `secret` in any text."""
    found = []
    for table in Base.metadata.sorted_tables:
        for row in session.execute(select(table)).mappings():
            texts = [value for value in row.values() if isinstance(value, str)]
            if any(secret in text for text in texts):
                found.append((table.name, str(row.get("status", ""))))
    return found


def test_no_raw_manage_token_anywhere_once_a_booking_is_cancelled(
    client: TestClient, session: Session, organiser: Organiser, env: None
) -> None:
    place = make_restaurant(session, organiser)
    held = hold(client, place, future_day(), "19:00", 2)
    token = book(client, place, held.json()["hold_id"], 2).json()["manage_token"]
    assert client.patch(f"/api/b/{token}", json={"time": "20:00"}).status_code == 200
    _cron(client)
    session.expire_all()
    # Only the reminder still waiting to go out may hold it.
    assert _rows_holding(session, token) == [("email_outbox", "queued")]
    assert client.delete(f"/api/b/{token}").status_code == 200
    _cron(client)
    session.expire_all()
    assert _rows_holding(session, token) == []


def test_attendee_token_left_only_in_the_waiting_reminder(
    client: TestClient, session: Session, organiser: Organiser, env: None
) -> None:
    setup = make_event(client, organiser, [{"name": "Ana Silva", "email": ALLOWED}])
    choose(client, setup, "Ana Silva", setup.seats[0][0])
    _cron(client)
    session.expire_all()
    token = setup.tokens["Ana Silva"]
    assert ("email_outbox", "sent") not in _rows_holding(session, token)
    assert _rows_holding(session, token) == [("email_outbox", "queued")]
    assert client.delete(f"/api/a/{token}/seat").status_code == 200
    _cron(client)
    session.expire_all()
    assert _rows_holding(session, token) == []
