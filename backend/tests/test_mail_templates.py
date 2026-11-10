"""Email templates: escaping, manage link in both versions, footer, subject safety."""

from datetime import UTC, datetime

import pytest

from app.mail import templates
from app.mail.templates import EmailParts

LINK = "https://seatplan.example.com/b/abc123?x=1&y=2"
EVIL_NAME = '<script>alert("hi")</script> Ana'


def _all_templates(name: str, link: str = LINK) -> list[EmailParts]:
    when = "Sat 14 Mar 2027, 19:30"
    return [
        templates.event_seat_confirmation(name, "Spring Gala", "Main Hall", when, "A3", "T1", link),
        templates.event_seat_change(name, "Spring Gala", when, "A3", "B7", link),
        templates.event_seat_cancellation(name, "Spring Gala", when, "A3", link),
        templates.event_reminder(name, "Spring Gala", "Main Hall", when, None, link),
        templates.event_reminder(name, "Spring Gala", "Main Hall", when, "A3", link),
        templates.booking_confirmation(name, "Casa Azul", when, 4, "T5", link),
        templates.booking_change(name, "Casa Azul", when, 2, "T2", link),
        templates.booking_cancellation(name, "Casa Azul", when, 1, link),
        templates.booking_reminder(name, "Casa Azul", when, 4, "T5", link),
        templates.waitlist_offer(name, "Casa Azul", when, 3, "20:00", link),
    ]


def test_every_template_escapes_a_name_containing_html() -> None:
    for parts in _all_templates(EVIL_NAME):
        assert "<script>" not in parts.body_html
        assert "&lt;script&gt;alert(&quot;hi&quot;)&lt;/script&gt; Ana" in parts.body_html
        # The plain-text version is not HTML, so it shows the name as typed.
        assert EVIL_NAME in parts.body_text


def test_text_and_html_both_contain_the_manage_link() -> None:
    for parts in _all_templates("Ana Silva"):
        assert LINK in parts.body_text
        # In HTML the "&" of the query string must be written as "&amp;".
        assert 'href="https://seatplan.example.com/b/abc123?x=1&amp;y=2"' in parts.body_html


def test_footer_says_why_and_how_to_stop() -> None:
    for parts in _all_templates("Ana Silva"):
        for body in (parts.body_text, parts.body_html):
            assert "You received this email because" in body
            assert "To stop these emails" in body
            assert "SeatPlan" in body


def test_html_is_single_column_and_mobile_friendly() -> None:
    parts = _all_templates("Ana Silva")[0]
    assert 'name="viewport"' in parts.body_html
    assert "max-width:560px" in parts.body_html
    assert "<img" not in parts.body_html


def test_subject_is_one_line_and_not_too_long() -> None:
    parts = templates.booking_confirmation(
        "Ana", "Casa\r\nBcc: x@example.com" + "x" * 300, "today", 2, "T1", LINK
    )
    assert "\n" not in parts.subject and "\r" not in parts.subject
    assert len(parts.subject) <= templates.MAX_SUBJECT_LENGTH


def test_unsafe_link_is_refused() -> None:
    with pytest.raises(ValueError):
        templates.booking_confirmation("Ana", "Casa Azul", "today", 2, "T1", "javascript:alert(1)")


def test_unpacks_as_a_plain_tuple() -> None:
    subject, text, html = templates.booking_cancellation("Ana", "Casa Azul", "today", 2, LINK)
    assert subject.startswith("Booking cancelled") and text and html


def test_format_when_uses_the_venue_time_zone() -> None:
    moment = datetime(2027, 7, 1, 18, 30, tzinfo=UTC)
    # Lisbon is UTC+1 in summer.
    assert templates.format_when(moment, "Europe/Lisbon") == "Thu 01 Jul 2027, 19:30"


def test_waitlist_offer_without_a_hold_does_not_promise_one() -> None:
    parts = templates.waitlist_offer("Ana", "Casa Azul", "Sat 14 Mar 2027, 19:30", 2, None, LINK)
    assert "not held" in parts.body_text
    assert "held for you until" not in parts.body_text
