"""The demo restaurant: shape of the floor, valid bookings, determinism, links."""

from conftest import auth_header
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Booking, Organiser, TableSlot, Venue, VenueTable, Zone
from app.optimiser.restaurant_model import check_hard
from app.restaurant_service import occupancy
from app.restaurant_service.clock import booking_window
from app.restaurant_service.whatif import tonight
from app.seed import demo_restaurant
from app.seed.run import ensure_demo_users


def _seed(session: Session) -> tuple[Venue, dict[str, str]]:
    ensure_demo_users(session, get_settings())
    links = demo_restaurant.seed(session)
    session.commit()
    public_id = links["restaurant_booking"].removeprefix("/r/")
    venue = session.scalars(select(Venue).where(Venue.public_id == public_id)).one()
    return venue, links


def _signature(session: Session, venue: Venue) -> list[tuple[str, int, str, str]]:
    """Bookings without random ids or tokens, to compare two seeds."""
    rows = session.scalars(select(Booking).where(Booking.venue_id == venue.id).order_by(Booking.id))
    return [(b.date.isoformat(), b.party_size, b.start_at.isoformat(), b.name) for b in rows]


def test_seed_builds_the_demo_restaurant(session: Session) -> None:
    venue, links = _seed(session)
    assert links == {
        "restaurant_booking": f"/r/{venue.public_id}",
        "restaurant_staff": f"/staff/{venue.public_id}",
    }
    tables = session.scalars(select(VenueTable).where(VenueTable.venue_id == venue.id)).all()
    kinds = {z.kind for z in session.scalars(select(Zone).where(Zone.venue_id == venue.id))}
    assert len(tables) == 18 and kinds == {"window", "terrace", "bar", "quiet"}
    assert any(t.combine_group for t in tables)
    assert any(t.is_accessible for t in tables) and any(t.high_chair_ok for t in tables)
    statuses = {b.status for b in session.scalars(select(Booking))}
    assert {"completed", "no_show", "confirmed"} <= statuses


def test_seeded_bookings_follow_the_hard_rules(session: Session) -> None:
    venue, _links = _seed(session)
    specs = occupancy.table_specs(
        occupancy.venue_tables(session, venue), occupancy.zone_kinds(session, venue)
    )
    days = sorted({b.date for b in session.scalars(select(Booking)) if b.status == "confirmed"})
    assert days, "expected upcoming bookings"
    for day in days:
        parties, plan, _bookings = tonight(session, venue, day)
        assert check_hard(specs, parties, plan) == []
    for row in session.scalars(select(TableSlot)):
        booking = session.get(Booking, row.booking_id)
        assert booking is not None and booking.status in occupancy.ACTIVE_STATUSES
        start, end = booking_window(venue, booking)
        assert start <= row.slot_index < end


def test_seed_is_deterministic(session: Session) -> None:
    first, _ = _seed(session)
    second, _ = _seed(session)
    assert _signature(session, first) == _signature(session, second)


def test_dashboard_has_history_after_seeding(
    client: TestClient, session: Session, staff: Organiser
) -> None:
    _venue, links = _seed(session)
    response = client.get(f"/api{links['restaurant_staff']}/dashboard", headers=auth_header(staff))
    assert response.status_code == 200, response.text
    assert response.json()["no_show_based_on"] > 50
    assert 0 < response.json()["no_show_rate"] < 0.3
