"""The diner map with rooms and ambience (spec 9.3), the light /ambience route
(spec 7.6) and tables that are switched off (spec 6.10).

Old map fields never change; rooms, ambience and the sun are only added.
"""

from datetime import date, time
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from test_restaurant_helpers import (
    Place,
    future_day,
    hold,
    make_restaurant,
    place_booking,
)

from app.models import Organiser, Room, RoomFixture, RoomOpening, Venue, VenueTable

OUTLINE = {
    "points": [
        {"x": 0, "y": 0, "curve": 0},
        {"x": 1000, "y": 0, "curve": 0},
        {"x": 1000, "y": 700, "curve": 0},
        {"x": 0, "y": 700, "curve": 0},
    ]
}
OLD_MAP_FIELDS = {
    "date",
    "time",
    "party",
    "slot_status",
    "width",
    "height",
    "zones",
    "tables",
    "seats",
    "recommended",
}
OLD_TABLE_FIELDS = {
    "id",
    "label",
    "shape",
    "x",
    "y",
    "w",
    "h",
    "rotation",
    "zone_id",
    "zone_kind",
    "min_party",
    "max_party",
    "accessible",
    "high_chair_ok",
    "combine_group",
    "state",
    "fits_party",
}


def summer_day() -> date:
    """A future 21 June: long day, sun in the south at lunch."""
    year = future_day(1).year
    day = date(year, 6, 21)
    return day if day > future_day(1) else date(year + 1, 6, 21)


def get_map(client: TestClient, place: Place, day: date, at: str = "13:00", party: int = 2) -> Any:
    answer = client.get(
        f"/api/r/{place.public_id}/map",
        params={"date": day.isoformat(), "time": at, "party": party},
    )
    assert answer.status_code == 200, answer.text
    return answer.json()


def locate(session: Session, place: Place) -> Venue:
    venue = session.get(Venue, place.venue_id)
    assert venue is not None
    venue.lat, venue.lng = 38.7223, -9.1393
    session.commit()
    return venue


def add_room(session: Session, place: Place, **fields: Any) -> Room:
    values = {"name": "Main room", "north_deg": 0, "outline": OUTLINE} | fields
    room = Room(venue_id=place.venue_id, **values)
    session.add(room)
    session.commit()
    return room


# ---------------------------------------------------------------- the map


def test_old_fields_stay_and_a_plain_restaurant_gets_an_implicit_room(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    body = get_map(client, place, future_day())
    assert OLD_MAP_FIELDS <= set(body)
    for table in body["tables"]:
        assert OLD_TABLE_FIELDS <= set(table)
        assert table["room_id"] is None
        assert table["is_active"] is True
        assert table["ambience"] is None  # no coordinates: no claims about the sun
    # Two hours is the default stay of this restaurant's turn times for a party of two: 90 min.
    assert (body["stay_start"], body["stay_end"]) == ("13:00", "14:30")
    (room,) = body["rooms"]
    assert room["id"] is None
    assert (room["width"], room["height"]) == (800, 600)
    assert room["sun"] is None
    assert room["sun_patches"] == []
    assert room["night"] is False
    assert room["openings"] == [] and room["fixtures"] == []


def test_a_saved_room_brings_its_walls_windows_fixtures_and_sun(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    locate(session, place)
    room = add_room(session, place)
    window = RoomOpening(
        room_id=room.id,
        side=2,
        offset=300,
        width=400,
        kind="window",
        view_text="river",
        view_tags=["river"],
        sun_rule="between",  # an internal owner rule, never sent to diners
    )
    session.add(window)
    session.add(RoomFixture(room_id=room.id, kind="bar", shape="rect", x=10, y=10, w=100, h=40))
    for table in session.query(VenueTable).filter_by(venue_id=place.venue_id):
        table.room_id = room.id
        table.x, table.y, table.w, table.h = 460, 615, 80, 80
    session.commit()

    body = get_map(client, place, summer_day())
    (shown,) = body["rooms"]
    assert shown["id"] == room.id and shown["name"] == "Main room"
    assert shown["outline"] == OUTLINE
    assert (shown["width"], shown["height"]) == (1000, 700)
    assert shown["north_deg"] == 0 and shown["is_outdoor"] is False
    (opening,) = shown["openings"]
    assert opening["id"] == window.id
    assert opening["kind"] == "window" and opening["view_text"] == "river"
    assert not {"sun_rule", "sun_from", "sun_until", "top_height"} & set(opening)
    assert [f["kind"] for f in shown["fixtures"]] == ["bar"]
    assert shown["sun"]["sunset"] is not None
    assert shown["night"] is False
    # A window that "only shines between" nothing never lets sun in.
    assert shown["sun_patches"] == []
    window.sun_rule = "auto"
    session.commit()
    sunny = get_map(client, place, summer_day())["rooms"][0]
    assert sunny["sun_patches"]
    assert all(t["room_id"] == room.id for t in get_map(client, place, summer_day())["tables"])
    ambience = get_map(client, place, summer_day())["tables"][0]["ambience"]
    assert {"light", "phrases", "sun_minutes", "view", "near", "quiet", "features"} <= set(ambience)
    assert "id" not in ambience


def test_the_map_reports_the_night_in_the_evening(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    locate(session, place)
    room = add_room(session, place)
    session.add(RoomOpening(room_id=room.id, side=2, offset=300, width=400, kind="window"))
    session.commit()
    body = get_map(client, place, summer_day(), at="22:00")
    assert body["rooms"][0]["night"] is True
    assert body["rooms"][0]["sun_patches"] == []


# ---------------------------------------------------------------- tables switched off


def switch_off(session: Session, place: Place, label: str) -> None:
    table = session.get(VenueTable, place.table[label])
    assert table is not None
    table.is_active = False
    session.commit()


def test_a_table_that_is_off_never_reaches_the_diner(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    switch_off(session, place, "T1")
    body = get_map(client, place, future_day(), at="19:00", party=2)
    assert "T1" not in [t["label"] for t in body["tables"]]
    assert place.table["T1"] not in [s["table_id"] for s in body["seats"]]
    assert all(label != "T1" for choice in body["recommended"] for label in choice["labels"])
    refused = hold(client, place, future_day(), "19:00", 2, table_id=place.table["T1"])
    assert refused.status_code == 422


def test_an_old_booking_on_a_table_that_is_off_still_works(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    day = future_day()
    place_booking(session, place, ["T1"], day, time(19, 0), 90, 2)
    switch_off(session, place, "T1")
    # The slots page and the map still answer, and the table stays out of them.
    assert (
        client.get(
            f"/api/r/{place.public_id}/slots", params={"date": day.isoformat(), "party": 2}
        ).status_code
        == 200
    )
    assert "T1" not in [t["label"] for t in get_map(client, place, day, "19:00")["tables"]]


# ---------------------------------------------------------------- the light route


def test_the_light_route_answers_the_spec_shape(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    locate(session, place)
    room = add_room(session, place)
    session.add(RoomOpening(room_id=room.id, side=2, offset=300, width=400, kind="window"))
    for table in session.query(VenueTable).filter_by(venue_id=place.venue_id):
        table.room_id = room.id
    session.commit()
    day = summer_day()
    answer = client.get(
        f"/api/r/{place.public_id}/ambience",
        params={"date": day.isoformat(), "time": "13:00", "party": 2},
    )
    assert answer.status_code == 200, answer.text
    body = answer.json()
    assert set(body["rooms"][0]) == {"id", "sun_patches", "night"}
    assert all(set(t) == {"id", "light", "phrases"} for t in body["tables"])
    assert len(body["tables"]) == 6
    assert body["time"] == "13:00" and body["stay_start"] == "13:00"

    cursor = client.get(
        f"/api/r/{place.public_id}/ambience",
        params={"date": day.isoformat(), "time": "13:00", "party": 2, "moment": "14:30"},
    ).json()
    assert cursor["time"] == "14:30" and cursor["stay_start"] == "13:00"


def test_the_light_route_has_no_personal_data_and_the_usual_limits(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    locate(session, place)
    day = summer_day()
    text = client.get(
        f"/api/r/{place.public_id}/ambience",
        params={"date": day.isoformat(), "time": "13:00", "party": 2},
    ).text
    assert "Test Bistro" not in text and "example.com" not in text
    missing = client.get(
        "/api/r/does-not-exist/ambience",
        params={"date": day.isoformat(), "time": "13:00", "party": 2},
    )
    assert missing.status_code == 404
    too_big = client.get(
        f"/api/r/{place.public_id}/ambience",
        params={"date": day.isoformat(), "time": "13:00", "party": 99},
    )
    assert too_big.status_code == 422


def test_the_light_route_shares_the_read_limit(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    from app.routers.restaurants import READ_LIMIT

    place = make_restaurant(session, organiser)
    params = {"date": future_day().isoformat(), "time": "19:00", "party": 2}
    # The limiter counts per calendar minute, so a burst that crosses the turn of
    # the minute is counted in two parts: 2 * READ_LIMIT + 1 calls always hit it.
    for _ in range(2 * READ_LIMIT + 1):
        answer = client.get(f"/api/r/{place.public_id}/ambience", params=params)
        if answer.status_code == 429:
            return
        assert answer.status_code == 200
    raise AssertionError("the read limit never answered 429")
