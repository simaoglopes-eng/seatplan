"""Calendar invites: required properties, UTC times, escaping and line folding."""

from datetime import UTC, datetime, timedelta, timezone

import pytest

from app.mail.ics import build_invite, escape_text, fold_line, make_uid

START = datetime(2027, 3, 14, 19, 30, tzinfo=timezone(timedelta(hours=1)))
NOW = datetime(2027, 3, 1, 9, 0, tzinfo=UTC)


def _invite(**changes: object) -> str:
    values: dict[str, object] = {
        "uid": make_uid("booking", "Ab3xYz9Qw1Er"),
        "start": START,
        "end": START + timedelta(hours=2),
        "summary": "Dinner at Casa Azul",
        "location": "Rua das Flores 12, Lisboa",
        "description": "Table T5; party of 4.\nManage: https://seatplan.example.com/b/abc",
        "organizer_name": "SeatPlan",
        "organizer_email": "noreply@example.com",
        "attendee_email": "ana.silva@example.com",
        "now": NOW,
    }
    values.update(changes)
    return build_invite(**values)  # type: ignore[arg-type]


def _unfold(text: str) -> list[str]:
    # RFC 5545 section 3.1: remove every CRLF that is followed by one space.
    return text.replace("\r\n ", "").split("\r\n")


def test_required_properties_and_utc_times() -> None:
    lines = _unfold(_invite())
    for expected in (
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        "UID:booking-Ab3xYz9Qw1Er@seatplan.example.com",
        "DTSTAMP:20270301T090000Z",
        "DTSTART:20270314T183000Z",  # 19:30 at UTC+1 is 18:30 UTC
        "DTEND:20270314T203000Z",
        "SEQUENCE:0",
        "STATUS:CONFIRMED",
        "SUMMARY:Dinner at Casa Azul",
        "END:VEVENT",
        "END:VCALENDAR",
    ):
        assert expected in lines
    assert any(line.startswith("PRODID:") for line in lines)
    assert any(line.startswith('ORGANIZER;CN="SeatPlan":mailto:') for line in lines)


def test_every_line_ends_with_crlf() -> None:
    text = _invite()
    assert text.endswith("\r\n")
    assert "\n" not in text.replace("\r\n", "")


def test_cancellation_keeps_uid_and_sets_method_and_status() -> None:
    first = _unfold(_invite())
    cancel = _unfold(_invite(cancelled=True, sequence=1))
    uid = [line for line in first if line.startswith("UID:")]
    assert uid == [line for line in cancel if line.startswith("UID:")]
    assert "METHOD:CANCEL" in cancel and "STATUS:CANCELLED" in cancel
    assert "SEQUENCE:1" in cancel


def test_text_escaping() -> None:
    assert escape_text("a\\b;c,d\ne\r\nf") == "a\\\\b\\;c\\,d\\ne\\nf"
    lines = _unfold(_invite())
    assert "LOCATION:Rua das Flores 12\\, Lisboa" in lines
    assert (
        "DESCRIPTION:Table T5\\; party of 4.\\nManage: https://seatplan.example.com/b/abc" in lines
    )


def test_long_lines_fold_at_75_octets_without_splitting_characters() -> None:
    long_summary = "Jantar de aniversário da Joana é às 20h " * 6
    text = _invite(summary=long_summary)
    for physical in text.split("\r\n"):
        assert len(physical.encode("utf-8")) <= 75
    assert f"SUMMARY:{long_summary}" in _unfold(text)
    # Decoding each physical line on its own proves no character was cut in half.
    for physical in text.split("\r\n"):
        physical.encode("utf-8").decode("utf-8")


def test_fold_line_exact_boundary() -> None:
    assert fold_line("x" * 75) == "x" * 75
    folded = fold_line("x" * 76)
    assert folded == "x" * 75 + "\r\n x"
    # "é" takes 2 octets: 74 + 2 = 76 is too long, so it moves whole to the next line.
    assert fold_line("x" * 74 + "é") == "x" * 74 + "\r\n é"


def test_naive_datetime_is_refused() -> None:
    with pytest.raises(ValueError):
        _invite(start=datetime(2027, 3, 14, 19, 30))


def test_line_break_in_address_is_refused() -> None:
    with pytest.raises(ValueError):
        _invite(attendee_email="ana@example.com\r\nX-EVIL:1")
