"""Direct sun through windows, sun patches and table light (spec 7.3 and 7.4)."""

from datetime import datetime, time
from zoneinfo import ZoneInfo

import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.ambience.geometry import Point, point_in_polygon
from app.ambience.light import (
    opening_facing,
    sun_patches,
    table_light,
    table_samples,
    window_has_sun,
)
from app.ambience.models import AmbienceFixture, AmbienceOpening, AmbienceRoom, AmbienceTable
from app.ambience.solar import SunPosition

LISBON = ZoneInfo("Europe/Lisbon")
LAT, LNG = 38.7223, -9.1393
SUMMER_LUNCH = datetime(2026, 6, 21, 13, 0, tzinfo=LISBON)
SUMMER_NIGHT = datetime(2026, 6, 21, 23, 0, tzinfo=LISBON)

# A 10 m x 7 m room drawn clockwise on screen. With north up, side 0 is the
# north wall, side 1 east, side 2 south and side 3 west.
OUTLINE = {
    "points": [
        {"x": 0, "y": 0, "curve": 0},
        {"x": 1000, "y": 0, "curve": 0},
        {"x": 1000, "y": 700, "curve": 0},
        {"x": 0, "y": 700, "curve": 0},
    ]
}
SIDE = {"north": 0, "east": 1, "south": 2, "west": 3}


def window(side: str, **extra: object) -> AmbienceOpening:
    fields: dict = {"key": f"w-{side}", "side": SIDE[side], "offset": 300, "width": 400}
    fields.update(extra)
    return AmbienceOpening(kind="window", **fields)


def room(*openings: AmbienceOpening, north: float | None = 0, **extra: object) -> AmbienceRoom:
    return AmbienceRoom(
        key="main", outline=OUTLINE, north_deg=north, openings=tuple(openings), **extra
    )


def table(x: float, y: float, w: float = 80, h: float = 80, shape: str = "rect") -> AmbienceTable:
    return AmbienceTable(key="t", label="Table 1", shape=shape, x=x, y=y, w=w, h=h)


# A table just inside the south wall, under a south window, and one at the back.
FRONT = table(460, 615)
BACK = table(460, 10)
MIDDLE = table(460, 310)


# ---------------------------------------------------------------- facing


def test_facing_follows_the_outward_normal_and_north() -> None:
    assert opening_facing(room(window("south")), window("south")) == pytest.approx(180)
    assert opening_facing(room(window("west")), window("west")) == pytest.approx(270)
    assert opening_facing(room(window("north")), window("north")) == pytest.approx(0)
    # North drawn pointing right: the screen's bottom wall now faces west.
    assert opening_facing(room(window("south"), north=90), window("south")) == pytest.approx(90)


def test_no_north_means_no_facing() -> None:
    assert opening_facing(room(window("south"), north=None), window("south")) is None


# ---------------------------------------------------------------- window rules


def test_south_window_has_sun_at_summer_lunch_and_north_window_does_not() -> None:
    south, north = window("south"), window("north")
    assert window_has_sun(room(south), south, LAT, LNG, SUMMER_LUNCH)
    assert not window_has_sun(room(north), north, LAT, LNG, SUMMER_LUNCH)


def test_no_window_has_sun_at_night() -> None:
    south = window("south")
    assert not window_has_sun(room(south), south, LAT, LNG, SUMMER_NIGHT)


def test_never_rule_has_no_sun() -> None:
    never = window("south", sun_rule="never")
    assert not window_has_sun(room(never), never, LAT, LNG, SUMMER_LUNCH)


def test_between_rule_limits_the_hours_but_physics_still_decides() -> None:
    between = window("south", sun_rule="between", sun_from=time(12), sun_until=time(15))
    assert window_has_sun(room(between), between, LAT, LNG, SUMMER_LUNCH)
    four_pm = datetime(2026, 6, 21, 16, 0, tzinfo=LISBON)
    assert not window_has_sun(room(between), between, LAT, LNG, four_pm)
    # Inside the hours but facing north: still no direct sun.
    north = window("north", sun_rule="between", sun_from=time(12), sun_until=time(15))
    assert not window_has_sun(room(north), north, LAT, LNG, SUMMER_LUNCH)


def test_no_north_means_no_sun() -> None:
    south = window("south")
    assert not window_has_sun(room(south, north=None), south, LAT, LNG, SUMMER_LUNCH)


def test_doors_never_let_sun_in() -> None:
    door = AmbienceOpening(key="d", side=2, offset=300, width=100, kind="door")
    assert not window_has_sun(room(door), door, LAT, LNG, SUMMER_LUNCH)


@pytest.mark.parametrize(("altitude", "expected"), [(3.0, False), (3.1, True), (45, True)])
def test_sun_must_be_more_than_three_degrees_high(altitude: float, expected: bool) -> None:
    south = window("south")
    sun = SunPosition(azimuth_deg=180, altitude_deg=altitude)
    assert window_has_sun(room(south), south, LAT, LNG, SUMMER_LUNCH, sun=sun) is expected


@pytest.mark.parametrize(
    ("azimuth", "expected"), [(260, True), (100, True), (261, False), (99, False)]
)
def test_sun_must_be_within_eighty_degrees_of_the_facing(azimuth: float, expected: bool) -> None:
    south = window("south")
    sun = SunPosition(azimuth_deg=azimuth, altitude_deg=40)
    assert window_has_sun(room(south), south, LAT, LNG, SUMMER_LUNCH, sun=sun) is expected


@given(st.floats(0, 360), st.floats(-90, 3))
def test_low_sun_never_shines_whatever_the_direction(azimuth: float, altitude: float) -> None:
    south = window("south")
    sun = SunPosition(azimuth_deg=azimuth, altitude_deg=altitude)
    assert not window_has_sun(room(south), south, LAT, LNG, SUMMER_LUNCH, sun=sun)


# ---------------------------------------------------------------- patches


def test_sun_patch_starts_at_the_window_and_reaches_into_the_room() -> None:
    south = window("south")
    patches = sun_patches(room(south), LAT, LNG, SUMMER_LUNCH)
    assert len(patches) == 1
    patch = patches[0]
    # Two corners lie on the wall at the window's ends (x 700 and 300, y 700).
    on_wall = sorted(round(p.x) for p in patch if round(p.y) == 700)
    assert on_wall == [300, 700]
    # High summer sun: the patch is short, well under 2 m deep.
    depth = 700 - min(p.y for p in patch)
    assert 20 < depth < 200


def test_low_sun_patch_is_capped_at_six_metres() -> None:
    south = window("south")
    sun = SunPosition(azimuth_deg=180, altitude_deg=4)
    (patch,) = sun_patches(room(south), LAT, LNG, SUMMER_LUNCH, sun=sun)
    assert 700 - min(p.y for p in patch) == pytest.approx(600, abs=1)


def test_no_patches_without_sun() -> None:
    south = window("south")
    assert sun_patches(room(south), LAT, LNG, SUMMER_NIGHT) == ()
    assert sun_patches(room(window("north")), LAT, LNG, SUMMER_LUNCH) == ()


def test_glass_wall_on_a_curved_side_gives_one_patch_per_segment() -> None:
    curved = {"points": [dict(p) for p in OUTLINE["points"]]}
    curved["points"][2]["curve"] = 150  # the south wall bulges outward
    glass = AmbienceOpening(key="g", side=2, offset=0, width=0, kind="glass_wall")
    curved_room = AmbienceRoom(key="main", outline=curved, north_deg=0, openings=(glass,))
    patches = sun_patches(curved_room, LAT, LNG, SUMMER_LUNCH)
    assert len(patches) == 16


# ---------------------------------------------------------------- table light


def test_table_samples_are_centre_and_four_corners() -> None:
    samples = table_samples(table(0, 0, 100, 50))
    assert samples[0] == Point(50, 25)
    assert set(samples[1:]) == {Point(0, 0), Point(100, 0), Point(100, 50), Point(0, 50)}
    round_samples = table_samples(table(0, 0, 100, 100, shape="round"))
    assert round_samples[0] == Point(50, 50)
    assert all(
        abs(((p.x - 50) ** 2 + (p.y - 50) ** 2) ** 0.5 - 50) < 1e-9 for p in round_samples[1:]
    )


def test_table_by_a_south_window_is_in_the_sun_at_summer_lunch() -> None:
    south = window("south")
    assert table_light(room(south), FRONT, LAT, LNG, SUMMER_LUNCH) == "sun"
    # The patch is short, so a table in the middle of the room is not in it.
    assert table_light(room(south), MIDDLE, LAT, LNG, SUMMER_LUNCH) == "interior"


def test_night_wins_over_everything() -> None:
    assert table_light(room(window("south")), FRONT, LAT, LNG, SUMMER_NIGHT) == "night"


def test_near_a_window_without_direct_sun_is_daylight() -> None:
    north = window("north")
    assert table_light(room(north), BACK, LAT, LNG, SUMMER_LUNCH) == "daylight"
    assert table_light(room(north), MIDDLE, LAT, LNG, SUMMER_LUNCH) == "interior"


def test_no_north_never_claims_sun() -> None:
    south = window("south")
    assert table_light(room(south, north=None), FRONT, LAT, LNG, SUMMER_LUNCH) == "daylight"


def test_sunset_by_a_west_window_in_the_last_45_minutes() -> None:
    west = window("west", sun_rule="never")
    near_west = table(30, 310)
    before_sunset = datetime(2026, 6, 21, 20, 40, tzinfo=LISBON)  # sunset is about 21:05
    afternoon = datetime(2026, 6, 21, 18, 0, tzinfo=LISBON)
    assert table_light(room(west), near_west, LAT, LNG, before_sunset) == "sunset"
    assert table_light(room(west), near_west, LAT, LNG, afternoon) == "daylight"
    # A south window is not a sunset window.
    south = window("south", sun_rule="never")
    assert table_light(room(south), FRONT, LAT, LNG, before_sunset) == "daylight"


def test_outdoor_room_is_sunny_except_under_an_awning() -> None:
    awning = AmbienceFixture(key="a", kind="awning", shape="rect", x=0, y=0, w=500, h=700)
    terrace = room(is_outdoor=True, fixtures=(awning,))
    assert table_light(terrace, table(700, 300), LAT, LNG, SUMMER_LUNCH) == "sun"
    assert table_light(terrace, table(100, 300), LAT, LNG, SUMMER_LUNCH) == "shade"
    assert table_light(terrace, table(100, 300), LAT, LNG, SUMMER_NIGHT) == "night"


def test_outdoor_patch_is_the_whole_room_when_the_sun_is_up() -> None:
    terrace = room(is_outdoor=True)
    (patch,) = sun_patches(terrace, LAT, LNG, SUMMER_LUNCH)
    assert point_in_polygon(Point(500, 350), patch)
    assert sun_patches(terrace, LAT, LNG, SUMMER_NIGHT) == ()


def test_polar_day_is_never_night() -> None:
    tromso = ZoneInfo("Europe/Oslo")
    midnight = datetime(2026, 6, 21, 0, 30, tzinfo=tromso)
    light = table_light(room(window("north")), BACK, 69.65, 18.96, midnight)
    assert light != "night"
