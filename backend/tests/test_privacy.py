"""Display-name rules for attendees."""

import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.core.privacy import ANONYMOUS_LABEL, PRIVACY_MODES, display_name


@pytest.mark.parametrize(
    ("name", "mode", "expected"),
    [
        ("Ana Silva", "full_name", "Ana Silva"),
        ("  Ana   Silva ", "full_name", "Ana Silva"),
        ("Ana Silva", "first_initial", "Ana S."),
        ("Ana Maria Costa Silva", "first_initial", "Ana S."),
        ("Ana", "first_initial", "Ana"),
        ("Ana Silva", "anonymous", ANONYMOUS_LABEL),
        ("", "full_name", ANONYMOUS_LABEL),
    ],
)
def test_display_name_modes(name: str, mode: str, expected: str) -> None:
    assert display_name(name, mode, wants_anonymous=False) == expected


@given(st.text(max_size=60), st.sampled_from(PRIVACY_MODES))
def test_guest_who_wants_anonymity_is_always_hidden(name: str, mode: str) -> None:
    assert display_name(name, mode, wants_anonymous=True) == ANONYMOUS_LABEL


@given(st.lists(st.text(alphabet="abcdefghij", min_size=2, max_size=8), min_size=2, max_size=4))
def test_first_initial_never_shows_the_full_last_name(parts: list[str]) -> None:
    shown = display_name(" ".join(parts), "first_initial", wants_anonymous=False)
    assert shown == f"{parts[0]} {parts[-1][0]}."


def test_unknown_mode_is_an_error() -> None:
    with pytest.raises(ValueError):
        display_name("Ana Silva", "everything", wants_anonymous=False)
