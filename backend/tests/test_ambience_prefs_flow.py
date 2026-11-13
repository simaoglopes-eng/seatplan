"""Ambience wishes along the whole booking flow (spec 8.3).

The diner picks chips like "Sunny table" on step 1; they reach the map's
suggestion, "Choose for me", and the booking, which stores them for the staff.
Sunny and shade exclude each other, and unknown wishes are refused.
"""

from datetime import date
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from test_restaurant_helpers import Place, book, future_day, hold, make_restaurant

from app.models import Booking, Organiser, Room, RoomOpening, Venue, VenueTable

OUTLINE = {
    "points": [
        {"x": 0, "y": 0, "curve": 0},
        {"x": 1000, "y": 0, "curve": 0},
        {"x": 1000, "y": 700, "curve": 0},
        {"x": 0, "y": 700, "curve": 0},
    ]
}


def summer_day() -> date:
    year = future_day(1).year
    day = date(year, 6, 21)
    return day if day > future_day(1) else date(year + 1, 6, 21)


def sunny_restaurant(session: Session, owner: Organiser) -> Place:
    """The test bistro in Lisbon with one south window. Only T6 stands in the sun."""
    place = make_restaurant(session, owner)
    venue = session.get(Venue, place.venue_id)
    assert venue is not None
    venue.lat, venue.lng = 38.7223, -9.1393
    room = Room(venue_id=venue.id, name="Main room", north_deg=0, outline=OUTLINE)
    session.add(room)
    session.flush()
    session.add(RoomOpening(room_id=room.id, side=2, offset=300, width=400, kind="window"))
    for label, table_id in place.table.items():
        table = session.get(VenueTable, table_id)
        assert table is not None
        table.room_id = room.id
        table.x, table.y = (460, 615) if label == "T6" else (20, 20)
    session.commit()
    return place


def map_at(client: TestClient, place: Place, extra: dict[str, Any] | None = None, party: int = 4):
    params = {"date": summer_day().isoformat(), "time": "13:00", "party": party} | (extra or {})
    return client.get(f"/api/r/{place.public_id}/map", params=params)


# ---------------------------------------------------------------- the map


def test_without_wishes_the_suggestion_is_the_same_as_before(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = sunny_restaurant(session, organiser)
    body = map_at(client, place).json()
    assert body["recommended"][0]["labels"] != ["T6"]
    table = {t["label"]: t for t in body["tables"]}
    assert table["T6"]["ambience"]["light"] == "sun"
    assert "sun" in table["T6"]["ambience"]["features"]


def test_a_sunny_wish_puts_the_sunny_table_first_with_a_reason(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = sunny_restaurant(session, organiser)
    body = map_at(client, place, {"prefs": "sun"}).json()
    first = body["recommended"][0]
    assert first["labels"] == ["T6"]
    assert "Sunny, as you asked" in first["reasons"]


def test_wishes_are_checked(client: TestClient, session: Session, organiser: Organiser) -> None:
    place = sunny_restaurant(session, organiser)
    assert map_at(client, place, {"prefs": "sun,shade"}).status_code == 422
    assert map_at(client, place, {"prefs": "chandelier"}).status_code == 422
    assert map_at(client, place, {"prefs": "sun,sun"}).status_code == 200  # a repeat is harmless
    assert map_at(client, place, {"prefs": ""}).status_code == 200
    assert (
        map_at(client, place, {"prefs": "sun,view,quiet,away_from_wc,shade,sun"}).status_code == 422
    )


# ---------------------------------------------------------------- choose for me


def test_choose_for_me_follows_the_wish(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = sunny_restaurant(session, organiser)
    plain = hold(client, place, summer_day(), "13:00", 4)
    assert plain.status_code == 201
    assert plain.json()["table"]["labels"] != ["T6"]
    client.delete(f"/api/r/{place.public_id}/hold/{plain.json()['hold_id']}")
    wished = hold(client, place, summer_day(), "13:00", 4, prefs=["sun"])
    assert wished.status_code == 201, wished.text
    assert wished.json()["table"]["labels"] == ["T6"]


def test_a_hold_refuses_bad_wishes(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = sunny_restaurant(session, organiser)
    for prefs in (["sun", "shade"], ["chandelier"], ["sun"] * 6):
        refused = hold(client, place, summer_day(), "13:00", 4, prefs=prefs)
        assert refused.status_code == 422, prefs


# ---------------------------------------------------------------- the booking


def test_the_booking_keeps_the_wishes_for_the_staff(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = sunny_restaurant(session, organiser)
    held = hold(client, place, summer_day(), "13:00", 4, prefs=["sun", "view"])
    assert held.status_code == 201
    booked = book(client, place, held.json()["hold_id"], 4, prefs=["view", "sun"])
    assert booked.status_code == 201, booked.text
    assert booked.json()["booking"]["prefs"] == ["sun", "view"]  # always in the same order
    stored = session.query(Booking).filter_by(venue_id=place.venue_id).one()
    assert stored.prefs == ["sun", "view"]


def test_a_booking_without_wishes_has_an_empty_list(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = sunny_restaurant(session, organiser)
    held = hold(client, place, summer_day(), "13:00", 2)
    booked = book(client, place, held.json()["hold_id"], 2)
    assert booked.json()["booking"]["prefs"] == []


def test_a_booking_refuses_bad_wishes(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = sunny_restaurant(session, organiser)
    held = hold(client, place, summer_day(), "13:00", 2)
    refused = book(client, place, held.json()["hold_id"], 2, prefs=["sun", "shade"])
    assert refused.status_code == 422
    # The hold was not used up by the refusal.
    assert book(client, place, held.json()["hold_id"], 2).status_code == 201
