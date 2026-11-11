"""The seat picture: a valid PNG, the right seat marked, and no guest data in it."""

import binascii
import dataclasses
import struct
import time
import zlib
from typing import Any

import pytest
from fastapi.testclient import TestClient
from hypothesis import given, settings
from hypothesis import strategies as st
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from app import db
from app.events_service.mailer import picture_room, seat_picture_base64
from app.mail import seat_picture as sp
from app.models import Venue
from app.seed import demo_events
from app.seed.run import ensure_demo_users

# ---------------------------------------------------------------- a tiny PNG reader (tests only)


def read_png(data: bytes) -> tuple[int, int, list[tuple[int, int, int]], list[bytes]]:
    """(width, height, palette, rows of palette indices). Checks every CRC."""
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    position, chunks = 8, {}
    idat = b""
    while position < len(data):
        (length,) = struct.unpack(">I", data[position : position + 4])
        kind = data[position + 4 : position + 8]
        body = data[position + 8 : position + 8 + length]
        (crc,) = struct.unpack(">I", data[position + 8 + length : position + 12 + length])
        assert crc == binascii.crc32(kind + body) & 0xFFFFFFFF
        chunks[kind] = body
        idat += body if kind == b"IDAT" else b""
        position += 12 + length
    width, height, depth, colour_type, _, _, _ = struct.unpack(">IIBBBBB", chunks[b"IHDR"])
    assert (depth, colour_type) == (8, 3) and b"IEND" in chunks
    plte = chunks[b"PLTE"]
    palette = [tuple(plte[i : i + 3]) for i in range(0, len(plte), 3)]
    raw = zlib.decompress(idat)
    rows = []
    for y in range(height):
        start = y * (width + 1)
        assert raw[start] == 0  # filter 0: nothing to undo
        rows.append(raw[start + 1 : start + 1 + width])
    return width, height, palette, rows  # type: ignore[return-value]


def pixel(rows: list[bytes], x: int, y: int) -> int:
    return rows[y][x]


# ---------------------------------------------------------------- rooms


def _room(
    width: float, height: float, seats: list[tuple[float, float]], **kw: Any
) -> sp.PictureRoom:
    table = sp.PictureTable(1, "T1", "round", width / 2 - 20, height / 2 - 20, 40, 40, 0)
    return sp.PictureRoom(
        width=width,
        height=height,
        zones=kw.get("zones", ()),
        tables=kw.get("tables", (table,)),
        seats=tuple(sp.PictureSeat(i + 1, 1, x, y) for i, (x, y) in enumerate(seats)),
    )


@pytest.mark.parametrize(
    ("size", "expected"),
    [
        ((1200, 800), (640, 427 + 40)),  # wide
        ((800, 1600), (320, 640 + 40)),  # tall: 640 high, width scaled down
        ((1000, 1000), (640, 640 + 40)),  # square
        ((2000, 100), (640, 240 + 40)),  # very wide: never below 240
        ((100, 2000), (240, 640 + 40)),  # very tall
    ],
)
def test_size_rules(size: tuple[int, int], expected: tuple[int, int]) -> None:
    room = _room(*size, [(size[0] / 4, size[1] / 4)])
    width, height, _, _ = read_png(sp.render_seat_picture(room, 1, "1", "T1"))
    assert (width, height) == expected


def test_the_marked_seat_is_solid_and_ringed_and_others_are_hollow() -> None:
    spots = [(100, 100), (500, 100), (100, 500), (500, 500), (300, 520)]
    room = _room(600, 600, spots)
    layout = sp.picture_layout(room)
    _, _, palette, rows = read_png(sp.render_seat_picture(room, 4, "4", "T1"))
    assert palette == list(sp.PALETTE)
    cx, cy = sp.to_pixel(layout, 500, 500)
    assert pixel(rows, cx, cy) == sp.INK
    assert pixel(rows, cx - 16, cy) == sp.RING and pixel(rows, cx, cy - 16) == sp.RING
    for seat in room.seats:
        if seat.id != 4:
            assert pixel(rows, *sp.to_pixel(layout, seat.x, seat.y)) != sp.INK
            x, y = sp.to_pixel(layout, seat.x, seat.y)
            assert pixel(rows, x + 4, y) == sp.SEAT  # a hollow ring of radius 5


def test_the_picture_classes_have_no_field_for_a_person() -> None:
    names = {
        cls.__name__: [f.name for f in dataclasses.fields(cls)]
        for cls in (sp.PictureSeat, sp.PictureTable, sp.PictureZone, sp.PictureRoom)
    }
    assert names == {
        "PictureSeat": ["id", "table_id", "x", "y"],
        "PictureTable": ["id", "label", "shape", "x", "y", "w", "h", "rotation"],
        "PictureZone": ["kind", "name", "x", "y", "w", "h"],
        "PictureRoom": ["width", "height", "zones", "tables", "seats"],
    }


def _luminance(colour: tuple[int, int, int]) -> float:
    def channel(value: int) -> float:
        c = value / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    red, green, blue = (channel(v) for v in colour)
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def test_marks_and_text_contrast_with_white() -> None:
    white = _luminance(sp.PALETTE[sp.WHITE])
    for index in (sp.INK, sp.RING, sp.MUTED, sp.OWN_TABLE):
        ratio = (white + 0.05) / (_luminance(sp.PALETTE[index]) + 0.05)
        assert ratio >= 4.5, (index, round(ratio, 2))


def test_a_rotated_table_is_drawn_where_expected() -> None:
    table = sp.PictureTable(1, "LONG", "rect", 200, 280, 200, 40, 90)  # centre (300, 300)
    room = _room(600, 600, [(60, 60)], tables=(table,))
    layout = sp.picture_layout(room)
    _, _, _, rows = read_png(sp.render_seat_picture(room, 1, "1", "LONG"))
    assert pixel(rows, *sp.to_pixel(layout, 300, 380)) == sp.TABLE  # along the turned length
    assert pixel(rows, *sp.to_pixel(layout, 380, 300)) == sp.WHITE  # where it was before turning


def test_a_stage_is_hatched_and_named() -> None:
    stage = sp.PictureZone("stage", "Stage", 100, 50, 400, 100)
    room = _room(600, 600, [(300, 500)], zones=(stage,))
    _, _, _, rows = read_png(sp.render_seat_picture(room, 1, "1", "T1"))
    used = {value for row in rows for value in row}
    assert {sp.ZONE, sp.MUTED} <= used


@pytest.mark.parametrize("corner", [(0, 0), (600, 0), (0, 400), (600, 400)])
def test_the_tag_stays_inside_the_picture(corner: tuple[int, int]) -> None:
    room = _room(600, 400, [corner])
    layout = sp.picture_layout(room)
    left, top, right, bottom = sp.tag_box(layout, *sp.to_pixel(layout, *corner))
    assert 0 <= left < right < layout.width and sp.HEADER <= top < bottom < layout.height
    read_png(sp.render_seat_picture(room, 1, "1", "T1"))


def test_labels_the_font_lacks_fall_back_without_crashing() -> None:
    assert sp.header_text("Ç1", "Mesa ã", 640) == (sp.FALLBACK_HEADER, 2)
    assert sp.header_text("12", "T3", 640) == ("YOUR SEAT: 12 AT TABLE T3", 2)
    assert sp.header_text("x" * 60, "T3", 640)[0] == sp.FALLBACK_HEADER
    assert sp.header_text("1", "T1", 240) == (sp.FALLBACK_HEADER, 1)
    table = sp.PictureTable(1, "Mesa ã", "round", 260, 260, 80, 80, 0)
    zone = sp.PictureZone("general", "Área VIP", 10, 10, 200, 100)
    room = _room(600, 600, [(300, 360)], tables=(table,), zones=(zone,))
    read_png(sp.render_seat_picture(room, 1, "Ç1", "Mesa ã"))


def test_an_unknown_seat_is_refused() -> None:
    with pytest.raises(ValueError):
        sp.render_seat_picture(_room(600, 600, [(10, 10)]), 99, "1", "T1")


@settings(max_examples=60, deadline=None)
@given(
    width=st.floats(50, 5000),
    height=st.floats(50, 5000),
    fx=st.floats(0, 1),
    fy=st.floats(0, 1),
)
def test_any_room_and_seat_give_a_valid_marked_picture(
    width: float, height: float, fx: float, fy: float
) -> None:
    room = _room(width, height, [(fx * width, fy * height)])
    layout = sp.picture_layout(room)
    png_width, png_height, _, rows = read_png(sp.render_seat_picture(room, 1, "A1", "T1"))
    assert (png_width, png_height) == (layout.width, layout.height)
    assert min(png_width, png_height - sp.HEADER) >= sp.MIN_SIDE
    assert max(png_width, png_height - sp.HEADER) == 640
    cx, cy = sp.to_pixel(layout, fx * width, fy * height)
    assert pixel(rows, cx, cy) == sp.INK
    step = -16 if cx > png_width / 2 else 16
    assert pixel(rows, cx + step, cy) == sp.RING
    left, top, right, bottom = sp.tag_box(layout, cx, cy)
    assert 0 <= left and right < png_width and sp.HEADER <= top and bottom < png_height


# ---------------------------------------------------------------- from the database


@pytest.fixture
def demo_venues(session: Session) -> list[Venue]:
    from app.config import get_settings

    ensure_demo_users(session, get_settings())
    demo_events.seed(session)
    session.commit()
    return list(session.scalars(select(Venue).where(Venue.kind == "event").order_by(Venue.id)))


def test_demo_rooms_stay_small_and_quick(session: Session, demo_venues: list[Venue]) -> None:
    assert [venue.name for venue in demo_venues] == ["Quinta do Lago Azul", "Nova Auditorium"]
    for venue in demo_venues:
        room = picture_room(session, venue)
        timings, png = [], b""
        for _ in range(3):
            start = time.perf_counter()
            png = sp.render_seat_picture(room, room.seats[17].id, "18", "T3")
            timings.append(time.perf_counter() - start)
        assert len(png) <= 60_000, (venue.name, len(png))
        assert min(timings) <= 0.150, (venue.name, timings)


def test_the_picture_reads_only_zones_tables_and_seats(
    client: TestClient, session: Session, demo_venues: list[Venue]
) -> None:
    """Seat a guest called ZEBRA next to the marked seat: not one pixel changes."""
    from app.models import Event, Guest, Seat, SeatAssignment

    venue = demo_venues[0]
    wedding = session.scalars(select(Event).where(Event.venue_id == venue.id)).one()
    seats = list(session.scalars(select(Seat).where(Seat.venue_id == venue.id).order_by(Seat.id)))
    mine, beside = seats[40], seats[41]
    session.query(SeatAssignment).filter(SeatAssignment.seat_id == beside.id).delete()
    session.commit()
    before = seat_picture_base64(session, venue, mine, "T6")
    zebra = Guest(event_id=wedding.id, name="ZEBRA", email="zebra@example.com", token_hash="z" * 64)
    session.add(zebra)
    session.flush()
    session.add(
        SeatAssignment(event_id=wedding.id, guest_id=zebra.id, seat_id=beside.id, source="self")
    )
    session.commit()
    statements: list[str] = []

    def remember(_conn: Any, _cursor: Any, statement: str, *_args: Any) -> None:
        statements.append(statement)

    event.listen(db.get_engine(), "before_cursor_execute", remember)
    try:
        after = seat_picture_base64(session, venue, mine, "T6")
    finally:
        event.remove(db.get_engine(), "before_cursor_execute", remember)
    assert after == before
    read = {
        word for s in statements for word in ("guests", "seat_assignments", "holds") if word in s
    }
    assert read == set(), statements
