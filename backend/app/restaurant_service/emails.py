"""Restaurant emails, queued through the outbox (never sent from here).

Each email has a stable idempotency key, so the same event can never queue
the same email twice. A booking can change many times, and may even return to
an earlier time, so change emails and reminders carry a change number (1, 2,
3, ...) instead of the time: every change is a new event with its own key. The words come from app/mail/templates.py. Confirmation,
change and cancellation also carry a calendar invite (app/mail/invites.py)
with one UID per booking, so the diner's calendar follows the booking.
"""

from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.mail import templates
from app.mail.invites import calendar_invite
from app.mail.outbox import enqueue
from app.mail.reminders import reminder_time
from app.models import Booking, EmailOutbox, Venue, WaitlistEntry, utc_now
from app.restaurant_service import occupancy
from app.restaurant_service.booking_rows import table_labels
from app.restaurant_service.clock import local_datetime

# ---------------------------------------------------------------- small helpers


def manage_link(token: str) -> str:
    return f"{get_settings().public_base_url}/b/{token}"


def _link(venue: Venue, token: str) -> str:
    """The manage link when we know the token, else the restaurant's booking page.

    We only keep a hash of the manage token, so when staff change a booking we
    cannot rebuild the diner's link. The diner still has it from the first email.
    """
    if token:
        return manage_link(token)
    return f"{get_settings().public_base_url}/r/{venue.public_id}"


def _when(venue: Venue, booking: Booking) -> str:
    return templates.format_when(booking.start_at, venue.timezone)


def _tables(session: Session, booking: Booking) -> str:
    labels = table_labels(session, occupancy.tables_of(session, booking))
    return " + ".join(labels) if labels else "to be confirmed"


def _invite(venue: Venue, booking: Booking, cancelled: bool = False) -> str:
    return calendar_invite(
        kind="booking",
        public_id=booking.public_id,
        start=booking.start_at,
        end=booking.end_at,
        summary=f"Table at {venue.name}",
        location=venue.name,
        description=f"Party of {booking.party_size}",
        attendee_email=booking.email,
        cancelled=cancelled,
    )


def _queue(
    session: Session,
    key: str,
    to_email: str,
    kind: str,
    parts: templates.EmailParts,
    ics: str | None = None,
    send_after: datetime | None = None,
) -> None:
    enqueue(
        session,
        idempotency_key=key,
        to_email=to_email,
        kind=kind,
        subject=parts.subject,
        body_text=parts.body_text,
        body_html=parts.body_html,
        ics=ics,
        send_after=send_after,
    )


# ---------------------------------------------------------------- reminders


def _reminder_prefix(booking: Booking) -> str:
    return f"booking-reminder-{booking.public_id}-"


def _reminder_key(booking: Booking, change_number: int) -> str:
    # One key per version of the booking (0 = as first booked). Using the
    # start time instead would collide when a booking keeps its time (only the
    # party size changed) or goes back to an earlier time: the new reminder
    # would be ignored as a duplicate of the one we had just cancelled.
    return f"{_reminder_prefix(booking)}{change_number}"


def _change_prefix(booking: Booking) -> str:
    return f"booking-changed-{booking.public_id}-"


def _next_change_number(session: Session, booking: Booking) -> int:
    """1 for the first change of this booking, 2 for the second, and so on."""
    earlier = session.scalar(
        select(func.count())
        .select_from(EmailOutbox)
        .where(EmailOutbox.idempotency_key.startswith(_change_prefix(booking), autoescape=True))
    )
    return (earlier or 0) + 1


def queue_reminder(
    session: Session, venue: Venue, booking: Booking, token: str, change_number: int = 0
) -> None:
    send_after = reminder_time(booking.start_at, utc_now())
    if send_after is None or not booking.email:
        return
    parts = templates.booking_reminder(
        booking.name,
        venue.name,
        _when(venue, booking),
        booking.party_size,
        _tables(session, booking),
        _link(venue, token),
    )
    _queue(
        session,
        _reminder_key(booking, change_number),
        booking.email,
        "booking_reminder",
        parts,
        None,
        send_after,
    )


def drop_reminder(session: Session, booking: Booking) -> None:
    """Stop every reminder of this booking that has not gone out yet (moved or cancelled).

    We mark it skipped instead of deleting it, so the email log still shows it.
    """
    session.execute(
        update(EmailOutbox)
        .where(
            EmailOutbox.idempotency_key.startswith(_reminder_prefix(booking), autoescape=True)
            & (EmailOutbox.status == "queued")
        )
        .values(status="skipped", last_error="Booking changed or cancelled")
    )


# ---------------------------------------------------------------- booking emails


def queue_confirmation(session: Session, venue: Venue, booking: Booking, token: str) -> None:
    parts = templates.booking_confirmation(
        booking.name,
        venue.name,
        _when(venue, booking),
        booking.party_size,
        _tables(session, booking),
        manage_link(token),
    )
    key = f"booking-confirmed-{booking.public_id}"
    _queue(session, key, booking.email, "booking_confirmed", parts, _invite(venue, booking))
    queue_reminder(session, venue, booking, token)


def queue_change(session: Session, venue: Venue, booking: Booking, token: str = "") -> None:
    """`token` is the raw manage token when the diner made the change themselves."""
    parts = templates.booking_change(
        booking.name,
        venue.name,
        _when(venue, booking),
        booking.party_size,
        _tables(session, booking),
        _link(venue, token),
    )
    number = _next_change_number(session, booking)
    key = f"{_change_prefix(booking)}{number}"
    _queue(session, key, booking.email, "booking_changed", parts, _invite(venue, booking))
    queue_reminder(session, venue, booking, token, number)


def queue_cancellation(session: Session, venue: Venue, booking: Booking, token: str = "") -> None:
    if not booking.email:
        return
    parts = templates.booking_cancellation(
        booking.name,
        venue.name,
        _when(venue, booking),
        booking.party_size,
        _link(venue, token),
    )
    key = f"booking-cancelled-{booking.public_id}"
    invite = _invite(venue, booking, cancelled=True)
    _queue(session, key, booking.email, "booking_cancelled", parts, invite)


def queue_waitlist_offer(
    session: Session, venue: Venue, entry: WaitlistEntry, freed: Booking, link: str
) -> None:
    wanted = local_datetime(venue, entry.date, entry.wanted_time)
    # The freed table is not held for this person (see waitlist.py), so no expiry.
    parts = templates.waitlist_offer(
        entry.name,
        venue.name,
        templates.format_when(wanted, venue.timezone),
        entry.party_size,
        None,
        link,
    )
    key = f"waitlist-offer-{entry.id}-{freed.public_id}"
    _queue(session, key, entry.email, "waitlist_offer", parts)
