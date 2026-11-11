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
from dataclasses import dataclass
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
    greeting: str,
    paragraphs: list[str],
    link_label: str,
    link: str,
    reason: str,
    stop: str = _STOP_TEXT,
) -> str:
    lines = [greeting, ""]
    for paragraph in paragraphs:
        lines += [paragraph, ""]
    lines += [f"{link_label}: {link}", "", f"The {SENDER_NAME} team", "", "--", reason]
    lines.append(stop)
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


def _paragraph(text: str) -> str:
    return f'<p style="margin:0 0 16px;">{html.escape(text)}</p>'


def _html_version(
    greeting: str,
    paragraphs: list[str],
    link_label: str,
    link: str,
    reason: str,
    stop: str = _STOP_TEXT,
) -> str:
    escape = html.escape
    content = _paragraph(greeting) + "".join(_paragraph(text) for text in paragraphs)
    content += _BUTTON.format(href=escape(link, quote=True), label=escape(link_label))
    content += f'<p style="margin:0;">The {SENDER_NAME} team</p>'
    footer = f"{escape(reason)}<br>{escape(stop)}"
    return _PAGE.format(sender=SENDER_NAME, content=content, footer=footer)


def _compose(
    subject: str,
    name: str,
    paragraphs: list[str],
    link_label: str,
    link: str,
    reason: str,
    stop: str = _STOP_TEXT,
) -> EmailParts:
    """Build both versions from the same plain sentences, so they never disagree.

    An empty `name` gives a plain "Hello," (used when the name is not proven).
    """
    greeting = f"Hello {_one_line(name)}," if name.strip() else "Hello,"
    _check_link(link)
    return EmailParts(
        subject=_subject(subject),
        body_text=_text_version(greeting, paragraphs, link_label, link, reason, stop),
        body_html=_html_version(greeting, paragraphs, link_label, link, reason, stop),
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


# ---------------------------------------------------------------- guest accounts
#
# Emails for people with a SeatPlan guest account (docs/guest-accounts.md,
# section 9). None of them carries a secret link: the seat page needs a
# sign-in, so a forwarded email opens nothing.

_ACCOUNT_STOP_TEXT = (
    "To stop these emails, give up your seat or delete your account on the page above. "
    "We never send marketing."
)
_CODE_STOP_TEXT = "You will not get more emails unless you ask for another code."
_CODE_REASON = "You received this email because someone typed this address on SeatPlan."
_PICTURE_NOTE = (
    "The picture shows the room from above. Your seat is the large black dot inside a "
    "ring, with the label YOU. If your email app shows no picture, it is attached as "
    "seat-map.png."
)
MAX_ALT_LENGTH = 300


@dataclass(frozen=True)
class AccountSeat:
    """The facts of an account holder's seat email, already formatted.

    `old_seat` is set (for example "4 at table T2") when the seat changed;
    `deadline` is format_when() of the change deadline, or None.
    """

    guest_name: str
    event_name: str
    when: str
    venue_name: str
    seat_label: str
    table_label: str
    deadline: str | None
    link: str
    old_seat: str | None = None
    moved_by_organiser: bool = False
    # The picture's real width in pixels: a tall room gives a narrow picture,
    # and stretching it to 560 would blur it (Outlook reads only `width`).
    picture_width: int = 560


def seat_picture_alt(venue_name: str, seat_label: str, table_label: str) -> str:
    """The picture's alt text: the whole message in words, for screen readers."""
    text = (
        f"Floor plan of {_one_line(venue_name)} seen from above. Your seat, seat "
        f"{_one_line(seat_label)} at table {_one_line(table_label)}, is marked with a large "
        "black dot inside a ring and the label YOU."
    )
    return text[:MAX_ALT_LENGTH]


def _account_opening(facts: AccountSeat) -> list[str]:
    if facts.old_seat is None:
        return [f"Your seat for {facts.event_name} is confirmed."]
    sentences = [f"Your seat for {facts.event_name} has changed."]
    if facts.moved_by_organiser:
        sentences.append("The organiser moved you to a new seat.")
    new_seat = f"{facts.seat_label} at table {facts.table_label}"
    return [*sentences, f"Before: seat {facts.old_seat}. Now: seat {new_seat}."]


def _account_details(facts: AccountSeat) -> list[tuple[str, str]]:
    return [
        ("Event", facts.event_name),
        ("When", facts.when),
        ("Where", facts.venue_name),
        ("Your seat", f"seat {facts.seat_label} at table {facts.table_label}"),
    ]


def _deadline_sentence(facts: AccountSeat) -> str:
    until = facts.deadline or "the organiser closes changes"
    return f"You can change or give up your seat until {until}."


def _account_reason(event_name: str) -> str:
    return f"You received this email because you have a SeatPlan account and joined {event_name}."


def _account_seat_text(facts: AccountSeat) -> str:
    lines = [f"Hello {_one_line(facts.guest_name)},", ""]
    for sentence in _account_opening(facts):
        lines += [sentence, ""]
    lines += [f"{label}: {value}" for label, value in _account_details(facts)]
    lines += ["", _PICTURE_NOTE, "", _deadline_sentence(facts), ""]
    lines += [f"See my seat: {facts.link}", "", f"The {SENDER_NAME} team", "", "--"]
    lines += [_account_reason(facts.event_name), _ACCOUNT_STOP_TEXT]
    return "\n".join(lines) + "\n"


def _details_table(facts: AccountSeat) -> str:
    rows = "".join(
        '<tr><th scope="row" style="text-align:left;padding:4px 16px 4px 0;'
        f'font-weight:bold;vertical-align:top;">{html.escape(label)}</th>'
        f'<td style="padding:4px 0;">{html.escape(value)}</td></tr>'
        for label, value in _account_details(facts)
    )
    return f'<table role="presentation" style="margin:0 0 16px;border-collapse:collapse;">{rows}</table>'


def _picture_html(facts: AccountSeat) -> str:
    alt = html.escape(seat_picture_alt(facts.venue_name, facts.seat_label, facts.table_label))
    seat = html.escape(f"seat {facts.seat_label} at table {facts.table_label}")
    width = min(facts.picture_width, 560)
    return (
        f'<img src="cid:seatmap" width="{width}" alt="{alt}" '
        f'style="display:block;width:100%;max-width:{width}px;height:auto;'
        'border:1px solid #d4d4d8;border-radius:6px;margin:16px 0 8px;">'
        f'<p style="margin:0 0 16px;font-size:14px;color:#3f3f46;">Your seat: {seat}, marked YOU.</p>'
    )


def _account_seat_html(facts: AccountSeat) -> str:
    escape = html.escape
    content = _paragraph(f"Hello {_one_line(facts.guest_name)},")
    content += "".join(_paragraph(sentence) for sentence in _account_opening(facts))
    content += _details_table(facts) + _picture_html(facts)
    content += _paragraph(_deadline_sentence(facts))
    content += _BUTTON.format(href=escape(facts.link, quote=True), label="See my seat")
    content += f'<p style="margin:0;">The {SENDER_NAME} team</p>'
    footer = f"{escape(_account_reason(facts.event_name))}<br>{escape(_ACCOUNT_STOP_TEXT)}"
    return _PAGE.format(sender=SENDER_NAME, content=content, footer=footer)


def account_seat_email(facts: AccountSeat) -> EmailParts:
    """Seat confirmed or changed, for an account holder: details, picture, link."""
    _check_link(facts.link)
    seat = f"seat {facts.seat_label} at table {facts.table_label}"
    if facts.old_seat is None:
        subject = f"Your seat for {facts.event_name}: {seat}"
    else:
        subject = f"Your seat for {facts.event_name} has changed: now {seat}"
    return EmailParts(
        subject=_subject(subject),
        body_text=_account_seat_text(facts),
        body_html=_account_seat_html(facts),
    )


def account_code(event_name: str, code: str, sign_in_link: str) -> EmailParts:
    """The 6-digit code that finishes a sign-up. Never in the subject: lock screens show it.

    The greeting has no name: whoever filled in the form typed it, and it is
    not proven yet, so it must not reach someone else's inbox in our words.
    """
    paragraphs = [
        f"Your code to finish creating your SeatPlan account for {event_name} is: {code}",
        (
            "It works for 15 minutes. If you did not ask for it, ignore this email: "
            "no account is made without the code."
        ),
        "Never give this code to anyone. SeatPlan never asks for it by phone or message.",
    ]
    return _compose(
        "Your SeatPlan code",
        "",
        paragraphs,
        "Open SeatPlan",
        sign_in_link,
        _CODE_REASON,
        _CODE_STOP_TEXT,
    )


def password_code(name: str, code: str, sign_in_link: str) -> EmailParts:
    """The 6-digit code for choosing a new password."""
    paragraphs = [
        f"Your code to choose a new SeatPlan password is: {code}",
        (
            "It works for 15 minutes. If you did not ask for it, ignore this email: "
            "your password stays the same."
        ),
    ]
    return _compose(
        "Your SeatPlan password reset code",
        name,
        paragraphs,
        "Open SeatPlan",
        sign_in_link,
        _CODE_REASON,
        _CODE_STOP_TEXT,
    )


def account_exists(name: str, event_name: str, sign_in_link: str) -> EmailParts:
    """Sent instead of a code when the address already has an account."""
    paragraphs = [
        (
            "Someone, probably you, tried to create a SeatPlan account with this address to "
            f"join {event_name}. You already have one, so nothing changed."
        ),
        (
            "To join this event, open again the link the organiser shared and choose "
            '"I already have an account". Sign in with your password, or choose a new '
            "one if you forgot it."
        ),
    ]
    return _compose(
        "You already have a SeatPlan account",
        name,
        paragraphs,
        "Sign in",
        sign_in_link,
        _CODE_REASON,
        _CODE_STOP_TEXT,
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
