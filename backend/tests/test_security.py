"""Passwords, tokens, signed sessions and the database-backed rate limit."""

import time

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.security import (
    SESSION_HOURS,
    create_session_token,
    hash_password,
    hash_token,
    new_token,
    rate_limit,
    verify_password,
    verify_session_token,
)


def test_password_round_trip() -> None:
    stored = hash_password("correct horse battery")
    assert stored.startswith("scrypt$")
    assert "correct horse" not in stored
    assert verify_password("correct horse battery", stored)
    assert not verify_password("wrong horse battery", stored)


def test_same_password_gets_different_salts() -> None:
    assert hash_password("same") != hash_password("same")


@pytest.mark.parametrize(
    "stored", ["", "plain", "scrypt$1$2$3", "bcrypt$1$2$3$aa$bb", "scrypt$x$8$1$aa$bb"]
)
def test_malformed_hash_never_verifies(stored: str) -> None:
    assert not verify_password("anything", stored)


def test_tokens_are_random_and_hashed() -> None:
    first, second = new_token(), new_token()
    assert first != second
    assert len(first) >= 40
    assert hash_token(first) == hash_token(first)
    assert hash_token(first) != first
    assert len(hash_token(first)) == 64


def test_session_token_round_trip(database_url: str) -> None:
    assert verify_session_token(create_session_token(42)) == 42


def test_session_token_expires(database_url: str) -> None:
    issued = time.time() - SESSION_HOURS * 3600 - 1
    assert verify_session_token(create_session_token(42, now=issued)) is None


def test_session_token_just_before_expiry_still_works(database_url: str) -> None:
    issued = time.time() - SESSION_HOURS * 3600 + 60
    assert verify_session_token(create_session_token(42, now=issued)) == 42


def test_tampered_user_id_is_rejected(database_url: str) -> None:
    _user_id, expires, signature = create_session_token(42).split(".")
    assert verify_session_token(f"43.{expires}.{signature}") is None


def test_extended_expiry_is_rejected(database_url: str) -> None:
    user_id, expires, signature = create_session_token(42).split(".")
    assert verify_session_token(f"{user_id}.{int(expires) + 3600}.{signature}") is None


def test_token_signed_with_another_key_is_rejected(
    database_url: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.config import get_settings

    token = create_session_token(42)
    monkeypatch.setenv("SECRET_KEY", "a-completely-different-key-of-40-characters")
    get_settings.cache_clear()
    assert verify_session_token(token) is None


@settings(max_examples=200)
@given(st.text(max_size=120))
def test_random_strings_never_verify(text: str) -> None:
    # No database or settings needed for most strings; a forged signature
    # must never pass, whatever the input looks like.
    assert verify_session_token(text) is None


def test_rate_limit_blocks_after_limit(session: Session) -> None:
    for _ in range(3):
        rate_limit(session, "login:1.2.3.4", limit=3, window_s=60)
    with pytest.raises(ApiError) as caught:
        rate_limit(session, "login:1.2.3.4", limit=3, window_s=60)
    assert caught.value.status == 429
    assert caught.value.code == "rate_limited"


def test_rate_limit_keys_are_independent(session: Session) -> None:
    for _ in range(3):
        rate_limit(session, "login:1.1.1.1", limit=3, window_s=60)
    rate_limit(session, "login:2.2.2.2", limit=3, window_s=60)


def test_rate_limit_resets_in_next_window(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    start = 1_800_000_000.0  # a fixed moment at the start of a 60 s window
    monkeypatch.setattr(time, "time", lambda: start)
    for _ in range(3):
        rate_limit(session, "k", limit=3, window_s=60)
    monkeypatch.setattr(time, "time", lambda: start + 61)
    rate_limit(session, "k", limit=3, window_s=60)


def test_rate_limit_window_is_fixed_so_a_boundary_allows_a_burst(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Documents a known limit of the fixed window: calls at the end of one
    # window and the start of the next are counted apart, so up to twice the
    # limit can pass in a short moment. Accepted for a demo (see rate_limit).
    end_of_window = 1_800_000_059.0
    monkeypatch.setattr(time, "time", lambda: end_of_window)
    for _ in range(3):
        rate_limit(session, "burst", limit=3, window_s=60)
    monkeypatch.setattr(time, "time", lambda: end_of_window + 1)
    for _ in range(3):
        rate_limit(session, "burst", limit=3, window_s=60)
    with pytest.raises(ApiError):
        rate_limit(session, "burst", limit=3, window_s=60)
