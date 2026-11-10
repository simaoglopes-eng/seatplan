"""The shared calendar invite: sender from EMAIL_FROM, stable UID, growing SEQUENCE."""

from datetime import UTC, datetime, timedelta

import pytest

from app.config import get_settings
from app.mail.invites import calendar_invite, invite_sequence

START = datetime(2027, 3, 14, 19, 30, tzinfo=UTC)


def _invite(cancelled: bool = False) -> str:
    return calendar_invite(
        kind="booking",
        public_id="Abc123def456",
        start=START,
        end=START + timedelta(hours=2),
        summary="Table at Casa Azul",
        location="Casa Azul",
        description="Party of 2",
        attendee_email="ana@example.com",
        cancelled=cancelled,
    )


def test_sender_comes_from_email_from(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EMAIL_FROM", "Casa Bookings <bookings@example.com>")
    get_settings.cache_clear()
    try:
        text = _invite()
    finally:
        get_settings.cache_clear()
    assert 'ORGANIZER;CN="Casa Bookings":mailto:bookings@example.com' in text


def test_confirm_and_cancel_share_one_uid() -> None:
    confirm, cancel = _invite(), _invite(cancelled=True)
    uid = "UID:booking-Abc123def456@seatplan.example.com"
    assert uid in confirm and uid in cancel
    assert "METHOD:PUBLISH" in confirm and "METHOD:CANCEL" in cancel


def test_sequence_grows_with_time() -> None:
    earlier = invite_sequence(START)
    later = invite_sequence(START + timedelta(seconds=1))
    assert later > earlier
    assert later < 2**31  # RFC 5545 INTEGER is 32-bit
