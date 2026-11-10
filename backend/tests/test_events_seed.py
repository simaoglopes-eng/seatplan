"""The events demo data: two events, valid plans, working links, same every run."""

from conftest import make_user
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.events_service.optimise import organiser_problem
from app.events_service.problem import current_rows, event_guests, plan_of, venue_seats
from app.models import Event, VenueTable
from app.optimiser.events_model import check_hard
from app.seed import demo_events


def _fingerprint(session: Session, event: Event) -> list[tuple[str, str | None]]:
    """Who sits where, by name and seat label, independent of database ids."""
    rows = current_rows(session, event)
    labels = {}
    for seat in venue_seats(session, event.venue_id):
        table = session.get(VenueTable, seat.table_id)
        labels[seat.id] = f"{table.label if table else '?'}/{seat.label}"
    return [
        (guest.name, labels[rows[guest.id].seat_id] if guest.id in rows else None)
        for guest in event_guests(session, event)
    ]


def test_seed_builds_two_valid_events(client: TestClient, session: Session) -> None:
    make_user(session, demo_events.DEMO_ORGANISER_EMAIL)
    links = demo_events.seed(session)
    session.commit()
    assert links["wedding_organiser"].startswith("/organiser/")
    assert links["conference_organiser"].startswith("/organiser/")
    attendee_links = [link for name, link in links.items() if "guest" in name or "speaker" in name]
    assert len(attendee_links) >= 5
    for link in attendee_links:
        assert client.get(link.replace("/e/", "/api/a/")).status_code == 200

    wedding, conference = session.scalars(select(Event).order_by(Event.id)).all()
    wedding_guests = event_guests(session, wedding)
    assert len(venue_seats(session, wedding.venue_id)) == 80
    assert 60 <= len(wedding_guests) <= 80
    seated = len(current_rows(session, wedding))
    assert abs(seated / len(wedding_guests) - 0.6) < 0.05
    conference_seats = venue_seats(session, conference.venue_id)
    assert len(conference_seats) == 150
    assert sum(1 for seat in conference_seats if seat.reserved_tag == "speaker") == 15
    for event in (wedding, conference):
        problem, rows = organiser_problem(session, event)
        assert check_hard(problem, plan_of(rows)) == []
        assert all(
            guest.email and guest.email.endswith("@example.com")
            for guest in event_guests(session, event)
        )


def test_seed_is_the_same_every_time(session: Session) -> None:
    make_user(session, demo_events.DEMO_ORGANISER_EMAIL)
    demo_events.seed(session)
    demo_events.seed(session)
    session.commit()
    events = session.scalars(select(Event).order_by(Event.id)).all()
    assert len(events) == 4
    assert _fingerprint(session, events[0]) == _fingerprint(session, events[2])
    assert _fingerprint(session, events[1]) == _fingerprint(session, events[3])
