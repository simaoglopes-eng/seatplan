"""Ambience of one table for one booking, and its short sentences (spec 7.5)."""

import re
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.ambience.models import (
    AmbienceFixture,
    AmbienceOpening,
    AmbienceRoom,
    AmbienceSeat,
    AmbienceTable,
)
from app.ambience.table import seat_facing, table_ambience

LISBON = ZoneInfo("Europe/Lisbon")
LAT, LNG = 38.7223, -9.1393
OUTLINE = {
    "points": [
        {"x": 0, "y": 0, "curve": 0},
        {"x": 1000, "y": 0, "curve": 0},
        {"x": 1000, "y": 700, "curve": 0},
        {"x": 0, "y": 700, "curve": 0},
    ]
}
SIDE = {"north": 0, "east": 1, "south": 2, "west": 3}


def at(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 6, 21, hour, minute, tzinfo=LISBON)


def window(side: str = "south", **extra: object) -> AmbienceOpening:
    fields: dict = {"key": f"w-{side}", "side": SIDE[side], "offset": 300, "width": 400}
    fields.update(extra)
    return AmbienceOpening(kind="window", **fields)


def fixture(kind: str, x: float, y: float, w: float = 100, h: float = 60) -> AmbienceFixture:
    return AmbienceFixture(key=kind, kind=kind, shape="rect", x=x, y=y, w=w, h=h)


def room(*openings: AmbienceOpening, fixtures=(), outdoor: bool = False) -> AmbienceRoom:
    return AmbienceRoom(
        key="main",
        outline=OUTLINE,
        north_deg=0,
        is_outdoor=outdoor,
        openings=tuple(openings),
        fixtures=tuple(fixtures),
    )


def table(x: float, y: float, w: float = 80, h: float = 80) -> AmbienceTable:
    return AmbienceTable(key="t4", label="Table 4", shape="rect", x=x, y=y, w=w, h=h)


FRONT = table(460, 615)  # by the south wall
MIDDLE = table(460, 310)  # 3.1 m from every wall that has a window


def ambience(r: AmbienceRoom, t: AmbienceTable, start: datetime, minutes: int = 90):
    return table_ambience(r, t, LAT, LNG, start, start + timedelta(minutes=minutes))


# ---------------------------------------------------------------- sun over the stay


def test_sun_until_when_it_leaves_during_the_meal() -> None:
    lunch = window(sun_rule="between", sun_from=time(12), sun_until=time(14))
    result = ambience(room(lunch), FRONT, at(13))  # 13:00 to 14:30
    assert result.light == "sun"
    assert result.sun_minutes == 60
    assert result.sun_until == time(14, 0)
    assert result.phrases[0] == "Direct sun until 14:00"
    assert "sun" in result.features


def test_sun_for_the_whole_meal() -> None:
    lunch = window(sun_rule="between", sun_from=time(12), sun_until=time(16))
    result = ambience(room(lunch), FRONT, at(13))
    assert result.sun_minutes == 90 and result.sun_until is None
    assert result.phrases[0] == "Direct sun for your whole meal"


def test_sun_that_arrives_during_the_meal() -> None:
    later = window(sun_rule="between", sun_from=time(13, 30), sun_until=time(16))
    result = ambience(room(later), FRONT, at(13))
    assert result.light == "daylight"
    assert result.sun_from == time(13, 30) and result.sun_minutes == 60
    assert result.phrases[0] == "Sun reaches this table at 13:30"


def test_little_sun_is_not_a_sunny_table() -> None:
    brief = window(sun_rule="between", sun_from=time(12), sun_until=time(13, 15))
    result = ambience(room(brief), FRONT, at(13))
    assert result.sun_minutes == 15
    assert "sun" not in result.features and "shade" not in result.features


def test_no_sun_at_all_by_day_is_shade() -> None:
    result = ambience(room(window(sun_rule="never")), FRONT, at(13))
    assert result.sun_minutes == 0
    assert "shade" in result.features and "sun" not in result.features


# ---------------------------------------------------------------- evening


def test_it_gets_dark_during_a_meal_that_spans_sunset() -> None:
    result = ambience(room(window(sun_rule="never")), FRONT, at(20, 30), minutes=120)
    assert result.dark_at is not None and time(20, 55) <= result.dark_at <= time(21, 15)
    assert re.fullmatch(r"It gets dark at 2[01]:\d\d", result.phrases[0])


def test_sunset_from_your_seat_by_a_west_window() -> None:
    west = window("west", sun_rule="never")
    near_west = table(30, 310)
    result = ambience(room(west), near_west, at(20, 30), minutes=90)
    assert result.sunset_at is not None
    assert re.fullmatch(r"Sunset at 2[01]:\d\d from your seat", result.phrases[0])
    assert "sunset" in result.features


def test_no_sunset_promise_without_a_west_window() -> None:
    result = ambience(room(window(sun_rule="never")), FRONT, at(20, 30))
    assert result.sunset_at is None and "sunset" not in result.features


def test_night_inside_and_under_the_stars_outside() -> None:
    inside = ambience(room(window()), FRONT, at(22, 30))
    assert inside.light == "night" and inside.phrases[0] == "Evening: it will be dark outside"
    outside = ambience(room(outdoor=True), FRONT, at(22, 30))
    assert outside.phrases[0] == "Under the stars"
    assert "shade" not in inside.features


# ---------------------------------------------------------------- view


def test_view_from_a_window_within_two_metres() -> None:
    river = window(view_text="Tagus river", view_tags=("river",), sun_rule="never")
    close = ambience(room(river), FRONT, at(13))
    assert close.view is not None and close.view.text == "Tagus river"
    assert close.view.distance_cm == pytest.approx(5, abs=1)
    assert "View of the Tagus river" in close.phrases
    assert "view" in close.features
    assert ambience(room(river), MIDDLE, at(13)).view is None


def test_view_with_only_tags() -> None:
    garden = window(view_tags=("garden",), sun_rule="never")
    result = ambience(room(garden), FRONT, at(13))
    assert "Garden view" in result.phrases


def test_night_view_text_after_dark() -> None:
    bridge = window(view_text="Tagus river", night_view_text="The bridge lit up")
    result = ambience(room(bridge), FRONT, at(22, 30))
    assert result.view is not None and result.view.text == "The bridge lit up"
    assert "View of the bridge lit up" in result.phrases


def test_window_without_view_text_gives_no_view() -> None:
    assert ambience(room(window(sun_rule="never")), FRONT, at(13)).view is None


# ---------------------------------------------------------------- near, quiet


def test_next_to_the_bar_is_not_quiet() -> None:
    bar = fixture("bar", 460, 520)  # 35 cm in front of the table
    result = ambience(room(window(sun_rule="never"), fixtures=[bar]), FRONT, at(13))
    assert result.near == ("bar",)
    assert not result.quiet and "quiet" not in result.features
    assert "Next to the bar" in result.phrases


def test_far_from_everything_is_quiet_and_away_from_the_toilets() -> None:
    wc = fixture("wc", 0, 0)
    result = ambience(room(fixtures=[wc]), table(800, 560), at(13))
    assert result.near == () and result.quiet
    assert {"quiet", "away_from_wc"} <= set(result.features)
    assert "In a quiet corner" in result.phrases


def test_toilets_four_metres_away_are_not_near_but_not_away_either() -> None:
    wc = fixture("wc", 460, 135)  # 4 m from the table's top edge
    result = ambience(room(fixtures=[wc]), FRONT, at(13))
    assert "wc" not in result.near
    assert "away_from_wc" not in result.features


def test_main_entrance_counts_as_near_and_not_quiet() -> None:
    door = AmbienceOpening(
        key="d", side=2, offset=440, width=120, kind="door", is_main_entrance=True
    )
    result = ambience(room(door), FRONT, at(13))
    assert "entrance" in result.near and not result.quiet


def test_at_most_three_phrases_in_light_view_near_order() -> None:
    river = window(
        view_text="Tagus river", sun_rule="between", sun_from=time(12), sun_until=time(16)
    )
    bar = fixture("bar", 460, 520)
    result = ambience(room(river, fixtures=[bar]), FRONT, at(13))
    assert result.phrases == (
        "Direct sun for your whole meal",
        "View of the Tagus river",
        "Next to the bar",
    )


def test_a_stay_must_end_after_it_starts() -> None:
    with pytest.raises(ValueError):
        table_ambience(room(), FRONT, LAT, LNG, at(13), at(13))


# ---------------------------------------------------------------- the chosen seat


@pytest.mark.parametrize(
    ("seat_xy", "expected"),
    [
        ((500, 380), "Facing the window"),
        ((500, 500), "Back to the window"),
        ((440, 440), "Side-on to the window"),
    ],
)
def test_seat_facing_the_window(seat_xy: tuple[float, float], expected: str) -> None:
    middle = table(460, 400)  # centre (500, 440), 2.2 m from the south window
    seat = AmbienceSeat(key="s", table_key="t4", label="2", x=seat_xy[0], y=seat_xy[1])
    assert seat_facing(room(window()), middle, seat) == expected


def test_no_window_nearby_means_no_seat_sentence() -> None:
    seat = AmbienceSeat(key="s", table_key="t4", label="1", x=500, y=380)
    assert seat_facing(room(), table(460, 400), seat) is None
    assert seat_facing(room(window("north")), table(460, 400), seat) is None
