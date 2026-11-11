"""Seat emails for attendees: confirmation, change and cancellation.

Emails are only queued here (mail/outbox.py); a separate job sends them later.
The words come from mail/templates.py, and every email carries a calendar
invite (mail/invites.py) so the guest's calendar follows their seat.

Two kinds of guest get different emails (docs/guest-accounts.md, 9.1):
- a guest with only a personal link gets today's emails, linking to /e/<token>
  when we know the token;
- a guest row owned by a guest account (guest.account_id is set) gets, for a
  confirmed or changed seat, the account email with a picture of the room
  (mail/seat_picture.py). Its link is /my/<event id>, a page that needs a
  sign-in, so the email holds no secret.
"""

import base64
from dataclasses import replace

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.mail import templates
from app.mail.invites import calendar_invite
from app.mail.outbox import enqueue
from app.mail.png import png_width
from app.mail.reminders import reminder_key, sync_event_reminder
from app.mail.seat_picture import (
    PictureRoom,
    PictureSeat,
    PictureTable,
    PictureZone,
    render_seat_picture,
)
from app.models import EmailOutbox, Event, Guest, GuestAccount, Seat, Venue, VenueTable, Zone

SEAT_KINDS = ("seat_confirmed", "seat_changed", "seat_cancelled")


def guest_link(token: str | None) -> str:
    """The guest's personal page, or the site home when we do not know the token.

    We only store a hash of each token, so when an organiser moves someone we
    cannot rebuild their personal link. The guest still has it from earlier.
    """
    base = get_settings().public_base_url
    return f"{base}/e/{token}" if token else f"{base}/"


def account_link(event: Event) -> str:
    """The account holder's seat page. It needs a sign-in, so it is not a secret."""
    return f"{get_settings().public_base_url}/my/{event.public_id}"


def _link_for(event: Event, guest: Guest, token: str | None) -> str:
    return account_link(event) if guest.account_id is not None else guest_link(token)


def _seat_words(session: Session, seat: Seat | None) -> str:
    """Fits after the word "seat" in the templates: "5 at table 3"."""
    if seat is None:
        return "none"
    table = session.get(VenueTable, seat.table_id)
    return f"{seat.label} at table {table.label}" if table else seat.label


def _parts(
    session: Session, kind: str, guest: Guest, event: Event, seat: Seat, old: Seat | None, link: str
) -> templates.EmailParts:
    venue = session.get(Venue, event.venue_id)
    when = templates.format_when(event.starts_at, venue.timezone if venue else "UTC")
    if kind == "seat_confirmed":
        table = session.get(VenueTable, seat.table_id)
        return templates.event_seat_confirmation(
            guest.name,
            event.name,
            venue.name if venue else event.name,
            when,
            seat.label,
            table.label if table else "-",
            link,
        )
    if kind == "seat_changed":
        return templates.event_seat_change(
            guest.name,
            event.name,
            when,
            _seat_words(session, old),
            _seat_words(session, seat),
            link,
        )
    return templates.event_seat_cancellation(
        guest.name, event.name, when, _seat_words(session, seat), link
    )


def _invite(session: Session, kind: str, guest: Guest, event: Event, seat: Seat) -> str:
    venue = session.get(Venue, event.venue_id)
    # One UID per guest per event: a change or a cancellation replaces the entry.
    return calendar_invite(
        kind="seat",
        public_id=f"{event.public_id}-{guest.id}",
        start=event.starts_at,
        end=event.ends_at,
        summary=event.name,
        location=venue.name if venue else "",
        description=f"Your seat: {_seat_words(session, seat)}",
        attendee_email=guest.email or "",
        cancelled=kind == "seat_cancelled",
    )


def picture_room(session: Session, venue: Venue) -> PictureRoom:
    """The room as the seat picture sees it: zones, tables and seats, nothing else.

    No guest, assignment or hold is read here, which is why the picture can
    never show who sits where.
    """
    zones = session.scalars(select(Zone).where(Zone.venue_id == venue.id).order_by(Zone.id))
    tables = session.scalars(
        select(VenueTable).where(VenueTable.venue_id == venue.id).order_by(VenueTable.id)
    )
    seats = session.scalars(select(Seat).where(Seat.venue_id == venue.id).order_by(Seat.id))
    return PictureRoom(
        width=venue.width,
        height=venue.height,
        zones=tuple(PictureZone(z.kind, z.name, z.x, z.y, z.w, z.h) for z in zones),
        tables=tuple(
            PictureTable(t.id, t.label, t.shape, t.x, t.y, t.w, t.h, t.rotation) for t in tables
        ),
        seats=tuple(PictureSeat(s.id, s.table_id, s.x, s.y) for s in seats),
    )


def seat_picture_base64(session: Session, venue: Venue, seat: Seat, table_label: str) -> str:
    png = render_seat_picture(picture_room(session, venue), seat.id, seat.label, table_label)
    return base64.b64encode(png).decode("ascii")


def _account_parts(
    session: Session, event: Event, guest: Guest, seat: Seat, old: Seat | None, moved: bool
) -> tuple[templates.EmailParts, str]:
    """The account seat email and its picture (Base64) for a confirmed or changed seat."""
    venue = session.get(Venue, event.venue_id)
    if venue is None:
        raise ValueError("The event has no venue.")
    table = session.get(VenueTable, seat.table_id)
    table_label = table.label if table else "-"
    deadline = event.change_deadline
    facts = templates.AccountSeat(
        guest_name=guest.name,
        event_name=event.name,
        when=templates.format_when(event.starts_at, venue.timezone),
        venue_name=venue.name,
        seat_label=seat.label,
        table_label=table_label,
        deadline=templates.format_when(deadline, venue.timezone) if deadline else None,
        link=account_link(event),
        old_seat=_seat_words(session, old) if old is not None else None,
        moved_by_organiser=moved,
    )
    png = render_seat_picture(picture_room(session, venue), seat.id, seat.label, table_label)
    facts = replace(facts, picture_width=png_width(png))
    return templates.account_seat_email(facts), base64.b64encode(png).decode("ascii")


def _recipient(session: Session, guest: Guest) -> str | None:
    """Where the guest's seat emails go: the account's proven address when
    there is one, else the address the organiser typed (None when erased)."""
    if guest.account_id is not None:
        account = session.get(GuestAccount, guest.account_id)
        if account is not None:
            return account.email
    return guest.email or None


def queue_seat_email(
    session: Session,
    *,
    kind: str,
    key: str,
    guest: Guest,
    event: Event,
    seat: Seat,
    old_seat: Seat | None = None,
    token: str | None = None,
    moved_by_organiser: bool = False,
) -> None:
    """Queue one seat email, unless the guest has no address (for example erased).

    `key` must name this exact action, so a retry never sends it twice.
    `token` is the guest's raw link token when the guest is the one acting.
    `moved_by_organiser` adds "The organiser moved you" to an account email.
    """
    to_email = _recipient(session, guest)
    if not guest.email or not to_email:
        return
    if kind not in SEAT_KINDS:
        raise ValueError(f"Unknown seat email kind: {kind}")
    picture = None
    if guest.account_id is not None and kind != "seat_cancelled":
        parts, picture = _account_parts(session, event, guest, seat, old_seat, moved_by_organiser)
    else:
        parts = _parts(session, kind, guest, event, seat, old_seat, _link_for(event, guest, token))
    enqueue(
        session,
        idempotency_key=key,
        to_email=to_email,
        kind=kind,
        subject=parts.subject,
        body_text=parts.body_text,
        body_html=parts.body_html,
        ics=_invite(session, kind, guest, event, seat),
        image_png=picture,
    )


def sync_reminder(
    session: Session, event: Event, guest: Guest, seat: Seat | None, token: str | None = None
) -> None:
    """Keep the guest's reminder (mail/reminders.py) in step with their seat. No commit.

    `seat` is the guest's seat now, or None when they no longer have one.
    """
    label = _seat_words(session, seat) if seat is not None else None
    link = _link_for(event, guest, token)
    sync_event_reminder(session, event=event, guest=guest, seat_label=label, link=link)


def _guest_rows(session: Session, event: Event, guest_id: int) -> list[EmailOutbox]:
    """Every outbox row about this guest: their seat emails and their reminder."""
    # Seat email keys look like "seat-<kind>:<guest id>:<seat id>:<audit id>".
    # LIKE narrows the search; the exact check on the second part makes sure
    # guest 5 never matches the keys of guest 15 or of seat 5.
    query = select(EmailOutbox).where(EmailOutbox.idempotency_key.like(f"seat-%:{guest_id}:%"))
    rows = [
        row for row in session.scalars(query) if row.idempotency_key.split(":")[1] == str(guest_id)
    ]
    key = reminder_key(event, guest_id)
    reminder = session.scalars(select(EmailOutbox).where(EmailOutbox.idempotency_key == key))
    return rows + list(reminder)


def forget_guest_emails(session: Session, event: Event, guest_id: int) -> int:
    """GDPR erasure for the outbox: blank every email of this guest. No commit.

    Rows are kept (the log still shows that an email existed and when), but
    the address, the words and the invite are wiped, and anything not sent
    yet is skipped so it never goes out. Returns how many rows were wiped.
    """
    wiped = 0
    for row in _guest_rows(session, event, guest_id):
        row.to_email = ""
        row.subject = "(erased)"
        row.body_text = ""
        row.body_html = ""
        row.ics = None
        row.image_png = None
        row.last_error = None  # a provider error can quote the address
        if row.status != "sent":
            row.status = "skipped"
        wiped += 1
    return wiped
