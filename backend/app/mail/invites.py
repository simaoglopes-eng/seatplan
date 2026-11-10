"""The calendar invite attached to seat and booking emails.

ics.py knows the file format. This module fills in the parts every SeatPlan
invite shares: who sends it (EMAIL_FROM) and a SEQUENCE number that grows.
"""

from datetime import datetime
from email.utils import parseaddr

from app.config import get_settings
from app.mail.ics import build_invite, make_uid
from app.models import utc_now


def invite_sequence(now: datetime) -> int:
    """SEQUENCE for an invite written at `now`.

    RFC 5546: a calendar app only accepts an update whose SEQUENCE is higher than
    the last one it saw for the same UID. Seconds since 1970 always grow, so a
    confirmation, a change and a cancellation replace each other in order
    without us storing a counter. The value still fits the 32-bit INTEGER that
    RFC 5545 allows until the year 2038.
    """
    return int(now.timestamp())


def calendar_invite(
    *,
    kind: str,
    public_id: str,
    start: datetime,
    end: datetime,
    summary: str,
    location: str,
    description: str,
    attendee_email: str,
    cancelled: bool = False,
) -> str:
    """The .ics text for one seat or booking. Same kind + public_id = same UID."""
    sender_name, sender_email = parseaddr(get_settings().email_from)
    now = utc_now()
    return build_invite(
        uid=make_uid(kind, public_id),
        start=start,
        end=end,
        summary=summary,
        location=location,
        description=description,
        organizer_name=sender_name or "SeatPlan",
        organizer_email=sender_email or "noreply@example.com",
        attendee_email=attendee_email,
        sequence=invite_sequence(now),
        cancelled=cancelled,
        now=now,
    )
