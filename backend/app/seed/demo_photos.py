"""Invented pictures for the demo restaurants, drawn here from plain shapes.

SOURCE OF EVERY DEMO PHOTO: this file. Each picture is made by the code below
(rectangles, circles and colour bands written out as an indexed PNG by
app/mail/png.py). No photograph, stock image or other third-party material is
used, so there is nothing to license, and no real restaurant, brand or person
appears. Replace them with real photos (free-licence or the owner's own) and
note each source here when a real venue goes live.

The pictures are small (400 x 225) on purpose: they are cheap to draw once per
process (they are cached) and light to serve. They are illustrations, and the
alt text says so.
"""

import math
from functools import cache

from sqlalchemy.orm import Session

from app.mail.png import encode_indexed
from app.models import Venue, VenuePhoto

WIDTH, HEIGHT = 400, 225

# Index -> colour. One shared palette for every scene keeps the code short.
PALETTE: tuple[tuple[int, int, int], ...] = (
    (0xFD, 0xE2, 0xB3),  # 0 pale sky (low sun)
    (0xF8, 0xC0, 0x8A),  # 1 warm sky
    (0xE9, 0x8F, 0x6C),  # 2 sunset sky
    (0x9B, 0xC8, 0xE6),  # 3 day sky
    (0x2D, 0x3A, 0x5E),  # 4 dusk sky
    (0x15, 0x1B, 0x33),  # 5 night
    (0xFF, 0xD8, 0x5C),  # 6 sun / lamp light
    (0x3E, 0x7C, 0x9C),  # 7 river
    (0x7F, 0xB4, 0xCE),  # 8 river light
    (0xD8, 0xC6, 0xA5),  # 9 stone
    (0xB8, 0x8F, 0x62),  # 10 wood
    (0x7A, 0x55, 0x38),  # 11 dark wood
    (0xF3, 0xEC, 0xDF),  # 12 linen
    (0xC9, 0x5B, 0x3C),  # 13 terracotta
    (0x4E, 0x8A, 0x4C),  # 14 leaves
    (0xE8, 0x8A, 0x1A),  # 15 orange fruit
    (0x38, 0x2F, 0x2A),  # 16 shadow
    (0xFF, 0xFF, 0xFF),  # 17 white
)
(
    PALE,
    WARM,
    SUNSET,
    DAY,
    DUSK,
    NIGHT,
    LIGHT,
    RIVER,
    RIVER_LIGHT,
    STONE,
    WOOD,
    DARK_WOOD,
    LINEN,
    TERRACOTTA,
    LEAVES,
    FRUIT,
    SHADOW,
    WHITE,
) = range(18)


class Painter:
    def __init__(self) -> None:
        self.pixels = bytearray(WIDTH * HEIGHT)

    def rect(self, x: int, y: int, w: int, h: int, colour: int) -> None:
        for row in range(max(0, y), min(HEIGHT, y + h)):
            start = row * WIDTH + max(0, x)
            end = row * WIDTH + min(WIDTH, x + w)
            if end > start:
                self.pixels[start:end] = bytes([colour]) * (end - start)

    def disc(self, cx: int, cy: int, radius: int, colour: int) -> None:
        for row in range(max(0, cy - radius), min(HEIGHT, cy + radius + 1)):
            half = int(math.sqrt(max(0, radius * radius - (row - cy) ** 2)))
            self.rect(cx - half, row, 2 * half + 1, 1, colour)

    def bands(self, y: int, h: int, colours: tuple[int, ...]) -> None:
        step = max(1, h // len(colours))
        for index, colour in enumerate(colours):
            self.rect(
                0,
                y + index * step,
                WIDTH,
                step if index < len(colours) - 1 else h - index * step,
                colour,
            )

    def png(self) -> bytes:
        return encode_indexed(WIDTH, HEIGHT, self.pixels, PALETTE)


def _river_terrace(p: Painter) -> None:
    p.bands(0, 120, (PALE, WARM, SUNSET))
    p.disc(290, 100, 26, LIGHT)
    p.rect(0, 120, WIDTH, 60, RIVER)
    for x in range(20, WIDTH, 60):
        p.rect(x, 135, 28, 3, RIVER_LIGHT)
        p.rect(x + 20, 155, 20, 3, RIVER_LIGHT)
    p.rect(0, 180, WIDTH, 45, STONE)
    for x in (40, 160, 280):  # tables on the quay
        p.rect(x, 185, 56, 6, WOOD)
        p.rect(x + 8, 191, 4, 24, DARK_WOOD)
        p.rect(x + 44, 191, 4, 24, DARK_WOOD)
    p.rect(0, 168, WIDTH, 4, TERRACOTTA)  # the awning edge


def _orange_patio(p: Painter) -> None:
    p.rect(0, 0, WIDTH, HEIGHT, DAY)
    p.rect(0, 150, WIDTH, 75, STONE)
    for x in range(0, WIDTH, 40):
        p.rect(x, 150, 2, 75, WOOD)
    for cx, cy in ((70, 70), (200, 55), (320, 75)):
        p.rect(cx - 4, cy, 8, 90, DARK_WOOD)
        p.disc(cx, cy, 42, LEAVES)
        for dx, dy in ((-18, -8), (12, 10), (-4, 22), (22, -14)):
            p.disc(cx + dx, cy + dy, 5, FRUIT)
    for x in (30, 150, 270):
        p.rect(x, 180, 70, 6, LINEN)
        p.rect(x + 30, 186, 6, 30, DARK_WOOD)
    for x in range(10, WIDTH, 30):  # string lights
        p.disc(x, 20 + int(8 * math.sin(x / 25)), 3, LIGHT)


def _viewpoint(p: Painter) -> None:
    p.bands(0, 130, (DUSK, SUNSET, WARM, PALE))
    p.disc(70, 118, 22, LIGHT)
    heights = (40, 62, 30, 70, 48, 36, 58, 44)
    for index, h in enumerate(heights):  # roofs of the old town
        p.rect(index * 50, 150 - h, 46, h + 5, SHADOW if index % 2 else DARK_WOOD)
    p.rect(0, 155, WIDTH, 70, RIVER)
    p.rect(0, 0, 14, HEIGHT, DARK_WOOD)  # a window frame around the view
    p.rect(WIDTH - 14, 0, 14, HEIGHT, DARK_WOOD)
    p.rect(0, 0, WIDTH, 12, DARK_WOOD)
    p.rect(0, 200, WIDTH, 25, WOOD)
    p.rect(150, 190, 100, 8, LINEN)


def _tasca(p: Painter) -> None:
    p.rect(0, 0, WIDTH, HEIGHT, WARM)
    p.rect(0, 150, WIDTH, 75, DARK_WOOD)
    for x in range(0, WIDTH, 50):  # tiles on the wall
        p.rect(x, 100, 48, 46, STONE)
        p.rect(x + 22, 100, 4, 46, WHITE)
    for x in (80, 200, 320):  # hanging lamps
        p.rect(x, 0, 2, 40, SHADOW)
        p.disc(x + 1, 46, 12, LIGHT)
    p.rect(20, 160, 360, 8, WOOD)
    for x in (60, 190, 300):
        p.rect(x, 140, 40, 18, LINEN)


def _linen_bistro(p: Painter) -> None:
    p.rect(0, 0, WIDTH, HEIGHT, LINEN)
    p.rect(0, 160, WIDTH, 65, WOOD)
    p.rect(40, 30, 130, 100, DAY)  # a window
    p.rect(103, 30, 4, 100, WHITE)
    p.rect(40, 78, 130, 4, WHITE)
    for x in (230, 320):
        p.rect(x, 140, 60, 8, DARK_WOOD)
        p.rect(x + 26, 148, 8, 50, DARK_WOOD)
        p.disc(x + 30, 130, 8, TERRACOTTA)


SCENES = {
    "river_terrace": _river_terrace,
    "orange_patio": _orange_patio,
    "viewpoint": _viewpoint,
    "tasca": _tasca,
    "linen_bistro": _linen_bistro,
}


@cache
def scene(name: str) -> bytes:
    """The PNG of one scene by name (see SCENES). Drawn once per process."""
    painter = Painter()
    SCENES[name](painter)
    return painter.png()


def add_photos(session: Session, venue: Venue, photos: tuple[tuple[str, str], ...]) -> None:
    """The drawn pictures of demo_photos, the first one as the cover."""
    for position, (name, alt) in enumerate(photos):
        session.add(
            VenuePhoto(
                venue_id=venue.id,
                kind="gallery",
                content_type="image/png",
                data=scene(name),
                width=WIDTH,
                height=HEIGHT,
                alt_text=alt,
                position=position,
                is_cover=position == 0,
            )
        )
