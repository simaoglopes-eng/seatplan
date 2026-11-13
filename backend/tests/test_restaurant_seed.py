"""The demo restaurant: shape of the floor, valid bookings, determinism, links."""

from conftest import auth_header
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import (
    Booking,
    EmailOutbox,
    Organiser,
    Room,
    TableSlot,
    Venue,
    VenuePhoto,
    VenueTable,
    Zone,
)
from app.optimiser.restaurant_model import check_hard
from app.restaurant_service import occupancy
from app.restaurant_service.clock import booking_window
from app.restaurant_service.whatif import tonight
from app.seed import demo_photos, demo_restaurant, demo_showcase
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


# ---------------------------------------------------------------- the showcase restaurants (spec 13)


def _seed_everything(session: Session) -> dict[str, str]:
    ensure_demo_users(session, get_settings())
    links = {**demo_restaurant.seed(session), **demo_showcase.seed(session)}
    session.commit()
    return links


def test_the_showcase_has_four_invented_restaurants_and_casa_lumen_is_listed_too(
    client: TestClient, session: Session
) -> None:
    links = _seed_everything(session)
    assert {name for name in links if name.startswith("showcase_")} == {
        "showcase_tagus_terrace",
        "showcase_patio_das_laranjeiras",
        "showcase_miradouro_7",
        "showcase_tasca_do_bairro",
    }
    found = client.get("/api/restaurants", params={"limit": 50}).json()
    assert sorted(item["name"] for item in found["items"]) == [
        "Casa Lumen",
        "Miradouro 7",
        "Pátio das Laranjeiras",
        "Tagus Terrace",
        "Tasca do Bairro",
    ]
    assert all(item["cover_url"] and item["cover_alt"] for item in found["items"])
    assert all(item["lat"] is not None and item["price_level"] for item in found["items"])


def test_each_showcase_shows_what_it_is_meant_to_show(client: TestClient, session: Session) -> None:
    _seed_everything(session)

    def features(slug: str) -> dict[str, bool]:
        return client.get(f"/api/restaurants/{slug}").json()["features"]

    assert features("tagus-terrace") == {
        "sun": True,
        "view": True,
        "accessible": True,
        "terrace": True,
    }
    assert features("patio-das-laranjeiras")["terrace"] is True
    assert features("miradouro-7")["view"] is True and features("miradouro-7")["terrace"] is False
    quiet = features("tasca-do-bairro")
    assert quiet["view"] is False and quiet["terrace"] is False and quiet["sun"] is False
    assert client.get("/api/restaurants/tagus-terrace").json()["rooms_summary"] == [
        "River hall",
        "Quay terrace",
    ]
    miradouro = session.scalars(select(Room).where(Room.name == "Panorama room")).one()
    assert any(point["curve"] for point in miradouro.outline["points"])


def test_the_showcase_can_be_booked_and_its_email_has_the_map(
    client: TestClient, session: Session
) -> None:
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo

    _seed_everything(session)
    page = client.get("/api/restaurants/miradouro-7").json()
    day = (datetime.now(ZoneInfo("Europe/Lisbon")).date() + timedelta(days=9)).isoformat()
    held = client.post(
        f"/api/r/{page['public_id']}/hold", json={"date": day, "time": "20:00", "party": 2}
    )
    assert held.status_code == 201, held.text
    booked = client.post(
        f"/api/r/{page['public_id']}/bookings",
        json={
            "hold_id": held.json()["hold_id"],
            "party": 2,
            "name": "Rui Demo",
            "email": "rui@example.com",
        },
    )
    assert booked.status_code == 201, booked.text
    row = session.scalars(select(EmailOutbox).where(EmailOutbox.kind == "booking_confirmed")).one()
    assert row.image_png and "Largo da Graça 7" in row.body_html and "/api/photos/" in row.body_html
    assert row.subject.startswith("Booked: Miradouro 7, ")


def test_every_demo_photo_is_drawn_here_small_and_described(session: Session) -> None:
    _seed_everything(session)
    photos = session.scalars(select(VenuePhoto)).all()
    assert len(photos) >= 8
    for photo in photos:
        assert photo.data[:4] == bytes([0x89]) + b"PNG" and len(photo.data) < 60_000
        assert (photo.width, photo.height) == (demo_photos.WIDTH, demo_photos.HEIGHT)
        assert photo.alt_text.startswith("An illustration of")
    # Exactly one cover per restaurant.
    covers = [p.venue_id for p in photos if p.is_cover]
    assert len(covers) == len(set(covers)) == 5
    assert "SOURCE OF EVERY DEMO PHOTO" in (demo_photos.__doc__ or "")
