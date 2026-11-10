"""Email bodies: one pure function per kind of email.

Every function takes plain values (names, already formatted dates, labels,
links) and returns EmailParts(subject, body_text, body_html). Nothing here
touches the database, so the routers decide what to say and these functions
only decide how it looks.

Two rules hold for every email:
- every value a person typed (names, notes, labels) is HTML-escaped before it
  goes into the HTML version, so a name like "<b>Ana</b>" shows as text;
- both versions carry the signed manage-or-cancel link and a footer saying why
  the person got the email and how to stop receiving them.
"""

import html
from datetime import datetime
from typing import NamedTuple
from zoneinfo import ZoneInfo

SENDER_NAME = "SeatPlan"
# The outbox column is VARCHAR(200); a longer subject would be refused by Postgres.
MAX_SUBJECT_LENGTH = 200


class EmailParts(NamedTuple):
    """What enqueue() needs. A NamedTuple, so it also unpacks as a plain tuple."""

    subject: str
    body_text: str
    body_html: str


def format_when(moment: datetime, timezone: str) -> str:
    """Turn a UTC datetime into the venue's local time, e.g. "Sat 14 Mar 2027, 19:30".

    Callers use this to build the `when` argument of the templates, so every
    email shows the time the way a guest reads it on the venue's wall clock.
    """
    local = moment.astimezone(ZoneInfo(timezone))
    return local.strftime("%a %d %b %Y, %H:%M")


# ---------------------------------------------------------------- shared layout


def _one_line(text: str) -> str:
    """Collapse line breaks and runs of spaces: a subject must be one line."""
    return " ".join(text.split())


def _subject(text: str) -> str:
    return _one_line(text)[:MAX_SUBJECT_LENGTH]


def _check_link(link: str) -> str:
    # Only web links are allowed: a "javascript:" link in an email would be a trap.
    if not link.startswith(("https://", "http://")):
        raise ValueError("Email links must start with http:// or https://")
    return link


_STOP_TEXT = (
    "To stop these emails, cancel or decline with the link above: you will get "
    "nothing more about it. We never send marketing."
)


def _text_version(
    greeting: str, paragraphs: list[str], link_label: str, link: str, reason: str
) -> str:
    lines = [greeting, ""]
    for paragraph in paragraphs:
        lines += [paragraph, ""]
    lines += [f"{link_label}: {link}", "", f"The {SENDER_NAME} team", "", "--", reason]
    lines.append(_STOP_TEXT)
    return "\n".join(lines) + "\n"


# Inline styles because many email apps ignore <style> blocks. One column with a
# max width reads well on a phone and on a desktop, and nothing needs images.
_PAGE = (
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width, initial-scale=1"></head>'
    '<body style="margin:0;padding:0;background:#f4f4f5;">'
    '<div style="max-width:560px;margin:0 auto;padding:24px 16px;'
    'font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#18181b;">'
    '<p style="margin:0 0 16px;font-size:14px;font-weight:bold;color:#3f3f46;">{sender}</p>'
    '<div style="background:#ffffff;border-radius:8px;padding:24px;">{content}</div>'
    '<p style="margin:16px 0 0;font-size:13px;color:#52525b;">{footer}</p>'
    "</div></body></html>"
)
_BUTTON = (
    '<p style="margin:24px 0;"><a href="{href}" style="display:inline-block;'
    "background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 20px;"
    'border-radius:6px;font-weight:bold;">{label}</a></p>'
    '<p style="margin:0 0 16px;font-size:13px;color:#52525b;word-break:break-all;">'
    "If the button does not work, copy this link: {href}</p>"
)


def _html_version(
    greeting: str, paragraphs: list[str], link_label: str, link: str, reason: str
) -> str:
    escape = html.escape
    content = f'<p style="margin:0 0 16px;">{escape(greeting)}</p>'
    for paragraph in paragraphs:
        content += f'<p style="margin:0 0 16px;">{escape(paragraph)}</p>'
    content += _BUTTON.format(href=escape(link, quote=True), label=escape(link_label))
    content += f'<p style="margin:0;">The {SENDER_NAME} team</p>'
    footer = f"{escape(reason)}<br>{escape(_STOP_TEXT)}"
    return _PAGE.format(sender=SENDER_NAME, content=content, footer=footer)


def _compose(
    subject: str, name: str, paragraphs: list[str], link_label: str, link: str, reason: str
) -> EmailParts:
    """Build both versions from the same plain sentences, so they never disagree."""
    greeting = f"Hello {_one_line(name)},"
    _check_link(link)
    return EmailParts(
        subject=_subject(subject),
        body_text=_text_version(greeting, paragraphs, link_label, link, reason),
        body_html=_html_version(greeting, paragraphs, link_label, link, reason),
    )


def _event_reason(event_name: str) -> str:
    return f"You received this email because you are on the guest list of {event_name}."


def _booking_reason(restaurant_name: str) -> str:
    return f"You received this email because you made a booking at {restaurant_name}."


# ---------------------------------------------------------------- events


def event_seat_confirmation(
    guest_name: str,
    event_name: str,
    venue_name: str,
    when: str,
    seat_label: str,
    table_label: str,
    manage_link: str,
) -> EmailParts:
    """Sent when a guest confirms a seat. `when` comes from format_when()."""
    paragraphs = [
        f"Your seat for {event_name} is confirmed.",
        f"Seat {seat_label} at table {table_label}, {venue_name}, {when}.",
        "You can change or give up your seat with the link below until the change deadline.",
    ]
    return _compose(
        f"Your seat for {event_name} is confirmed",
        guest_name,
        paragraphs,
        "Manage my seat",
        manage_link,
        _event_reason(event_name),
    )


def event_seat_change(
    guest_name: str,
    event_name: str,
    when: str,
    old_seat_label: str,
    new_seat_label: str,
    manage_link: str,
) -> EmailParts:
    """Sent when a guest's seat moves (by the guest, the organiser or a re-plan)."""
    paragraphs = [
        f"Your seat for {event_name} ({when}) has changed.",
        f"Before: seat {old_seat_label}. Now: seat {new_seat_label}.",
        "If this is not what you wanted, open the link below to pick another seat.",
    ]
    return _compose(
        f"Your seat for {event_name} has changed",
        guest_name,
        paragraphs,
        "Manage my seat",
        manage_link,
        _event_reason(event_name),
    )


def event_seat_cancellation(
    guest_name: str, event_name: str, when: str, seat_label: str, manage_link: str
) -> EmailParts:
    """Sent when a guest's seat is released. The link lets them choose again."""
    paragraphs = [
        f"Your seat {seat_label} for {event_name} ({when}) has been released.",
        "If you still want to come, open the link below and choose a new seat.",
    ]
    return _compose(
        f"Your seat for {event_name} was released",
        guest_name,
        paragraphs,
        "Choose a seat",
        manage_link,
        _event_reason(event_name),
    )


def event_reminder(
    guest_name: str,
    event_name: str,
    venue_name: str,
    when: str,
    seat_label: str | None,
    manage_link: str,
) -> EmailParts:
    """Sent before the event. With no seat yet, it invites the guest to pick one."""
    if seat_label is None:
        seat_sentence = "You have not chosen a seat yet. Pick one with the link below."
    else:
        seat_sentence = f"Your seat is {seat_label}."
    paragraphs = [f"A reminder: {event_name} is on {when} at {venue_name}.", seat_sentence]
    return _compose(
        f"Reminder: {event_name}, {when}",
        guest_name,
        paragraphs,
        "Manage my seat",
        manage_link,
        _event_reason(event_name),
    )


# ---------------------------------------------------------------- restaurants


def _party(party_size: int) -> str:
    return "1 person" if party_size == 1 else f"{party_size} people"


def booking_confirmation(
    diner_name: str,
    restaurant_name: str,
    when: str,
    party_size: int,
    table_label: str,
    manage_link: str,
) -> EmailParts:
    """Sent when a diner's booking is confirmed."""
    paragraphs = [
        f"Your table at {restaurant_name} is booked.",
        f"{when}, {_party(party_size)}, table {table_label}.",
        "You can change or cancel the booking with the link below.",
    ]
    return _compose(
        f"Booking confirmed: {restaurant_name}, {when}",
        diner_name,
        paragraphs,
        "Manage my booking",
        manage_link,
        _booking_reason(restaurant_name),
    )


def booking_change(
    diner_name: str,
    restaurant_name: str,
    when: str,
    party_size: int,
    table_label: str,
    manage_link: str,
) -> EmailParts:
    """Sent when the time, party size or table of a booking changes."""
    paragraphs = [
        f"Your booking at {restaurant_name} has been updated.",
        f"It is now: {when}, {_party(party_size)}, table {table_label}.",
    ]
    return _compose(
        f"Booking updated: {restaurant_name}, {when}",
        diner_name,
        paragraphs,
        "Manage my booking",
        manage_link,
        _booking_reason(restaurant_name),
    )


def booking_cancellation(
    diner_name: str, restaurant_name: str, when: str, party_size: int, manage_link: str
) -> EmailParts:
    """Sent when a booking is cancelled, by the diner or by the restaurant."""
    paragraphs = [
        f"Your booking at {restaurant_name} for {when} ({_party(party_size)}) is cancelled.",
        "The link below shows the booking and lets you book again.",
    ]
    return _compose(
        f"Booking cancelled: {restaurant_name}, {when}",
        diner_name,
        paragraphs,
        "View my booking",
        manage_link,
        _booking_reason(restaurant_name),
    )


def booking_reminder(
    diner_name: str,
    restaurant_name: str,
    when: str,
    party_size: int,
    table_label: str,
    manage_link: str,
) -> EmailParts:
    """Sent before the booking, so a diner who cannot come can free the table."""
    paragraphs = [
        f"A reminder of your booking at {restaurant_name}: {when}.",
        f"{_party(party_size).capitalize()}, table {table_label}.",
        "If you cannot come, please cancel with the link below so someone else can have it.",
    ]
    return _compose(
        f"Reminder: {restaurant_name}, {when}",
        diner_name,
        paragraphs,
        "Manage my booking",
        manage_link,
        _booking_reason(restaurant_name),
    )


def waitlist_offer(
    diner_name: str,
    restaurant_name: str,
    when: str,
    party_size: int,
    expires: str | None,
    claim_link: str,
) -> EmailParts:
    """Sent to a waitlisted diner when a table frees up.

    `expires` is a formatted time when the table is held for them, or None when
    it is not held (then the first person to book it gets it, and we say so).
    """
    if expires is None:
        hold_sentence = "It is not held, so book soon: the first person to book it gets it."
    else:
        hold_sentence = (
            f"It is held for you until {expires}. After that we offer it to the next person."
        )
    paragraphs = [
        f"Good news: a table for {_party(party_size)} at {restaurant_name} is free on {when}.",
        hold_sentence,
    ]
    reason = f"You received this email because you joined the waiting list of {restaurant_name}."
    return _compose(
        f"A table is free at {restaurant_name}",
        diner_name,
        paragraphs,
        "Claim or decline the table",
        claim_link,
        reason,
    )
