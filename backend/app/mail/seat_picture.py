"""The picture in an account holder's seat email: the room from above, their seat marked.

A pure function: render_seat_picture(room, my_seat_id, seat_label, table_label)
returns PNG bytes. It never touches the database. Its inputs (the Picture*
dataclasses below) have no field for a person, so the picture cannot show
anyone's name, and other seats are all drawn the same, free or taken.

How it draws: a Canvas is one byte per pixel, each byte an index into PALETTE.
Shapes are filled one row at a time ("scanlines"): for each pixel row we work
out where the shape starts and ends and fill that stretch in one step, which
is fast enough in plain Python. mail/png.py turns the bytes into a PNG.

Why a PNG and not SVG: Gmail and Outlook do not show SVG in emails. Why no
library: the contract prefers the standard library, and this picture is only
rectangles, circles and a few letters (docs/guest-accounts.md, section 9.3).
"""

import math
from dataclasses import dataclass

from app.mail import pixel_font
from app.mail.png import encode_indexed

# ---------------------------------------------------------------- inputs


@dataclass(frozen=True)
class PictureSeat:
    id: int
    table_id: int
    x: float
    y: float


@dataclass(frozen=True)
class PictureTable:
    id: int
    label: str
    shape: str
    x: float
    y: float
    w: float
    h: float
    rotation: float


@dataclass(frozen=True)
class PictureZone:
    kind: str
    name: str
    x: float
    y: float
    w: float
    h: float


@dataclass(frozen=True)
class PictureRoom:
    width: float
    height: float
    zones: tuple[PictureZone, ...]
    tables: tuple[PictureTable, ...]
    seats: tuple[PictureSeat, ...]


# ---------------------------------------------------------------- colours and sizes

# Index -> (red, green, blue). Everything sits on white, so a dark-mode mail
# app has no transparent pixels to recolour.
PALETTE: tuple[tuple[int, int, int], ...] = (
    (0xFF, 0xFF, 0xFF),  # 0 background, halo, text inside the tag
    (0x18, 0x18, 0x1B),  # 1 header text, room outline, the marker's dot and ticks, the tag
    (0xF4, 0xF4, 0xF5),  # 2 zones
    (0xA1, 0xA1, 0xAA),  # 3 other seats (hollow rings)
    (0xD4, 0xD4, 0xD8),  # 4 tables
    (0x1D, 0x4E, 0xD8),  # 5 the marker's ring
    (0x71, 0x71, 0x7A),  # 6 stage hatching, table labels
    (0x52, 0x52, 0x5B),  # 7 outline of the guest's own table
)
WHITE, INK, ZONE, SEAT, TABLE, RING, MUTED, OWN_TABLE = range(8)

BASE_SIDE = 640
MIN_SIDE = 240
HEADER = 40
PADDING = 16
SEAT_RADIUS = 5
HALO_RADIUS = 22
RING_RADIUS = 18
RING_WIDTH = 5
DOT_RADIUS = 9
TICK_FROM, TICK_TO = 22, 30
TAG_TEXT = "YOU"
TAG_PADDING = 6
TAG_GAP = 28
FALLBACK_HEADER = "YOUR SEAT IS MARKED YOU"


@dataclass(frozen=True)
class Layout:
    """Where the room lands in the picture: pixel = left + x * scale."""

    width: int
    height: int
    scale: float
    left: float
    top: float


def picture_size(room_width: float, room_height: float) -> tuple[int, int]:
    """(width, map height) in pixels. The header band comes on top of the map height.

    640 wide, keeping the room's proportions. A tall room is 640 high
    instead. No side goes below MIN_SIDE.
    """
    width = BASE_SIDE
    height = round(BASE_SIDE * room_height / room_width)
    if height > BASE_SIDE:
        height = BASE_SIDE
        width = round(BASE_SIDE * room_width / room_height)
    return max(width, MIN_SIDE), max(height, MIN_SIDE)


def picture_layout(room: PictureRoom) -> Layout:
    width, map_height = picture_size(room.width, room.height)
    scale = min((width - 2 * PADDING) / room.width, (map_height - 2 * PADDING) / room.height)
    left = (width - room.width * scale) / 2
    top = HEADER + (map_height - room.height * scale) / 2
    return Layout(width, map_height + HEADER, scale, left, top)


def to_pixel(layout: Layout, x: float, y: float) -> tuple[int, int]:
    return round(layout.left + x * layout.scale), round(layout.top + y * layout.scale)


# ---------------------------------------------------------------- the canvas


class Canvas:
    """A width x height grid of palette indices. Drawing outside is ignored."""

    def __init__(self, width: int, height: int) -> None:
        self.width = width
        self.height = height
        self.pixels = bytearray(width * height)  # all 0: white

    def span(self, y: int, x0: int, x1: int, colour: int) -> None:
        """Colour row y from x0 to x1, both included."""
        x0, x1 = max(x0, 0), min(x1, self.width - 1)
        if 0 <= y < self.height and x0 <= x1:
            start = y * self.width
            self.pixels[start + x0 : start + x1 + 1] = bytes([colour]) * (x1 - x0 + 1)

    def dot(self, x: int, y: int, colour: int) -> None:
        if 0 <= x < self.width and 0 <= y < self.height:
            self.pixels[y * self.width + x] = colour

    def rect(self, x0: int, y0: int, x1: int, y1: int, colour: int) -> None:
        for y in range(y0, y1 + 1):
            self.span(y, x0, x1, colour)

    def disc(self, cx: int, cy: int, radius: float, colour: int) -> None:
        for dy in range(-math.floor(radius), math.floor(radius) + 1):
            dx = math.floor(math.sqrt(radius * radius - dy * dy))
            self.span(cy + dy, cx - dx, cx + dx, colour)

    def ring(self, cx: int, cy: int, outer: float, width: float, colour: int) -> None:
        """Pixels whose distance d from the centre is inner < d <= outer."""
        inner_sq, outer_sq = (outer - width) ** 2, outer * outer
        reach = math.floor(outer)
        for dy in range(-reach, reach + 1):
            for dx in range(-reach, reach + 1):
                if inner_sq < dx * dx + dy * dy <= outer_sq:
                    self.dot(cx + dx, cy + dy, colour)

    def polygon(self, points: list[tuple[float, float]], colour: int) -> None:
        """Fill a convex polygon, one pixel row at a time."""
        top = math.ceil(min(y for _, y in points))
        bottom = math.floor(max(y for _, y in points))
        edges = list(zip(points, points[1:] + points[:1], strict=True))
        for y in range(top, bottom + 1):
            crossings = [
                x1 + (y - y1) * (x2 - x1) / (y2 - y1)
                for (x1, y1), (x2, y2) in edges
                if y1 != y2 and min(y1, y2) <= y <= max(y1, y2)
            ]
            if crossings:
                self.span(y, math.ceil(min(crossings)), math.floor(max(crossings)), colour)

    def text(self, x: int, y: int, words: str, scale: int, colour: int) -> None:
        for dx, dy in pixel_font.inked_pixels(words, scale):
            self.dot(x + dx, y + dy, colour)

    def line(self, start: tuple[float, float], end: tuple[float, float], colour: int) -> None:
        """A 2-pixel-wide straight line."""
        steps = max(1, math.ceil(2 * math.dist(start, end)))
        for step in range(steps + 1):
            x = round(start[0] + (end[0] - start[0]) * step / steps)
            y = round(start[1] + (end[1] - start[1]) * step / steps)
            self.rect(x, y, x + 1, y + 1, colour)


# ---------------------------------------------------------------- drawing steps


def _table_outline(layout: Layout, table: PictureTable, inset: float) -> list[tuple[float, float]]:
    """The table's corners in pixels, rotated around its centre, shrunk by `inset` px."""
    half_w = max(table.w * layout.scale / 2 - inset, 0.5)
    half_h = max(table.h * layout.scale / 2 - inset, 0.5)
    cx = layout.left + (table.x + table.w / 2) * layout.scale
    cy = layout.top + (table.y + table.h / 2) * layout.scale
    if table.shape == "round":
        # A round table is a polygon with many sides: close enough at this size.
        steps = 48
        frame = [
            (half_w * math.cos(2 * math.pi * i / steps), half_h * math.sin(2 * math.pi * i / steps))
            for i in range(steps)
        ]
    else:
        frame = [(-half_w, -half_h), (half_w, -half_h), (half_w, half_h), (-half_w, half_h)]
    angle = math.radians(table.rotation)
    cos, sin = math.cos(angle), math.sin(angle)
    return [(cx + u * cos - v * sin, cy + u * sin + v * cos) for u, v in frame]


def _draw_room(canvas: Canvas, layout: Layout, room: PictureRoom) -> None:
    x0, y0 = to_pixel(layout, 0, 0)
    x1, y1 = to_pixel(layout, room.width, room.height)
    canvas.rect(x0 - 2, y0 - 2, x1 + 1, y1 + 1, INK)
    canvas.rect(x0, y0, x1 - 1, y1 - 1, WHITE)


def _draw_zone(canvas: Canvas, layout: Layout, zone: PictureZone) -> None:
    x0, y0 = to_pixel(layout, zone.x, zone.y)
    x1, y1 = to_pixel(layout, zone.x + zone.w, zone.y + zone.h)
    canvas.rect(x0, y0, x1, y1, ZONE)
    if zone.kind == "stage":
        for y in range(y0, y1 + 1):
            # Diagonal stripes: every pixel where x + y is a multiple of 6.
            for x in range(x0 + (-(x0 + y)) % 6, x1 + 1, 6):
                canvas.dot(x, y, MUTED)
    name = zone.name.upper()
    fits = pixel_font.text_width(name, 1) <= x1 - x0 - 6 and y1 - y0 >= 13
    if name.isascii() and pixel_font.can_write(name) and fits:
        canvas.text(x0 + 3, y0 + 3, name, 1, INK)


def _draw_table(canvas: Canvas, layout: Layout, table: PictureTable, is_mine: bool) -> None:
    if is_mine:
        canvas.polygon(_table_outline(layout, table, 0), OWN_TABLE)
        canvas.polygon(_table_outline(layout, table, 2), TABLE)
    else:
        canvas.polygon(_table_outline(layout, table, 0), TABLE)


def _label_box(layout: Layout, table: PictureTable) -> tuple[int, int, int, int] | None:
    """Where the table's label goes (left, top, right, bottom), or None if it
    cannot be written or is not narrower than the table."""
    label = table.label.upper()
    width = pixel_font.text_width(label, 1)
    if not (label.isascii() and pixel_font.can_write(label)):
        return None
    if width >= table.w * layout.scale - 4 or table.h * layout.scale < 11:
        return None
    cx, cy = to_pixel(layout, table.x + table.w / 2, table.y + table.h / 2)
    return cx - width // 2, cy - 3, cx - width // 2 + width - 1, cy + 3


def _draw_labels(canvas: Canvas, layout: Layout, room: PictureRoom) -> None:
    """Table labels, skipped where a seat would sit on top of the letters."""
    seat_pixels = [to_pixel(layout, seat.x, seat.y) for seat in room.seats]
    reach = SEAT_RADIUS + 1
    for table in room.tables:
        box = _label_box(layout, table)
        if box is None:
            continue
        left, top, right, bottom = box
        if any(
            left - reach <= x <= right + reach and top - reach <= y <= bottom + reach
            for x, y in seat_pixels
        ):
            continue
        canvas.text(left, top, table.label, 1, MUTED)


def tag_box(layout: Layout, cx: int, cy: int) -> tuple[int, int, int, int]:
    """(left, top, right, bottom) of the "YOU" tag: up and to the right of the
    seat, flipped to the other side when that would leave the picture."""
    width = pixel_font.text_width(TAG_TEXT, 2) + 2 * TAG_PADDING
    height = pixel_font.GLYPH_HEIGHT * 2 + 2 * TAG_PADDING
    left, top = cx + TAG_GAP, cy - TAG_GAP - height
    if left + width > layout.width - 2:
        left = cx - TAG_GAP - width
    if top < HEADER + 2:
        top = cy + TAG_GAP
    left = min(max(left, 2), layout.width - 2 - width)
    top = min(max(top, HEADER + 2), layout.height - 2 - height)
    return left, top, left + width - 1, top + height - 1


def _draw_tag(canvas: Canvas, layout: Layout, cx: int, cy: int) -> None:
    left, top, right, bottom = tag_box(layout, cx, cy)
    corner_x = left if abs(left - cx) < abs(right - cx) else right
    corner_y = top if abs(top - cy) < abs(bottom - cy) else bottom
    angle = math.atan2(corner_y - cy, corner_x - cx)
    start = (cx + HALO_RADIUS * math.cos(angle), cy + HALO_RADIUS * math.sin(angle))
    canvas.line(start, (corner_x, corner_y), INK)
    for y in range(top, bottom + 1):
        # Cut the corners by one pixel for a slightly rounded box.
        cut = 1 if y in (top, bottom) else 0
        canvas.span(y, left + cut, right - cut, INK)
    canvas.text(left + TAG_PADDING, top + TAG_PADDING, TAG_TEXT, 2, WHITE)


def _draw_marker(canvas: Canvas, layout: Layout, cx: int, cy: int) -> None:
    """Size, fill, shape and a word: the guest's seat never relies on colour alone."""
    canvas.disc(cx, cy, HALO_RADIUS, WHITE)
    canvas.ring(cx, cy, RING_RADIUS, RING_WIDTH, RING)
    canvas.disc(cx, cy, DOT_RADIUS, INK)
    canvas.rect(cx - 1, cy - TICK_TO, cx + 1, cy - TICK_FROM, INK)  # up
    canvas.rect(cx - 1, cy + TICK_FROM, cx + 1, cy + TICK_TO, INK)  # down
    canvas.rect(cx - TICK_TO, cy - 1, cx - TICK_FROM, cy + 1, INK)  # left
    canvas.rect(cx + TICK_FROM, cy - 1, cx + TICK_TO, cy + 1, INK)  # right
    _draw_tag(canvas, layout, cx, cy)


def header_text(seat_label: str, table_label: str, width: int) -> tuple[str, int]:
    """The header line and its scale; the plain fallback when the labels cannot be drawn."""
    wanted = f"YOUR SEAT: {seat_label} AT TABLE {table_label}".upper()
    drawable = wanted.isascii() and pixel_font.can_write(wanted)
    if drawable and pixel_font.text_width(wanted, 2) <= width - 2 * PADDING:
        return wanted, 2
    if pixel_font.text_width(FALLBACK_HEADER, 2) <= width - 2 * PADDING:
        return FALLBACK_HEADER, 2
    return FALLBACK_HEADER, 1


def _draw_header(canvas: Canvas, seat_label: str, table_label: str) -> None:
    words, scale = header_text(seat_label, table_label, canvas.width)
    top = (HEADER - pixel_font.GLYPH_HEIGHT * scale) // 2
    canvas.text(PADDING, top, words, scale, INK)


def render_seat_picture(
    room: PictureRoom, my_seat_id: int, seat_label: str, table_label: str
) -> bytes:
    """The PNG of the room with seat `my_seat_id` marked. Raises ValueError for an unknown seat."""
    mine = next((seat for seat in room.seats if seat.id == my_seat_id), None)
    if mine is None:
        raise ValueError("The seat to mark is not in this room.")
    layout = picture_layout(room)
    canvas = Canvas(layout.width, layout.height)
    _draw_room(canvas, layout, room)
    for zone in room.zones:
        _draw_zone(canvas, layout, zone)
    for table in room.tables:
        _draw_table(canvas, layout, table, table.id == mine.table_id)
    _draw_labels(canvas, layout, room)
    for seat in room.seats:
        if seat.id != mine.id:
            canvas.ring(*to_pixel(layout, seat.x, seat.y), SEAT_RADIUS, 2, SEAT)
    _draw_marker(canvas, layout, *to_pixel(layout, mine.x, mine.y))
    _draw_header(canvas, seat_label, table_label)
    return encode_indexed(layout.width, layout.height, canvas.pixels, PALETTE)
