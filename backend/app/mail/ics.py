"""Calendar invites (.ics files) following RFC 5545 (iCalendar) and RFC 5546 (iTIP).

build_invite() returns the text of one VCALENDAR with one VEVENT. The rules we
rely on, with their RFC sections, are listed in docs/email.md. In short:
- lines end with CRLF and are folded at 75 octets (RFC 5545 section 3.1);
- text values escape backslash, semicolon, comma and newlines (section 3.3.11);
- times are written in UTC with a trailing "Z" (section 3.3.5, form 2);
- UID stays the same for one booking or seat, so a calendar app updates the
  existing entry instead of adding a second one; SEQUENCE grows with each change.
"""

from datetime import UTC, datetime

PRODUCT_ID = "-//SeatPlan//SeatPlan 0.1//EN"
UID_DOMAIN = "seatplan.example.com"
MAX_LINE_OCTETS = 75


def make_uid(kind: str, public_id: str) -> str:
    """A UID that is stable per booking or seat, e.g. "booking-Ab3x...@seatplan.example.com".

    RFC 5545 section 3.8.4.7 recommends a domain on the right of the "@" so
    UIDs from different programs never collide.
    """
    return f"{kind}-{public_id}@{UID_DOMAIN}"


def escape_text(value: str) -> str:
    """Escape a TEXT value (RFC 5545 section 3.3.11).

    The backslash goes first; otherwise the backslashes we add for ";" and ","
    would be doubled.
    """
    value = value.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    return value.replace("\n", "\\n")


def format_utc(moment: datetime) -> str:
    """19980119T070000Z style (RFC 5545 section 3.3.5, form 2: UTC time)."""
    if moment.tzinfo is None:
        raise ValueError("Datetimes must be timezone-aware")
    return moment.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def fold_line(line: str) -> str:
    """Fold one content line so no physical line is longer than 75 octets.

    RFC 5545 section 3.1: a long line is split by inserting CRLF followed by
    one space. We count UTF-8 bytes (octets), not characters, and never cut a
    multi-byte character in half, so "e acute" or emoji survive unfolding.
    """
    pieces: list[str] = []
    current = ""
    limit = MAX_LINE_OCTETS
    for char in line:
        if len((current + char).encode("utf-8")) > limit:
            pieces.append(current)
            current = ""
            # Continuation lines start with a space, which uses one of the 75 octets.
            limit = MAX_LINE_OCTETS - 1
        current += char
    pieces.append(current)
    return "\r\n ".join(pieces)


def _quoted_param(value: str) -> str:
    # A parameter value cannot contain a double quote (RFC 5545 section 3.2),
    # and quoting it allows ":", ";" and "," inside a display name. split()
    # also removes line breaks, which would otherwise start a new property.
    return '"' + " ".join(value.replace('"', "").split()) + '"'


def _mailto(address: str) -> str:
    # Addresses are not TEXT values, so they are not escaped. A line break in
    # one could start a new property, so we refuse it outright.
    if "\r" in address or "\n" in address:
        raise ValueError("Email addresses cannot contain line breaks")
    return f"mailto:{address}"


def build_invite(
    *,
    uid: str,
    start: datetime,
    end: datetime,
    summary: str,
    location: str,
    description: str,
    organizer_name: str,
    organizer_email: str,
    attendee_email: str,
    sequence: int = 0,
    cancelled: bool = False,
    now: datetime | None = None,
) -> str:
    """Return the full .ics text for one event, or for its cancellation.

    A normal invite uses METHOD:PUBLISH and STATUS:CONFIRMED. A cancellation
    uses METHOD:CANCEL and STATUS:CANCELLED with the SAME uid and a HIGHER
    sequence than the last invite, which is how calendar apps know to remove
    the entry (RFC 5546 section 3.2.5).
    """
    stamp = now or datetime.now(UTC)
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:{PRODUCT_ID}",
        "CALSCALE:GREGORIAN",
        f"METHOD:{'CANCEL' if cancelled else 'PUBLISH'}",
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTAMP:{format_utc(stamp)}",
        f"DTSTART:{format_utc(start)}",
        f"DTEND:{format_utc(end)}",
        f"SEQUENCE:{sequence}",
        f"STATUS:{'CANCELLED' if cancelled else 'CONFIRMED'}",
        f"SUMMARY:{escape_text(summary)}",
        f"LOCATION:{escape_text(location)}",
        f"DESCRIPTION:{escape_text(description)}",
        f"ORGANIZER;CN={_quoted_param(organizer_name)}:{_mailto(organizer_email)}",
        f"ATTENDEE:{_mailto(attendee_email)}",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "".join(fold_line(line) + "\r\n" for line in lines)
