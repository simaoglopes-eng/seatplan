"""process_due(): idempotency, allowlist, retries with backoff, give-up, concurrency."""

import threading
import time
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import db
from app.config import get_settings
from app.mail.outbox import MAX_ATTEMPTS, backoff_delay, enqueue, process_due
from app.mail.providers import OutgoingEmail, ProviderError
from app.models import EmailOutbox

NOW = datetime(2027, 3, 14, 12, 0, tzinfo=UTC)
ALLOWED = "ana.silva@example.com"


class FakeInbox:
    """A provider that keeps sent emails in a list: the test inbox.

    `failures` makes the next N sends raise, to imitate a provider outage.
    `delay_s` slows each send so two threads really overlap.
    """

    def __init__(self, failures: int = 0, delay_s: float = 0.0) -> None:
        self.sent: list[OutgoingEmail] = []
        self.failures = failures
        self.delay_s = delay_s
        self._lock = threading.Lock()

    def send(self, message: OutgoingEmail) -> str:
        time.sleep(self.delay_s)
        with self._lock:
            if self.failures > 0:
                self.failures -= 1
                raise ProviderError("provider is down")
            self.sent.append(message)
            return f"fake-{len(self.sent)}"


@pytest.fixture
def allowlist(app: FastAPI, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EMAIL_ALLOWLIST", f"{ALLOWED}, Bruno.Costa@example.com")
    get_settings.cache_clear()


def _queue(session: Session, key: str, to_email: str = ALLOWED) -> None:
    enqueue(
        session,
        idempotency_key=key,
        to_email=to_email,
        kind="booking_confirmed",
        subject="Booking confirmed",
        body_text="Hello",
        body_html="<p>Hello</p>",
        send_after=NOW - timedelta(minutes=1),
    )
    session.commit()


def _row(session: Session, key: str) -> EmailOutbox:
    row = session.scalars(
        select(EmailOutbox)
        .where(EmailOutbox.idempotency_key == key)
        .execution_options(populate_existing=True)
    ).one()
    return row


def test_same_key_twice_gives_one_row_and_one_send(session: Session, allowlist: None) -> None:
    inbox = FakeInbox()
    _queue(session, "booking-confirmed-abc")
    _queue(session, "booking-confirmed-abc")
    process_due(session, inbox, NOW)
    process_due(session, inbox, NOW + timedelta(hours=1))
    assert len(session.scalars(select(EmailOutbox)).all()) == 1
    assert len(inbox.sent) == 1
    row = _row(session, "booking-confirmed-abc")
    assert row.status == "sent"
    assert row.provider_message_id == "fake-1"
    assert row.sent_at == NOW


def test_address_not_on_allowlist_is_skipped_never_sent(session: Session, allowlist: None) -> None:
    inbox = FakeInbox()
    _queue(session, "k-stranger", to_email="stranger@example.com")
    _queue(session, "k-bruno", to_email="bruno.costa@example.com")  # case differs from env
    report = process_due(session, inbox, NOW)
    assert [m.to_email for m in inbox.sent] == ["bruno.costa@example.com"]
    assert _row(session, "k-stranger").status == "skipped"
    assert (report.sent, report.skipped) == (1, 1)


def test_empty_allowlist_sends_nothing(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("EMAIL_ALLOWLIST", raising=False)
    get_settings.cache_clear()
    inbox = FakeInbox()
    _queue(session, "k1")
    process_due(session, inbox, NOW)
    assert inbox.sent == []
    assert _row(session, "k1").status == "skipped"


def test_not_yet_due_rows_wait(session: Session, allowlist: None) -> None:
    inbox = FakeInbox()
    enqueue(
        session,
        idempotency_key="reminder",
        to_email=ALLOWED,
        kind="booking_reminder",
        subject="Reminder",
        body_text="t",
        body_html="h",
        send_after=NOW + timedelta(hours=2),
    )
    session.commit()
    process_due(session, inbox, NOW)
    assert inbox.sent == []
    process_due(session, inbox, NOW + timedelta(hours=2))
    assert len(inbox.sent) == 1


def test_backoff_doubles() -> None:
    assert [backoff_delay(n) for n in (1, 2, 3, 4)] == [
        timedelta(minutes=5),
        timedelta(minutes=10),
        timedelta(minutes=20),
        timedelta(minutes=40),
    ]


def test_failure_schedules_retry_with_backoff(session: Session, allowlist: None) -> None:
    inbox = FakeInbox(failures=2)
    _queue(session, "k1")
    report = process_due(session, inbox, NOW)
    row = _row(session, "k1")
    assert (report.retrying, row.status, row.attempts) == (1, "queued", 1)
    assert row.next_attempt_at == NOW + timedelta(minutes=5)
    assert "provider is down" in (row.last_error or "")
    # Too early: nothing happens.
    process_due(session, inbox, NOW + timedelta(minutes=4))
    assert _row(session, "k1").attempts == 1
    second = NOW + timedelta(minutes=5)
    process_due(session, inbox, second)
    row = _row(session, "k1")
    assert (row.attempts, row.next_attempt_at) == (2, second + timedelta(minutes=10))
    process_due(session, inbox, second + timedelta(minutes=10))
    row = _row(session, "k1")
    assert (row.status, row.attempts, len(inbox.sent)) == ("sent", 2, 1)


def test_gives_up_after_five_attempts(session: Session, allowlist: None) -> None:
    inbox = FakeInbox(failures=100)
    _queue(session, "k1")
    moment = NOW
    for _ in range(MAX_ATTEMPTS):
        process_due(session, inbox, moment)
        moment += timedelta(days=1)
    row = _row(session, "k1")
    assert (row.status, row.attempts) == ("failed", 5)
    # A failed row is never picked again.
    inbox.failures = 0
    report = process_due(session, inbox, moment + timedelta(days=30))
    assert inbox.sent == [] and report.sent == 0


def test_two_processors_at_once_send_each_email_once(app: FastAPI, allowlist: None) -> None:
    with db.new_session() as setup:
        for number in range(30):
            _queue(setup, f"k{number}")
    inbox = FakeInbox(delay_s=0.01)
    start = threading.Barrier(2)
    reports = []

    def run() -> None:
        with db.new_session() as own_session:
            start.wait()
            reports.append(process_due(own_session, inbox, NOW, batch=50))

    threads = [threading.Thread(target=run) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    keys = [message.idempotency_key for message in inbox.sent]
    assert len(keys) == 30
    assert len(set(keys)) == 30
    assert sum(report.sent for report in reports) == 30
    with db.new_session() as check:
        statuses = set(check.scalars(select(EmailOutbox.status)))
    assert statuses == {"sent"}


def test_crashed_claim_is_taken_again_after_the_lease(session: Session, allowlist: None) -> None:
    _queue(session, "k1")
    row = _row(session, "k1")
    # Imitate a processor that claimed the row and then died before sending.
    row.status = "sending"
    row.next_attempt_at = NOW + timedelta(minutes=10)
    session.commit()
    inbox = FakeInbox()
    process_due(session, inbox, NOW + timedelta(minutes=5))
    assert inbox.sent == []
    process_due(session, inbox, NOW + timedelta(minutes=10))
    assert len(inbox.sent) == 1
