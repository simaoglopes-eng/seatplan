"""Database rows -> ambience engine -> the JSON of spec 7.6.

The service reads the saved rooms, tables and windows of one restaurant and
answers, for a date and a time, where the sun falls and what each table is
like. It never returns personal data and never loads photo bytes.
"""

import json
import time as clock
from datetime import date, time

import pytest
from sqlalchemy.orm import Session

from app.models import (
    Organiser,
    Room,
    RoomFixture,
    RoomOpening,
    TurnTime,
    Venue,
    VenuePhoto,
    VenueTable,
)
from app.restaurant_service import ambience_view

LISBON = (38.7223, -9.1393)
DAY = date(2026, 6, 21)  # the longest day: sunrise about 06:12, sunset about 21:05
OUTLINE = {
    "points": [
        {"x": 0, "y": 0, "curve": 0},
        {"x": 1000, "y": 0, "curve": 0},
        {"x": 1000, "y": 700, "curve": 0},
        {"x": 0, "y": 700, "curve": 0},
    ]
}
SOUTH_SIDE = 2  # the clockwise side from (1000, 700) to (0, 700)


def make_venue(session: Session, organiser: Organiser, located: bool = True) -> Venue:
    venue = Venue(
        organiser_id=organiser.id,
        kind="restaurant",
        name="Casa Teste",
        width=1000,
        height=700,
        lat=LISBON[0] if located else None,
        lng=LISBON[1] if located else None,
    )
    session.add(venue)
    session.commit()
    return venue


def make_room(session: Session, venue: Venue, north: float | None = 0, **fields) -> Room:
    room = Room(venue_id=venue.id, name="Main room", north_deg=north, outline=OUTLINE, **fields)
    session.add(room)
    session.commit()
    return room


def add_window(session: Session, room: Room, side: int = SOUTH_SIDE, **fields) -> RoomOpening:
    values = {"offset": 300, "width": 400, "kind": "window"} | fields
    opening = RoomOpening(room_id=room.id, side=side, **values)
    session.add(opening)
    session.commit()
    return opening


def add_table(
    session: Session, venue: Venue, room: Room | None, x: float, y: float, **fields
) -> VenueTable:
    values = {"label": "T", "shape": "rect", "w": 80, "h": 80, "max_party": 4} | fields
    table = VenueTable(venue_id=venue.id, room_id=room.id if room else None, x=x, y=y, **values)
    session.add(table)
    session.commit()
    return table


def payload(session: Session, venue: Venue, at: time = time(13, 0), **options):
    return ambience_view.ambience_payload(session, venue, DAY, at, **options)


def by_id(rows: list[dict]) -> dict:
    return {row["id"]: row for row in rows}


@pytest.fixture
def sunny_venue(session: Session, organiser: Organiser):
    """One room with a south window; a table at the window and one in the middle."""
    venue = make_venue(session, organiser)
    room = make_room(session, venue)
    add_window(session, room)
    front = add_table(session, venue, room, 460, 615, label="Window")
    middle = add_table(session, venue, room, 460, 310, label="Middle")
    return venue, room, front, middle


# ---------------------------------------------------------------- the answer


def test_a_south_window_at_lunch_lights_the_window_table(session: Session, sunny_venue) -> None:
    venue, room, front, middle = sunny_venue
    answer = payload(session, venue)
    assert answer["located"] is True
    (summary,) = answer["rooms"]
    assert summary["id"] == room.id
    assert summary["night"] is False
    assert summary["sun_patches"], "a sunny window throws at least one patch"
    first = summary["sun_patches"][0]
    assert all(set(point) == {"x", "y"} for point in first)
    tables = by_id(answer["tables"])
    assert tables[front.id]["light"] == "sun"
    assert tables[middle.id]["light"] != "sun"
    assert any("sun" in phrase.lower() for phrase in tables[front.id]["phrases"])


def test_the_sun_is_reported_for_the_editor(session: Session, sunny_venue) -> None:
    venue = sunny_venue[0]
    sun = payload(session, venue)["sun"]
    assert sun["sunrise"] == "06:12" or sun["sunrise"] == "06:11" or sun["sunrise"] == "06:13"
    assert sun["sunset"].startswith("21:0") or sun["sunset"].startswith("21:1")
    # 13:00 summer time is 12:00 UTC, still before the 12:37 UTC solar noon of
    # Lisbon: the sun is high and in the south-east.
    assert 140 <= sun["azimuth"] <= 160
    assert 68 <= sun["altitude"] <= 76


def test_at_night_every_table_is_dark_and_there_are_no_patches(
    session: Session, sunny_venue
) -> None:
    venue = sunny_venue[0]
    answer = payload(session, venue, time(23, 0))
    assert answer["rooms"][0]["night"] is True
    assert answer["rooms"][0]["sun_patches"] == []
    assert {t["light"] for t in answer["tables"]} == {"night"}


def test_a_room_without_north_has_no_sun(session: Session, organiser: Organiser) -> None:
    venue = make_venue(session, organiser)
    room = make_room(session, venue, north=None)
    add_window(session, room)
    table = add_table(session, venue, room, 460, 615)
    answer = payload(session, venue)
    assert answer["rooms"][0]["sun_patches"] == []
    assert by_id(answer["tables"])[table.id]["light"] != "sun"


def test_inactive_tables_are_left_out(session: Session, sunny_venue) -> None:
    venue, _, front, middle = sunny_venue
    middle.is_active = False
    session.commit()
    ids = {t["id"] for t in payload(session, venue)["tables"]}
    assert ids == {front.id}


def test_each_table_uses_its_own_room(session: Session, organiser: Organiser) -> None:
    venue = make_venue(session, organiser)
    lit = make_room(session, venue)
    add_window(session, lit)
    dark = make_room(session, venue, position=1)
    first = add_table(session, venue, lit, 460, 615)
    second = add_table(session, venue, dark, 460, 615)
    tables = by_id(payload(session, venue)["tables"])
    assert tables[first.id]["light"] == "sun"
    assert tables[second.id]["light"] != "sun"
    ids = [r["id"] for r in payload(session, venue)["rooms"]]
    assert ids == [lit.id, dark.id]


def test_an_existing_restaurant_without_rooms_gets_an_implicit_room(
    session: Session, organiser: Organiser
) -> None:
    venue = make_venue(session, organiser)
    table = add_table(session, venue, None, 100, 100)
    answer = payload(session, venue)
    (summary,) = answer["rooms"]
    assert summary["id"] is None
    assert summary["sun_patches"] == []
    assert by_id(answer["tables"])[table.id]["light"] in ("interior", "daylight")


def test_a_restaurant_without_coordinates_makes_no_sun_claims(
    session: Session, organiser: Organiser
) -> None:
    venue = make_venue(session, organiser, located=False)
    room = make_room(session, venue)
    add_window(session, room)
    add_table(session, venue, room, 460, 615)
    answer = payload(session, venue)
    assert answer["located"] is False
    assert answer["tables"] == []
    assert answer["rooms"][0]["sun_patches"] == []
    assert answer["sun"] is None


# ---------------------------------------------------------------- the stay


def test_the_stay_length_comes_from_the_turn_times(session: Session, sunny_venue) -> None:
    venue, _, front, _ = sunny_venue
    session.add_all([TurnTime(venue_id=venue.id, max_party=2, minutes=45)])
    session.commit()
    short = by_id(payload(session, venue, party=2, detail=True)["tables"])[front.id]
    assert short["sun_minutes"] == 45
    assert payload(session, venue, party=2)["stay_end"] == "13:45"
    # A party bigger than every row gets the longest time, as for bookings.
    assert payload(session, venue, party=6)["stay_end"] == "13:45"


def test_without_turn_times_the_stay_is_two_hours(session: Session, sunny_venue) -> None:
    venue, _, front, _ = sunny_venue
    answer = payload(session, venue)
    assert answer["stay_end"] == "15:00"
    assert by_id(payload(session, venue, detail=True)["tables"])[front.id]["sun_minutes"] == 120


def test_the_cursor_moment_moves_the_sun_but_not_the_stay(session: Session, sunny_venue) -> None:
    venue, _, front, _ = sunny_venue
    noon = payload(session, venue, time(13, 0))
    cursor = ambience_view.ambience_payload(session, venue, DAY, time(13, 0), moment=time(23, 0))
    assert noon["rooms"][0]["night"] is False
    assert cursor["rooms"][0]["night"] is True
    assert cursor["time"] == "23:00"
    assert cursor["stay_start"] == "13:00"
    # The sentences describe the stay, so they match the noon answer.
    assert (
        by_id(cursor["tables"])[front.id]["phrases"] == by_id(noon["tables"])[front.id]["phrases"]
    )


def test_detail_adds_the_numbers_behind_the_sentences(session: Session, sunny_venue) -> None:
    venue, _, front, _ = sunny_venue
    light = by_id(payload(session, venue)["tables"])[front.id]
    assert set(light) == {"id", "light", "phrases"}
    full = by_id(payload(session, venue, detail=True)["tables"])[front.id]
    assert {"sun_minutes", "sun_until", "sun_from", "view", "near", "quiet", "features"} <= set(
        full
    )
    assert "sun" in full["features"]


def test_a_view_comes_with_its_photo_url_and_no_bytes_are_loaded(
    session: Session, organiser: Organiser
) -> None:
    venue = make_venue(session, organiser)
    room = make_room(session, venue)
    window = add_window(session, room, view_text="river", view_tags=["river"])
    photo = VenuePhoto(
        venue_id=venue.id,
        kind="view",
        opening_id=window.id,
        content_type="image/png",
        data=b"x" * 100,
        width=10,
        height=10,
    )
    session.add(photo)
    session.commit()
    table = add_table(session, venue, room, 460, 615)
    full = by_id(payload(session, venue, detail=True)["tables"])[table.id]
    assert full["view"]["text"] == "river"
    assert full["view"]["photo_url"] == f"/api/photos/{photo.public_id}"
    assert "River view" in " ".join(full["phrases"]) or "View of" in " ".join(full["phrases"])


def test_the_fixtures_decide_what_is_near(session: Session, organiser: Organiser) -> None:
    venue = make_venue(session, organiser)
    room = make_room(session, venue)
    session.add(RoomFixture(room_id=room.id, kind="bar", shape="rect", x=560, y=300, w=200, h=60))
    session.commit()
    table = add_table(session, venue, room, 460, 300)
    full = by_id(payload(session, venue, detail=True)["tables"])[table.id]
    assert "bar" in full["near"]
    assert full["quiet"] is False


# ---------------------------------------------------------------- safety and cost


def test_the_payload_holds_no_personal_data(session: Session, sunny_venue) -> None:
    venue = sunny_venue[0]
    text = json.dumps(payload(session, venue, detail=True))
    assert "example.com" not in text
    assert "Casa Teste" not in text  # the name is not part of this answer
    assert "organiser" not in text


def test_two_hundred_tables_are_answered_quickly(session: Session, organiser: Organiser) -> None:
    venue = make_venue(session, organiser)
    room = make_room(session, venue)
    for side in range(4):
        add_window(session, room, side=side, offset=100, width=300)
    for index in range(200):
        add_table(session, venue, room, 20 + (index % 20) * 45, 20 + (index // 20) * 60, w=40, h=40)
    started = clock.perf_counter()
    answer = payload(session, venue, time(13, 0), party=4)
    elapsed = clock.perf_counter() - started
    assert len(answer["tables"]) == 200
    assert elapsed < 4.0, f"200 tables took {elapsed:.1f}s"
