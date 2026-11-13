"""The mini-map in a restaurant confirmation email: the room from above (spec 10).

render_restaurant_picture(room, tables, seats, table_key, seat_key) returns
PNG bytes. It draws the room's real outline (straight, curved or L-shaped),
windows as a thick light blue line, doors as a gap, fixed items in light grey
with their name, every table alike except the booked one, and the chosen
chair marked like the event seat picture does. Pure: the inputs are the
ambience engine's frozen values, which have no field for a person, so the
picture cannot show anyone's name.

It reuses the event picture's canvas, marker and table outline (seat_picture.py,
unchanged) and adds what a restaurant needs: a fill that works for rooms that
are not convex, and thick wall lines. Gmail and Outlook do not show SVG, so
the result is a PNG written by mail/png.py with no library.
"""

import math
from collections.abc import Sequence

from app.ambience.geometry import Point, outline_polygon
from app.ambience.light import opening_segments, table_polygon
from app.ambience.models import (
    AmbienceFixture,
    AmbienceRoom,
    AmbienceSeat,
    AmbienceTable,
)
from app.mail import pixel_font
from app.mail.png import encode_indexed
from app.mail.seat_picture import (
    HEADER,
    PADDING,
    SEAT_RADIUS,
    Canvas,
    Layout,
    PictureTable,
    _draw_marker,
    _table_outline,
    picture_size,
    to_pixel,
)

# Index -> (red, green, blue). The first eight keep the meaning they have in
# seat_picture.py, because the shared marker is drawn with those indexes.
PALETTE: tuple[tuple[int, int, int], ...] = (
    (0xFF, 0xFF, 0xFF),  # 0 background
    (0x18, 0x18, 0x1B),  # 1 walls, the marker's dot and ticks, the tag
    (0xF4, 0xF4, 0xF5),  # 2 floor
    (0xA1, 0xA1, 0xAA),  # 3 other chairs (hollow rings)
    (0xD4, 0xD4, 0xD8),  # 4 tables
    (0x1D, 0x4E, 0xD8),  # 5 the marker's ring
    (0x71, 0x71, 0x7A),  # 6 table labels
    (0x52, 0x52, 0x5B),  # 7 edge of the booked table
    (0x7D, 0xD3, 0xFC),  # 8 windows and glass walls
    (0xD6, 0xB9, 0x8C),  # 9 doors
    (0xE4, 0xE4, 0xE7),  # 10 fixed items
    (0x3F, 0x3F, 0x46),  # 11 names of fixed items
    (0xFC, 0xD3, 0x4D),  # 12 the booked table
    (0xE3, 0xF1, 0xDF),  # 13 outdoor floor
)
(
    BACKGROUND,
    INK,
    FLOOR,
    SEAT,
    TABLE,
    MARK_RING,
    MUTED,
    CHOSEN_EDGE,
    WINDOW,
    DOOR,
    FIXTURE,
    FIXTURE_TEXT,
    CHOSEN_TABLE,
    TERRACE,
) = range(14)

WALL_RADIUS = 2.0  # a 5-pixel wall
ARC_SEGMENTS = 24  # per curved side; smoother than the 16 used for the maths
HEADER_SCALE = 2
FALLBACK = "YOUR TABLE"


# ---------------------------------------------------------------- layout


def _bounds(room: AmbienceRoom) -> tuple[float, float, float, float]:
    corners = outline_polygon(room.outline, ARC_SEGMENTS)
    xs, ys = [p.x for p in corners], [p.y for p in corners]
    return min(xs), min(ys), max(xs), max(ys)


def restaurant_layout(room: AmbienceRoom) -> Layout:
    """Where the room lands in the picture: pixel = left + x * scale."""
    x0, y0, x1, y1 = _bounds(room)
    width_cm, height_cm = x1 - x0, y1 - y0
    if width_cm <= 0 or height_cm <= 0:
        raise ValueError("The room needs an area to be drawn.")
    width, map_height = picture_size(width_cm, height_cm)
    scale = min((width - 2 * PADDING) / width_cm, (map_height - 2 * PADDING) / height_cm)
    left = (width - width_cm * scale) / 2 - x0 * scale
    top = HEADER + (map_height - height_cm * scale) / 2 - y0 * scale
    return Layout(width, map_height + HEADER, scale, left, top)


def _pixels(layout: Layout, points: Sequence[Point]) -> list[tuple[float, float]]:
    return [(layout.left + p.x * layout.scale, layout.top + p.y * layout.scale) for p in points]


# ---------------------------------------------------------------- drawing steps


def _fill(canvas: Canvas, points: list[tuple[float, float]], colour: int) -> None:
    """Fill any simple polygon, convex or not, one pixel row at a time.

    On every row the edges that cross it are sorted left to right; the stretch
    between the 1st and 2nd crossing is inside, between the 3rd and 4th too,
    and so on ("even-odd"). An edge counts from its top row up to, but not
    including, its bottom row, so a corner is never counted twice.
    """
    edges = list(zip(points, points[1:] + points[:1], strict=True))
    top = math.ceil(min(y for _, y in points))
    bottom = math.floor(max(y for _, y in points))
    for y in range(top, bottom + 1):
        crossings = sorted(
            x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            for (x1, y1), (x2, y2) in edges
            if y1 != y2 and min(y1, y2) <= y < max(y1, y2)
        )
        for first, second in zip(crossings[::2], crossings[1::2], strict=False):
            canvas.span(y, math.ceil(first), math.floor(second), colour)


def _thick_line(
    canvas: Canvas, start: tuple[float, float], end: tuple[float, float], colour: int
) -> None:
    """A WALL_RADIUS-thick line: a small disc stamped at every pixel step."""
    steps = max(1, math.ceil(math.dist(start, end)))
    for step in range(steps + 1):
        x = start[0] + (end[0] - start[0]) * step / steps
        y = start[1] + (end[1] - start[1]) * step / steps
        canvas.disc(round(x), round(y), WALL_RADIUS, colour)


def _draw_walls(canvas: Canvas, layout: Layout, room: AmbienceRoom) -> None:
    corners = _pixels(layout, outline_polygon(room.outline, ARC_SEGMENTS))
    _fill(canvas, corners, TERRACE if room.is_outdoor else FLOOR)
    for start, end in zip(corners, corners[1:] + corners[:1], strict=True):
        _thick_line(canvas, start, end, INK)
    for opening in room.openings:
        colour = DOOR if opening.kind == "door" else WINDOW
        for a, b in opening_segments(room, opening):
            start, end = _pixels(layout, (a, b))
            _thick_line(canvas, start, end, colour)


def _fixture_name(fixture: AmbienceFixture) -> str:
    return (fixture.label or fixture.kind).replace("_", " ").upper()


def _draw_fixture(canvas: Canvas, layout: Layout, fixture: AmbienceFixture) -> None:
    _fill(canvas, _pixels(layout, table_polygon(fixture)), FIXTURE)
    name = _fixture_name(fixture)
    width = pixel_font.text_width(name, 1)
    cx, cy = to_pixel(layout, fixture.x + fixture.w / 2, fixture.y + fixture.h / 2)
    fits = width + 4 <= fixture.w * layout.scale and 11 <= fixture.h * layout.scale
    if pixel_font.can_write(name) and name.isascii() and fits:
        canvas.text(cx - width // 2, cy - 3, name, 1, FIXTURE_TEXT)


def _picture_table(table: AmbienceTable) -> PictureTable:
    shape = "round" if table.shape == "round" else "rect"
    return PictureTable(
        table.key, table.label, shape, table.x, table.y, table.w, table.h, table.rotation
    )  # type: ignore[arg-type]


def _draw_table(canvas: Canvas, layout: Layout, table: AmbienceTable, chosen: bool) -> None:
    shape = _picture_table(table)
    if chosen:
        canvas.polygon(_table_outline(layout, shape, 0), CHOSEN_EDGE)
        canvas.polygon(_table_outline(layout, shape, 2), CHOSEN_TABLE)
    else:
        canvas.polygon(_table_outline(layout, shape, 0), TABLE)


def _draw_labels(
    canvas: Canvas, layout: Layout, tables: Sequence[AmbienceTable], seats: Sequence[AmbienceSeat]
) -> None:
    """Table labels, skipped where they do not fit or a chair sits on the letters."""
    chairs = [to_pixel(layout, s.x, s.y) for s in seats]
    reach = SEAT_RADIUS + 1
    for table in tables:
        label = table.label.upper()
        width = pixel_font.text_width(label, 1)
        if not pixel_font.can_write(label) or not label.isascii():
            continue
        if width >= table.w * layout.scale - 4 or table.h * layout.scale < 11:
            continue
        cx, cy = to_pixel(layout, table.x + table.w / 2, table.y + table.h / 2)
        left, top = cx - width // 2, cy - 3
        if any(
            left - reach <= x <= left + width + reach and top - reach <= y <= top + 7 + reach
            for x, y in chairs
        ):
            continue
        canvas.text(left, top, table.label, 1, MUTED)


def _fits(text: str, scale: int, width: int) -> bool:
    return pixel_font.text_width(text, scale) <= width - 2 * PADDING


def _writable(text: str) -> bool:
    return bool(text) and text.isascii() and pixel_font.can_write(text)


def header_text(
    room_name: str, table_label: str, seat_label: str | None, width: int
) -> tuple[str, int]:
    """The header line and its scale.

    "MAIN ROOM - TABLE 4 - SEAT 2". What the font cannot write (accents, long
    names) is dropped, never shown wrong: first the room name, then the chair,
    then the table's own label, finally the plain "YOUR TABLE".
    """
    room_ok, table_ok = _writable(room_name), _writable(table_label)
    seat_ok = table_ok and seat_label is not None and _writable(seat_label)
    table_part = f"TABLE {table_label}" if table_ok else FALLBACK
    seat_part = f"SEAT {seat_label}" if seat_ok else ""
    wanted = [
        [room_name if room_ok else "", table_part, seat_part],
        ["", table_part, seat_part],
        ["", table_part, ""],
        ["", FALLBACK, ""],
    ]
    for parts in wanted:
        text = " - ".join(part.upper() for part in parts if part)
        if _fits(text, HEADER_SCALE, width):
            return text, HEADER_SCALE
    return FALLBACK, 1


# ---------------------------------------------------------------- the picture


def render_restaurant_picture(
    room: AmbienceRoom,
    tables: Sequence[AmbienceTable],
    seats: Sequence[AmbienceSeat],
    table_key: int | str,
    seat_key: int | str | None = None,
    room_name: str = "",
    table_label: str | None = None,
    seat_label: str | None = None,
) -> bytes:
    """The PNG of `room` with the booked table highlighted and chair `seat_key` marked.

    `tables` and `seats` are those of this room only. Raises ValueError for a
    table that is not in the room, or a chair that is not at that table.
    """
    chosen = next((t for t in tables if t.key == table_key), None)
    if chosen is None:
        raise ValueError("The table to mark is not in this room.")
    mine = None
    if seat_key is not None:
        mine = next((s for s in seats if s.key == seat_key and s.table_key == table_key), None)
        if mine is None:
            raise ValueError("The chair to mark is not at that table.")

    layout = restaurant_layout(room)
    canvas = Canvas(layout.width, layout.height)
    _draw_walls(canvas, layout, room)
    for fixture in room.fixtures:
        _draw_fixture(canvas, layout, fixture)
    for table in tables:
        _draw_table(canvas, layout, table, table.key == table_key)
    _draw_labels(canvas, layout, tables, seats)
    for seat in seats:
        if mine is None or seat.key != mine.key:
            canvas.ring(*to_pixel(layout, seat.x, seat.y), SEAT_RADIUS, 2, SEAT)
    if mine is not None:
        _draw_marker(canvas, layout, *to_pixel(layout, mine.x, mine.y))

    words, scale = header_text(
        room_name,
        chosen.label if table_label is None else table_label,
        (mine.label if mine is not None else None) if seat_label is None else seat_label,
        layout.width,
    )
    canvas.text(PADDING, (HEADER - pixel_font.GLYPH_HEIGHT * scale) // 2, words, scale, INK)
    return encode_indexed(layout.width, layout.height, canvas.pixels, PALETTE)
