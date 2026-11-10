"""Guest list import and export as CSV.

Import never trusts the file: it is size-capped, must be UTF-8, may only use
the known columns, and every row goes through the same GuestIn checks as a
guest added by hand. If any row is wrong, nothing is imported and every bad
row is reported, so the organiser fixes the file once and imports again.

Export protects spreadsheet users: a cell that starts with = + - @ could run
as a formula in Excel, so such cells get a leading apostrophe.
"""

import csv
import io
from typing import Any

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.events_service.guests import email_in_use, group_names
from app.events_service.problem import current_rows, event_guests
from app.events_service.schemas import GuestIn
from app.models import Event, Seat, VenueTable

MAX_BYTES = 200_000
MAX_ROWS = 1000
MAX_ERRORS = 50  # enough to fix a file; a longer list helps nobody
COLUMNS = (
    "name",
    "email",
    "group",
    "keep_adjacent",
    "needs_accessible",
    "dietary_note",
    "reserved_tag",
    "wants_anonymous",
)
BOOLEAN_COLUMNS = ("keep_adjacent", "needs_accessible", "wants_anonymous")
TRUE_WORDS = ("yes", "y", "true", "1")
FALSE_WORDS = ("no", "n", "false", "0", "")
EXPORT_COLUMNS = (
    "name",
    "email",
    "group",
    "rsvp",
    "table",
    "seat",
    "needs_accessible",
    "dietary_note",
    "reserved_tag",
)


class ImportProblem(Exception):
    """The file as a whole cannot be read (too big, not text, bad header)."""


def decode(raw: bytes) -> str:
    if len(raw) > MAX_BYTES:
        raise ImportProblem(f"The file is larger than {MAX_BYTES // 1000} KB.")
    try:
        # utf-8-sig also accepts the invisible marker Excel puts at the start.
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise ImportProblem("The file must be a UTF-8 text (CSV) file.") from None


def read_rows(text: str) -> list[dict[str, str]]:
    reader = csv.DictReader(io.StringIO(text))
    header = [name.strip().lower() for name in (reader.fieldnames or [])]
    if "name" not in header:
        raise ImportProblem("The first line must name the columns and include 'name'.")
    unknown = sorted(set(header) - set(COLUMNS))
    if unknown:
        raise ImportProblem(f"Unknown columns: {', '.join(unknown)}.")
    reader.fieldnames = header
    rows: list[dict[str, str]] = []
    try:
        for row in reader:
            if len(rows) >= MAX_ROWS:
                raise ImportProblem(f"The file has more than {MAX_ROWS} guests.")
            if None in row:  # more cells than column names
                raise ImportProblem(f"Line {reader.line_num} has too many cells.")
            rows.append({key: (value or "").strip() for key, value in row.items()})
    except csv.Error as error:
        raise ImportProblem(f"The file is not valid CSV: {error}") from None
    return rows


def _to_bool(value: str, column: str) -> bool:
    word = value.lower()
    if word in TRUE_WORDS:
        return True
    if word in FALSE_WORDS:
        return False
    raise ValueError(f"{column}: write yes or no")


def row_to_guest(row: dict[str, str]) -> GuestIn:
    """Raise ValueError (or ValidationError) with a readable reason."""
    data: dict[str, Any] = {key: value for key, value in row.items() if value != ""}
    for column in BOOLEAN_COLUMNS:
        if column in data:
            data[column] = _to_bool(data[column], column)
    if "reserved_tag" in data:
        data["reserved_tag"] = data["reserved_tag"].lower()
    return GuestIn.model_validate(data)


def _reason(error: Exception) -> str:
    if isinstance(error, ValidationError):
        first = error.errors()[0]
        where = ".".join(str(part) for part in first.get("loc", ()))
        return f"{where}: {first.get('msg', 'invalid value')}"
    return str(error)


def validate_rows(
    session: Session, event: Event, rows: list[dict[str, str]]
) -> tuple[list[GuestIn], list[dict[str, Any]]]:
    """(valid guests, errors). Line 1 is the header, so data starts on line 2."""
    guests: list[GuestIn] = []
    errors: list[dict[str, Any]] = []
    seen_emails: set[str] = set()
    for line, row in enumerate(rows, start=2):
        try:
            guest = row_to_guest(row)
            email = (guest.email or "").lower()
            if email and (email in seen_emails or email_in_use(session, event, guest.email or "")):
                raise ValueError(f"email: {guest.email} appears twice or is already a guest")
        except (ValueError, ValidationError) as error:
            if len(errors) < MAX_ERRORS:
                errors.append({"line": line, "message": _reason(error)})
            continue
        seen_emails.add(email)
        guests.append(guest)
    return guests, errors


def safe_cell(value: object) -> str:
    text = "" if value is None else str(value)
    if text[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + text
    return text


def export_csv(session: Session, event: Event) -> str:
    rows = current_rows(session, event)
    groups = group_names(session, event)
    seats = {
        seat.id: seat
        for seat in session.scalars(select(Seat).where(Seat.venue_id == event.venue_id))
    }
    tables = {
        table.id: table.label
        for table in session.scalars(
            select(VenueTable).where(VenueTable.venue_id == event.venue_id)
        )
    }
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(EXPORT_COLUMNS)
    for guest in event_guests(session, event):
        if guest.token_revoked_at is not None:
            continue  # erased guests have nothing left to export
        seat = seats.get(rows[guest.id].seat_id) if guest.id in rows else None
        values = (
            guest.name,
            guest.email,
            groups.get(guest.group_id or 0),
            guest.rsvp,
            tables.get(seat.table_id) if seat else "",
            seat.label if seat else "",
            "yes" if guest.needs_accessible else "no",
            guest.dietary_note,
            guest.reserved_tag,
        )
        writer.writerow([safe_cell(value) for value in values])
    return out.getvalue()
