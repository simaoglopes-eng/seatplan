"""The email outbox: emails are written to a table first and sent later.

Writing first means a booking never fails because the email provider is slow,
and a retry can never send the same email twice: each email has an
idempotency_key (for example "booking-confirmed-<booking public id>") and the
table refuses a second row with the same key.

Life of one row (the "status" column):

    queued --claim--> sending --ok--------------> sent
                         |----not on allowlist--> skipped
                         |----error, tries left-> queued (later, see backoff_delay)
                         |----error, 5th try----> failed
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app import db
from app.config import get_settings
from app.mail.providers import OutgoingEmail, Provider
from app.models import EmailOutbox, utc_now

MAX_ATTEMPTS = 5
FIRST_RETRY_DELAY = timedelta(minutes=5)
# How long a claimed row belongs to one processor. If that processor crashes
# mid-send, another one may take the row again after this time.
CLAIM_LEASE = timedelta(minutes=10)
MAX_ERROR_LENGTH = 500


def enqueue(
    session: Session,
    *,
    idempotency_key: str,
    to_email: str,
    kind: str,
    subject: str,
    body_text: str,
    body_html: str,
    ics: str | None = None,
    send_after: datetime | None = None,
) -> None:
    """Queue one email, or do nothing if this idempotency_key is already queued.

    Does not commit: the email is saved together with the change that caused
    it, so a rolled-back booking never leaves a confirmation email behind.
    """
    values = {
        "idempotency_key": idempotency_key,
        "to_email": to_email,
        "kind": kind,
        "subject": subject,
        "body_text": body_text,
        "body_html": body_html,
        "ics": ics,
        "status": "queued",
        "attempts": 0,
        "next_attempt_at": send_after or utc_now(),
    }
    db.insert_ignoring_duplicates(session, EmailOutbox.__table__, values)


@dataclass
class ProcessReport:
    """What one call of process_due() did, returned to the cron caller."""

    sent: int = 0
    skipped: int = 0
    retrying: int = 0
    failed: int = 0


def backoff_delay(attempts: int) -> timedelta:
    """Wait before the next try: 5, 10, 20, 40 minutes after tries 1 to 4.

    Doubling the wait gives a provider that is down time to recover instead of
    hammering it every few minutes.
    """
    return FIRST_RETRY_DELAY * 2 ** (attempts - 1)


def _due_ids(session: Session, now: datetime, batch: int) -> list[int]:
    # A "sending" row whose lease has run out was left by a crashed processor.
    query = (
        select(EmailOutbox.id)
        .where(EmailOutbox.status.in_(("queued", "sending")))
        .where(EmailOutbox.next_attempt_at <= now)
        .order_by(EmailOutbox.next_attempt_at, EmailOutbox.id)
        .limit(batch)
    )
    ids = list(session.scalars(query))
    # End the read transaction now, so our claims below start fresh and see
    # what other processors have committed in the meantime.
    session.commit()
    return ids


def _claim(session: Session, row_id: int, now: datetime) -> bool:
    """Try to take one row for ourselves. True means we, and only we, won it.

    The WHERE clause repeats the "is it due?" test. The database runs the two
    competing UPDATEs one after the other; the first moves next_attempt_at into
    the future, so for the second the WHERE no longer matches and it changes
    0 rows. This is the same "let the database decide" idea as the seat locks.
    """
    result = session.execute(
        update(EmailOutbox)
        .where(EmailOutbox.id == row_id)
        .where(EmailOutbox.status.in_(("queued", "sending")))
        .where(EmailOutbox.next_attempt_at <= now)
        .values(status="sending", next_attempt_at=now + CLAIM_LEASE)
    )
    # Commit at once so the other processor sees the claim before our slow send.
    session.commit()
    return result.rowcount == 1


def _to_message(row: EmailOutbox) -> OutgoingEmail:
    return OutgoingEmail(
        to_email=row.to_email,
        subject=row.subject,
        body_text=row.body_text,
        body_html=row.body_html,
        ics=row.ics,
        idempotency_key=row.idempotency_key,
    )


def _record_failure(row: EmailOutbox, error: Exception, now: datetime) -> str:
    """Count the failed try and decide: try again later, or give up."""
    row.attempts += 1
    row.last_error = f"{type(error).__name__}: {error}"[:MAX_ERROR_LENGTH]
    if row.attempts >= MAX_ATTEMPTS:
        row.status = "failed"
    else:
        row.status = "queued"
        row.next_attempt_at = now + backoff_delay(row.attempts)
    return row.status


def _process_one(
    row: EmailOutbox, provider: Provider, allowlist: tuple[str, ...], now: datetime
) -> str:
    """Send one claimed row and return its new status."""
    if row.to_email.strip().lower() not in allowlist:
        # Demo-safety rule: only addresses on EMAIL_ALLOWLIST ever get email.
        row.status = "skipped"
        row.last_error = "Not on EMAIL_ALLOWLIST, so not sent."
        return row.status
    try:
        row.provider_message_id = provider.send(_to_message(row))
    except Exception as error:  # noqa: BLE001 (reason below)
        # Any error, not only ProviderError: one broken email must not stop the
        # batch or stay stuck in "sending".
        return _record_failure(row, error, now)
    row.status = "sent"
    row.sent_at = now
    row.last_error = None
    return row.status


def _count(report: ProcessReport, status: str) -> None:
    if status == "sent":
        report.sent += 1
    elif status == "skipped":
        report.skipped += 1
    elif status == "queued":
        report.retrying += 1
    else:
        report.failed += 1


def process_due(
    session: Session, provider: Provider, now: datetime, batch: int = 20
) -> ProcessReport:
    """Send up to `batch` emails whose time has come. Commits as it goes.

    Safe to run twice at the same moment (two cron calls overlapping): each row
    is claimed by exactly one processor, so no email goes out twice.
    """
    allowlist = get_settings().email_allowlist
    report = ProcessReport()
    for row_id in _due_ids(session, now, batch):
        if not _claim(session, row_id, now):
            continue  # another processor won this row
        row = session.get(EmailOutbox, row_id, populate_existing=True)
        if row is None:
            continue
        status = _process_one(row, provider, allowlist, now)
        session.commit()
        _count(report, status)
    return report
