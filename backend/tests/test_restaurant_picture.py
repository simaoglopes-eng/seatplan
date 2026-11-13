"""The mini-map in a restaurant confirmation email (spec 10).

A pure function draws the room from above: curved or L-shaped walls, windows
and doors, fixed items, every table alike except the booked one, and the
chosen chair marked. The inputs have no field for a person, so no name can
appear. The tests decode the PNG and look at real pixels.
"""

import struct
import time
import zlib

import pytest

from app.ambience.models import (
    AmbienceFixture,
    AmbienceOpening,
    AmbienceRoom,
    AmbienceSeat,
    AmbienceTable,
)
from app.mail import restaurant_picture as pic
from app.mail.png import png_width

SQUARE = {
    "points": [
        {"x": 0, "y": 0, "curve": 0},
        {"x": 1000, "y": 0, "curve": 0},
        {"x": 1000, "y": 600, "curve": 0},
        {"x": 0, "y": 600, "curve": 0},
    ]
}
BULGING = {  # the south side (index 2, from (1000, 600) to (0, 600)) bulges outwards
    "points": [
        {"x": 0, "y": 0, "curve": 0},
        {"x": 1000, "y": 0, "curve": 0},
        {"x": 1000, "y": 500, "curve": 100},
        {"x": 0, "y": 500, "curve": 0},
    ]
}
L_SHAPE = {
    "points": [
        {"x": 0, "y": 0, "curve": 0},
        {"x": 1000, "y": 0, "curve": 0},
        {"x": 1000, "y": 300, "curve": 0},
        {"x": 400, "y": 300, "curve": 0},
        {"x": 400, "y": 600, "curve": 0},
        {"x": 0, "y": 600, "curve": 0},
    ]
}


def decode(png: bytes) -> tuple[int, int, bytes, list[tuple[int, int, int]]]:
    """(width, height, pixel indexes, palette) of a PNG written by encode_indexed."""
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    position, chunks = 8, {}
    while position < len(png):
        (length,) = struct.unpack(">I", png[position : position + 4])
        kind = png[position + 4 : position + 8]
        chunks[kind] = png[position + 8 : position + 8 + length]
        position += 12 + length
    width, height = struct.unpack(">II", chunks[b"IHDR"][:8])
    raw = zlib.decompress(chunks[b"IDAT"])
    rows = [raw[y * (width + 1) + 1 : (y + 1) * (width + 1)] for y in range(height)]
    plte = chunks[b"PLTE"]
    palette = [tuple(plte[i : i + 3]) for i in range(0, len(plte), 3)]
    return width, height, b"".join(rows), palette


class Picture:
    """A decoded picture with helpers to ask 'what colour is room point (x, y)?'."""

    def __init__(self, png: bytes, room: AmbienceRoom) -> None:
        self.width, self.height, self.pixels, self.palette = decode(png)
        self.layout = pic.restaurant_layout(room)

    def at(self, x: float, y: float) -> int:
        px, py = pic.to_pixel(self.layout, x, y)
        return self.pixels[py * self.width + px]

    def colours(self) -> set[int]:
        return set(self.pixels)


def room(outline=SQUARE, openings=(), fixtures=(), outdoor: bool = False) -> AmbienceRoom:
    return AmbienceRoom(
        key=1,
        outline=outline,
        north_deg=0,
        is_outdoor=outdoor,
        openings=tuple(openings),
        fixtures=tuple(fixtures),
    )


def table(key, x, y, w=120, h=90, shape="rect", rotation=0.0, label=None) -> AmbienceTable:
    return AmbienceTable(key, label or f"T{key}", shape, x, y, w, h, rotation)


def seat(key, table_key, x, y) -> AmbienceSeat:
    return AmbienceSeat(key, table_key, str(key), x, y)


TABLES = (table(1, 150, 150), table(2, 650, 150, label="Ana Silva"), table(3, 400, 400))
SEATS = (seat(10, 1, 210, 135), seat(11, 1, 210, 255), seat(20, 2, 710, 135), seat(30, 3, 460, 385))


def render(r: AmbienceRoom, chosen=1, chair=10, tables=TABLES, seats=SEATS, **words) -> Picture:
    png = pic.render_restaurant_picture(r, tables, seats, chosen, chair, **words)
    return Picture(png, r)


# ---------------------------------------------------------------- size and walls


def test_it_is_a_png_at_most_640_wide_with_a_header_band() -> None:
    png = pic.render_restaurant_picture(room(), TABLES, SEATS, 1, 10)
    picture = Picture(png, room())
    assert png_width(png) == picture.width == 640
    assert picture.height > pic.HEADER + 100


def test_a_curved_wall_bulges_past_the_chord() -> None:
    r = room(BULGING)
    picture = render(r)
    # Mid-south at y = 540: outside the chord (y = 500) but inside the arc.
    assert picture.at(500, 540) == pic.FLOOR
    assert picture.at(500, 610) == pic.BACKGROUND  # just beyond the arc


def test_an_l_shaped_room_leaves_the_notch_empty() -> None:
    picture = render(room(L_SHAPE), tables=(table(1, 100, 100),), seats=(seat(10, 1, 160, 100),))
    assert picture.at(200, 450) == pic.FLOOR  # the foot of the L
    assert picture.at(800, 450) == pic.BACKGROUND  # the notch
    assert picture.at(800, 150) == pic.FLOOR  # the arm of the L


def test_walls_are_drawn_dark_and_outdoor_floor_differs() -> None:
    inside = render(room())
    assert inside.at(500, 0) == pic.INK
    outdoor = render(room(outdoor=True))
    assert outdoor.at(800, 450) == pic.TERRACE


# ---------------------------------------------------------------- openings and fixtures


def test_windows_are_a_thick_light_blue_line_in_the_wall() -> None:
    window = AmbienceOpening(key=1, side=2, offset=300, width=400, kind="window")
    picture = render(room(openings=[window]))
    assert picture.at(500, 600) == pic.WINDOW  # the south wall, in the middle of the window
    assert picture.at(900, 600) == pic.INK  # the same wall past the window


def test_a_glass_wall_covers_its_whole_side() -> None:
    glass = AmbienceOpening(key=1, side=1, offset=0, width=0, kind="glass_wall")
    picture = render(room(openings=[glass]))
    assert picture.at(1000, 80) == pic.WINDOW
    assert picture.at(1000, 520) == pic.WINDOW


def test_a_door_leaves_a_gap_in_the_wall() -> None:
    door = AmbienceOpening(key=1, side=0, offset=400, width=120, kind="door")
    picture = render(room(openings=[door]))
    assert picture.at(460, 0) == pic.DOOR
    assert picture.at(800, 0) == pic.INK


def test_fixed_items_are_light_grey_and_named() -> None:
    bar = AmbienceFixture(1, "bar", "rect", 700, 400, 250, 150)
    picture = render(room(fixtures=[bar]))
    assert picture.at(710, 410) == pic.FIXTURE  # a corner, clear of the label
    # The word BAR is written in the middle, so the middle holds ink too.
    inked = {picture.at(x, 475) for x in range(780, 880, 4)}
    assert pic.FIXTURE_TEXT in inked


def test_a_round_fixture_is_round() -> None:
    plant = AmbienceFixture(1, "plant", "circle", 700, 400, 200, 200)
    picture = render(room(fixtures=[plant]))
    assert picture.at(800, 430) == pic.FIXTURE  # above the name in the middle
    assert picture.at(705, 405) == pic.FLOOR  # the square's corner is not part of a circle


# ---------------------------------------------------------------- tables and seats


def test_only_the_booked_table_is_highlighted() -> None:
    picture = render(room(), chosen=1)
    assert picture.at(160, 160) == pic.CHOSEN_TABLE
    assert picture.at(660, 160) == pic.TABLE  # table 2
    assert picture.at(410, 410) == pic.TABLE  # table 3 looks exactly like table 2


def test_other_tables_look_the_same_whatever_their_labels() -> None:
    first = render(room(), chosen=1)
    swapped = (
        table(1, 150, 150),
        table(2, 650, 150, label="Zed"),
        table(3, 400, 400, label="Queen"),
    )
    second = render(room(), chosen=1, tables=swapped)
    assert first.at(660, 160) == second.at(660, 160) == pic.TABLE
    assert first.at(410, 410) == second.at(410, 410) == pic.TABLE


def test_the_chosen_chair_gets_the_marker_and_other_chairs_are_hollow() -> None:
    picture = render(room(), chair=10)
    assert picture.at(210, 135) == pic.INK  # the marker's dot
    assert pic.MARK_RING in picture.colours()
    assert picture.at(710, 135) != pic.INK  # another chair: a small hollow ring, not the dot


def test_without_a_chair_only_the_table_is_marked() -> None:
    png = pic.render_restaurant_picture(room(), TABLES, SEATS, 1, None)
    picture = Picture(png, room())
    assert pic.MARK_RING not in picture.colours()
    assert picture.at(160, 160) == pic.CHOSEN_TABLE


def test_a_rotated_round_table_draws() -> None:
    tables = (table(1, 400, 250, w=160, h=160, shape="round", rotation=30.0),)
    picture = render(room(), tables=tables, seats=(), chair=None)
    assert picture.at(480, 330) == pic.CHOSEN_TABLE
    assert picture.at(402, 252) == pic.FLOOR  # outside the circle


def test_unknown_table_or_foreign_chair_is_refused() -> None:
    with pytest.raises(ValueError, match="table"):
        pic.render_restaurant_picture(room(), TABLES, SEATS, 99, None)
    with pytest.raises(ValueError, match="chair"):
        pic.render_restaurant_picture(room(), TABLES, SEATS, 1, 20)  # chair 20 is at table 2
    with pytest.raises(ValueError, match="chair"):
        pic.render_restaurant_picture(room(), TABLES, SEATS, 1, 777)


# ---------------------------------------------------------------- words and privacy


def test_the_header_names_room_table_and_chair() -> None:
    text, scale = pic.header_text("Main room", "4", "2", 640)
    assert text == "MAIN ROOM - TABLE 4 - SEAT 2" and scale == 2


def test_the_header_degrades_for_what_the_font_cannot_write() -> None:
    assert pic.header_text("Salão", "T4", None, 640)[0] == "TABLE T4"
    assert pic.header_text("Main room", "Mesa 4 ç", "2", 640)[0] == "MAIN ROOM - YOUR TABLE"
    long_text, scale = pic.header_text("A" * 80, "T4", "2", 300)
    assert pic.pixel_font.text_width(long_text, scale) <= 300 - 2 * pic.PADDING


def test_the_inputs_have_no_place_for_a_person() -> None:
    fields = {
        name
        for kind in (AmbienceRoom, AmbienceTable, AmbienceSeat, AmbienceFixture, AmbienceOpening)
        for name in kind.__dataclass_fields__
    }
    assert not {"name", "email", "guest", "booking", "phone", "party"} & fields


# ---------------------------------------------------------------- stability


def test_the_same_input_gives_the_same_bytes() -> None:
    first = pic.render_restaurant_picture(room(BULGING), TABLES, SEATS, 1, 10, room_name="Main")
    again = pic.render_restaurant_picture(room(BULGING), TABLES, SEATS, 1, 10, room_name="Main")
    assert first == again


def test_a_busy_room_is_drawn_quickly() -> None:
    many = tuple(table(i, 20 + (i % 10) * 95, 20 + (i // 10) * 90, 60, 50) for i in range(1, 61))
    chairs = tuple(seat(i, i, 30 + (i % 10) * 95, 20 + (i // 10) * 90) for i in range(1, 61))
    started = time.perf_counter()
    pic.render_restaurant_picture(room(), many, chairs, 7, 7)
    assert time.perf_counter() - started < 2.0
