"""The restaurant booking emails with the restaurant's own details (spec 10).

One layout for the three emails a booking sends the diner: confirmed, changed and
reminder. In this order: the cover photo, "You're booked at ...", the date, time and
party, "Table 4 · Seat 2 (facing the window)", the ambience sentences, the mini-map of
the room, the address with a link to the map and the phone, and the manage link.
The text version says the same without images. Every value arrives already
formatted (app/restaurant_service/emails.py builds it from the booking), so this
module only chooses words and has no database access.

The cover photo is a remote image (an absolute https URL) because the email
provider supports a single inline image, and that one is the mini-map
(`cid:seatmap`). Nothing in here names any other diner: the facts have no field for one.
"""

import html
from dataclasses import dataclass
from typing import Literal

from app.mail.templates import (
    _PAGE,
    _STOP_TEXT,
    SENDER_NAME,
    EmailParts,
    _booking_reason,
    _check_link,
    _one_line,
    _paragraph,
    _party,
    _subject,
)

Kind = Literal["confirmed", "changed", "reminder"]
MAX_ALT_LENGTH = 300
PHOTO_WIDTH = 520
MAX_PHRASES = 4


@dataclass(frozen=True)
class RestaurantBooking:
    """What the email says about one booking."""

    diner_name: str
    restaurant: str
    day_text: str  # "Fri 21 Nov"
    time_text: str  # "20:00"
    party_size: int
    table_label: str  # "4" or "4 + 5"
    link: str
    seat_label: str | None = None
    seat_phrase: str | None = None  # "Facing the window"
    phrases: tuple[str, ...] = ()  # "Direct sun until 14:30"
    address: str = ""
    phone: str | None = None
    maps_url: str | None = None
    cover_url: str | None = None
    cover_alt: str = ""
    picture_width: int | None = None  # None: there is no mini-map
    picture_alt: str = ""


def seat_line(facts: RestaurantBooking) -> str:
    """ "Table 4 · Seat 2 (facing the window)", or just "Table 4"."""
    line = f"Table {facts.table_label}"
    if facts.seat_label:
        line += f" · Seat {facts.seat_label}"
        if facts.seat_phrase:
            phrase = facts.seat_phrase
            line += f" ({phrase[:1].lower()}{phrase[1:]})"
    return line


def picture_alt(restaurant: str, table_label: str, seat_label: str | None) -> str:
    """The mini-map's alt text: the message in words, for screen readers."""
    text = (
        f"Floor plan of {_one_line(restaurant)} seen from above. Your table, table "
        f"{_one_line(table_label)}, is highlighted in yellow"
    )
    if seat_label:
        text += f", and your chair, seat {_one_line(seat_label)}, is marked with a large black dot inside a ring"
    return f"{text}."[:MAX_ALT_LENGTH]


def _opening(kind: Kind, facts: RestaurantBooking) -> str:
    return {
        "confirmed": f"You're booked at {facts.restaurant}.",
        "changed": f"Your booking at {facts.restaurant} has been updated.",
        "reminder": f"A reminder of your booking at {facts.restaurant}.",
    }[kind]


def _closing(kind: Kind) -> str:
    if kind == "reminder":
        return "If you cannot come, please cancel with the link below so someone else can have the table."
    return "You can change or cancel the booking, or pick another chair, with the link below."


def _subject_line(kind: Kind, facts: RestaurantBooking) -> str:
    head = {"confirmed": "Booked", "changed": "Updated", "reminder": "Reminder"}[kind]
    return f"{head}: {facts.restaurant}, {facts.day_text} at {facts.time_text}"


def _details(facts: RestaurantBooking) -> list[tuple[str, str]]:
    return [
        ("Date", facts.day_text),
        ("Time", facts.time_text),
        ("People", _party(facts.party_size)),
        ("Your table", seat_line(facts)),
    ]


def _text(kind: Kind, facts: RestaurantBooking) -> str:
    name = _one_line(facts.diner_name)
    lines = [f"Hello {name}," if name else "Hello,", "", _opening(kind, facts), ""]
    lines += [f"{label}: {value}" for label, value in _details(facts)]
    if facts.phrases:
        lines += ["", *[f"- {phrase}" for phrase in facts.phrases[:MAX_PHRASES]]]
    if facts.picture_width is not None:
        lines += ["", "The HTML version of this email shows the room from above."]
    where = [part for part in (facts.address, facts.phone) if part]
    if where:
        lines += ["", f"Where: {', '.join(where)}"]
    if facts.maps_url:
        lines += [f"Map: {facts.maps_url}"]
    lines += [
        "",
        _closing(kind),
        "",
        f"Manage my booking: {facts.link}",
        "",
        f"The {SENDER_NAME} team",
    ]
    lines += ["", "--", _booking_reason(facts.restaurant), _STOP_TEXT]
    return "\n".join(lines) + "\n"


def _photo_html(facts: RestaurantBooking) -> str:
    if not facts.cover_url:
        return ""
    return (
        f'<img src="{html.escape(facts.cover_url, quote=True)}" width="{PHOTO_WIDTH}" '
        f'alt="{html.escape(facts.cover_alt[:MAX_ALT_LENGTH], quote=True)}" '
        f'style="display:block;width:100%;max-width:{PHOTO_WIDTH}px;height:auto;'
        'border-radius:6px;margin:0 0 16px;">'
    )


def _details_html(facts: RestaurantBooking) -> str:
    rows = "".join(
        '<tr><th scope="row" style="text-align:left;padding:4px 16px 4px 0;'
        f'font-weight:bold;vertical-align:top;">{html.escape(label)}</th>'
        f'<td style="padding:4px 0;">{html.escape(value)}</td></tr>'
        for label, value in _details(facts)
    )
    return f'<table role="presentation" style="margin:0 0 16px;border-collapse:collapse;">{rows}</table>'


def _phrases_html(facts: RestaurantBooking) -> str:
    if not facts.phrases:
        return ""
    items = "".join(f"<li>{html.escape(p)}</li>" for p in facts.phrases[:MAX_PHRASES])
    return f'<ul style="margin:0 0 16px;padding-left:20px;">{items}</ul>'


def _picture_html(facts: RestaurantBooking) -> str:
    if facts.picture_width is None:
        return ""
    width = min(facts.picture_width, 560)
    return (
        f'<img src="cid:seatmap" width="{width}" alt="{html.escape(facts.picture_alt, quote=True)}" '
        f'style="display:block;width:100%;max-width:{width}px;height:auto;'
        'border:1px solid #d4d4d8;border-radius:6px;margin:0 0 16px;">'
    )


def _where_html(facts: RestaurantBooking) -> str:
    parts = []
    if facts.address:
        address = html.escape(facts.address)
        if facts.maps_url:
            href = html.escape(facts.maps_url, quote=True)
            address = f'<a href="{href}" style="color:#1d4ed8;">{address}</a>'
        parts.append(address)
    if facts.phone:
        parts.append(html.escape(facts.phone))
    return f'<p style="margin:0 0 16px;">{"<br>".join(parts)}</p>' if parts else ""


def _button(link: str) -> str:
    href = html.escape(link, quote=True)
    return (
        f'<p style="margin:24px 0;"><a href="{href}" style="display:inline-block;'
        "background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 20px;"
        'border-radius:6px;font-weight:bold;">Manage my booking</a></p>'
        '<p style="margin:0 0 16px;font-size:13px;color:#52525b;word-break:break-all;">'
        f"If the button does not work, copy this link: {href}</p>"
    )


def _html(kind: Kind, facts: RestaurantBooking) -> str:
    name = _one_line(facts.diner_name)
    content = _photo_html(facts)
    content += _paragraph(f"Hello {name}," if name else "Hello,")
    content += _paragraph(_opening(kind, facts))
    content += (
        _details_html(facts) + _phrases_html(facts) + _picture_html(facts) + _where_html(facts)
    )
    content += _paragraph(_closing(kind)) + _button(facts.link)
    content += f'<p style="margin:0;">The {SENDER_NAME} team</p>'
    footer = f"{html.escape(_booking_reason(facts.restaurant))}<br>{html.escape(_STOP_TEXT)}"
    return _PAGE.format(sender=SENDER_NAME, content=content, footer=footer)


def booking_email(kind: Kind, facts: RestaurantBooking) -> EmailParts:
    """Confirmed, changed or reminder email, as subject, text and HTML."""
    _check_link(facts.link)
    for optional in (facts.cover_url, facts.maps_url):
        if optional:
            _check_link(optional)
    return EmailParts(
        subject=_subject(_subject_line(kind, facts)),
        body_text=_text(kind, facts),
        body_html=_html(kind, facts),
    )
