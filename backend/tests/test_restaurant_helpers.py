"""Shared helpers for the restaurant, booking and staff tests (no tests here).

make_restaurant() builds a tiny restaurant whose numbers are easy to count by
hand. Its tables (all in Europe/Lisbon time):

    label  zone     seats  min  extras
    T1     window   2      1
    T2     window   4      1
    T3     terrace  6      3
    T4     quiet    2      1    accessible, high chair
    T5     bar      4      1    combine group "A"
    T6     bar      4      1    combine group "A"

Lunch 12:00-15:00 and dinner 18:00-23:00 every day, seating every 15 minutes.
Turn times: up to 2 people 90 minutes, up to 4: 105, up to 6: 120, up to 10: 150.
"""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy.orm import Session

from app.models import (
    Booking,
    Organiser,
    ServicePeriod,
    TableSlot,
    TurnTime,
    Venue,
    VenueTable,
    Zone,
)
from app.security import hash_token

LISBON = ZoneInfo("Europe/Lisbon")

# (label, zone kind, max, min, accessible, high chair, combine group)
TABLES = (
    ("T1", "window", 2, 1, False, False, None),
    ("T2", "window", 4, 1, False, False, None),
    ("T3", "terrace", 6, 3, False, False, None),
    ("T4", "quiet", 2, 1, True, True, None),
    ("T5", "bar", 4, 1, False, False, "A"),
    ("T6", "bar", 4, 1, False, False, "A"),
)
TURN_TIMES = ((2, 90), (4, 105), (6, 120), (10, 150))


@dataclass(frozen=True)
class Place:
    venue_id: int
    public_id: str
    table: dict[str, int]  # label -> table id


def future_day(days: int = 7) -> date:
    """A date safely in the future, in the restaurant's own time zone."""
    return datetime.now(LISBON).date() + timedelta(days=days)


def make_restaurant(session: Session, owner: Organiser, cap: int = 40) -> Place:
    venue = Venue(
        organiser_id=owner.id,
        kind="restaurant",
        name="Test Bistro",
        # Explicit demo fixture: real restaurants are covered by owner isolation tests.
        is_demo=True,
        timezone="Europe/Lisbon",
        width=800,
        height=600,
    )
    session.add(venue)
    session.flush()
    zones: dict[str, int] = {}
    for kind in ("window", "terrace", "quiet", "bar"):
        zone = Zone(venue_id=venue.id, name=kind.title(), kind=kind, x=0, y=0, w=100, h=100)
        session.add(zone)
        session.flush()
        zones[kind] = zone.id
    ids: dict[str, int] = {}
    for label, kind, size, minimum, accessible, high_chair, group in TABLES:
        table = VenueTable(
            venue_id=venue.id,
            zone_id=zones[kind],
            label=label,
            shape="rect",
            x=10,
            y=10,
            w=50,
            h=40,
            max_party=size,
            min_party=minimum,
            is_accessible=accessible,
            high_chair_ok=high_chair,
            combine_group=group,
        )
        session.add(table)
        session.flush()
        ids[label] = table.id
    add_schedule(session, venue.id, cap)
    session.commit()
    return Place(venue.id, venue.public_id, ids)


def add_schedule(session: Session, venue_id: int, cap: int) -> None:
    for weekday in range(7):
        for name, start, end in (("Lunch", time(12), time(15)), ("Dinner", time(18), time(23))):
            session.add(
                ServicePeriod(
                    venue_id=venue_id,
                    name=name,
                    weekday=weekday,
                    start_time=start,
                    end_time=end,
                    slot_minutes=15,
                    max_covers_per_slot=cap,
                )
            )
    for max_party, minutes in TURN_TIMES:
        session.add(TurnTime(venue_id=venue_id, max_party=max_party, minutes=minutes))


def place_booking(
    session: Session,
    place: Place,
    labels: list[str],
    day: date,
    start: time,
    minutes: int,
    party: int,
    status: str = "confirmed",
    choice: str = "auto",
) -> Booking:
    """Write a booking straight into the database, with its table_slots rows."""
    begin = datetime.combine(day, start, tzinfo=LISBON)
    booking = Booking(
        venue_id=place.venue_id,
        date=day,
        start_at=begin,
        end_at=begin + timedelta(minutes=minutes),
        party_size=party,
        name="Hand Placed",
        email="hand.placed@example.com",
        status=status,
        source="staff",
        table_choice=choice,
        manage_token_hash=hash_token(f"t-{begin}-{labels}"),
    )
    session.add(booking)
    session.flush()
    if status in ("confirmed", "seated", "finishing"):
        first = (start.hour * 60 + start.minute) // 15
        for label in labels:
            for slot in range(first, first + minutes // 15):
                session.add(
                    TableSlot(
                        table_id=place.table[label],
                        date=day,
                        slot_index=slot,
                        booking_id=booking.id,
                    )
                )
    session.commit()
    return booking


def hold(
    client: TestClient, place: Place, day: date, at: str, party: int, **extra: Any
) -> Response:
    body = {"date": day.isoformat(), "time": at, "party": party, **extra}
    return client.post(f"/api/r/{place.public_id}/hold", json=body)


def book(client: TestClient, place: Place, hold_id: str, party: int, **extra: Any) -> Response:
    body = {
        "hold_id": hold_id,
        "party": party,
        "name": "Lia Moreno",
        "email": "lia.moreno@example.com",
        **extra,
    }
    return client.post(f"/api/r/{place.public_id}/bookings", json=body)


def hold_and_book(
    client: TestClient, place: Place, day: date, at: str, party: int, **extra: Any
) -> dict[str, Any]:
    held = hold(client, place, day, at, party, **extra)
    assert held.status_code == 201, held.text
    booked = book(client, place, held.json()["hold_id"], party)
    assert booked.status_code == 201, booked.text
    return booked.json()
