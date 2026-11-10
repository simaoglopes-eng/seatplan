"""The reminder an event guest gets before the event, kept in step with their seat.

The events code calls one function, sync_event_reminder(), whenever a guest's
seat changes: with the seat's label after a confirm or a move, and with
seat_label=None after a release or a GDPR erase. It never commits; the
reminder is saved together with the seat change that caused it.

There is one reminder row per guest per event (a stable idempotency key), so
a retry never queues a second one. A change rewrites that row while it is
still waiting, instead of adding a new row: a new key per change would leave
the old reminder behind, or lose the reminder when the guest moves back.
"""

from datetime import datetime, timedelta

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.mail import templates
from app.mail.outbox import enqueue
from app.models import EmailOutbox, Event, Guest, Venue, utc_now

KIND = "event_reminder"
# Rows still waiting to go out. "skipped" is a reminder we cancelled earlier;
# a guest who chooses a seat again should get it back.
_WAITING = ("queued", "skipped")


def reminder_time(starts_at: datetime, now: datetime) -> datetime | None:
    """A day before; if that has passed, two hours before; else no reminder.

    One rule for both verticals: restaurant_service/emails.py uses it too.
    """
    for hours in (24, 2):
        moment = starts_at - timedelta(hours=hours)
        if moment > now:
            return moment
    return None


def reminder_key(event: Event, guest_id: int) -> str:
    # Ids only, no personal data: the key stays in the table after an erase.
    return f"event-reminder-{event.public_id}-{guest_id}"


def _cancel(session: Session, key: str) -> None:
    """Stop a reminder that has not gone out yet. A sent one is history."""
    session.execute(
        update(EmailOutbox)
        .where((EmailOutbox.idempotency_key == key) & (EmailOutbox.status == "queued"))
        .values(status="skipped", last_error="Seat released or guest removed")
    )


def _parts(
    session: Session, event: Event, guest: Guest, seat_label: str, link: str
) -> templates.EmailParts:
    venue = session.get(Venue, event.venue_id)
    timezone = venue.timezone if venue else "UTC"
    return templates.event_reminder(
        guest.name,
        event.name,
        venue.name if venue else event.name,
        templates.format_when(event.starts_at, timezone),
        seat_label,
        link,
    )


def sync_event_reminder(
    session: Session, *, event: Event, guest: Guest, seat_label: str | None, link: str
) -> None:
    """Queue, update or cancel this guest's reminder. Does not commit.

    `seat_label` is the guest's seat as the emails write it ("5 at table 3"),
    or None when the guest no longer has one. `link` is the guest's page.
    """
    key = reminder_key(event, guest.id)
    send_after = reminder_time(event.starts_at, utc_now())
    if seat_label is None or not guest.email or send_after is None:
        _cancel(session, key)
        return
    parts = _parts(session, event, guest, seat_label, link)
    content = {
        "to_email": guest.email,
        "subject": parts.subject,
        "body_text": parts.body_text,
        "body_html": parts.body_html,
    }
    # Adds the row the first time; afterwards the UPDATE below refreshes it.
    enqueue(session, idempotency_key=key, kind=KIND, send_after=send_after, **content)
    session.execute(
        update(EmailOutbox)
        .where((EmailOutbox.idempotency_key == key) & EmailOutbox.status.in_(_WAITING))
        .values(**content, status="queued", next_attempt_at=send_after, last_error=None)
    )
