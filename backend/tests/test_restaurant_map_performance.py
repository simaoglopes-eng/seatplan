"""The diner map with ambience stays quick for a big restaurant (spec 12: 60 tables under 300 ms).

Measured as the CPU time of this process (not the wall clock, which other programs on a busy machine stretch),
on the local test database through the real route (request check, rate limit, rooms, sun, light,
phrases, optimiser suggestions, JSON). The best of seven runs is compared, so one slow moment on a busy
machine does not fail the test; a real slowdown makes every run slow.
"""

import time
from datetime import time as clock

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from test_restaurant_helpers import add_schedule, future_day

from app.models import Organiser, Room, RoomFixture, RoomOpening, Seat, Venue, VenueTable

LIMIT_SECONDS = 0.300
TABLES = 60
OUTLINE = {
    "points": [
        {"x": 0, "y": 0, "curve": 0},
        {"x": 2000, "y": 0, "curve": 0},
        {"x": 2000, "y": 1400, "curve": 0},
        {"x": 0, "y": 1400, "curve": 150},
    ]
}


def big_restaurant(session: Session, owner: Organiser) -> Venue:
    venue = Venue(
        organiser_id=owner.id,
        kind="restaurant",
        name="Big House",
        slug="big-house",
        status="published",
        timezone="Europe/Lisbon",
        width=2000,
        height=1400,
        lat=38.7223,
        lng=-9.1393,
    )
    session.add(venue)
    session.flush()
    rooms = []
    for index in range(2):
        room = Room(
            venue_id=venue.id,
            name=f"Room {index + 1}",
            north_deg=20,
            outline=OUTLINE,
            position=index,
        )
        session.add(room)
        session.flush()
        for side, offset in ((0, 200), (0, 800), (1, 300), (2, 500), (3, 200)):
            session.add(
                RoomOpening(
                    room_id=room.id,
                    side=side,
                    offset=offset,
                    width=300,
                    kind="window",
                    view_text="The river",
                    view_tags=["river"],
                )
            )
        session.add(
            RoomFixture(
                room_id=room.id, kind="bar", shape="rect", x=800, y=1250, w=400, h=100, label="Bar"
            )
        )
        rooms.append(room)
    for number in range(TABLES):
        room = rooms[number % 2]
        column, row = number // 2 % 10, number // 20
        table = VenueTable(
            venue_id=venue.id,
            room_id=room.id,
            label=f"T{number + 1}",
            shape="rect",
            x=100 + column * 180,
            y=100 + row * 400,
            w=80,
            h=60,
            min_party=1,
            max_party=4,
        )
        session.add(table)
        session.flush()
        for chair in range(4):
            session.add(
                Seat(
                    venue_id=venue.id,
                    table_id=table.id,
                    label=str(chair + 1),
                    x=table.x + 20 * chair,
                    y=table.y - 12,
                )
            )
    add_schedule(session, venue.id, 400)
    session.commit()
    return venue


def best_of(runs: int, call) -> float:
    best = float("inf")
    for _ in range(runs):
        began = time.process_time()
        answer = call()
        assert answer.status_code == 200, answer.text
        best = min(best, time.process_time() - began)
    return best


def test_the_map_with_ambience_for_sixty_tables_answers_in_under_300_ms(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    venue = big_restaurant(session, organiser)
    params = {"date": future_day().isoformat(), "time": "13:00", "party": 2, "prefs": "sun,view"}
    first = client.get(f"/api/r/{venue.public_id}/map", params=params)
    assert first.status_code == 200
    body = first.json()
    assert len(body["tables"]) == TABLES and len(body["rooms"]) == 2
    assert all("ambience" in table for table in body["tables"])
    # The lunch sun and the river view are really worked out, not skipped for speed.
    assert any(table["ambience"]["light"] == "sun" for table in body["tables"]) or any(
        table["ambience"]["phrases"] for table in body["tables"]
    )
    assert (
        best_of(7, lambda: client.get(f"/api/r/{venue.public_id}/map", params=params))
        < LIMIT_SECONDS
    )


def test_the_light_route_for_sixty_tables_is_quick_too(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    venue = big_restaurant(session, organiser)
    params = {
        "date": future_day().isoformat(),
        "time": "13:00",
        "party": 2,
        "moment": clock(18, 30).isoformat("minutes"),
    }
    assert (
        best_of(7, lambda: client.get(f"/api/r/{venue.public_id}/ambience", params=params))
        < LIMIT_SECONDS
    )
