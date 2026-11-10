"""The database itself refuses duplicates and dangling references."""

from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    Booking,
    EmailOutbox,
    Event,
    Guest,
    Hold,
    Organiser,
    PlanSnapshot,
    Seat,
    SeatAssignment,
    TableSlot,
    Venue,
    VenueTable,
)
from app.security import hash_token

NOW = datetime(2026, 11, 20, 19, 0, tzinfo=UTC)


def _base(session: Session) -> tuple[Organiser, Venue, VenueTable]:
    owner = Organiser(email="model.owner@example.com", name="Owner", password_hash="x")
    session.add(owner)
    session.flush()
    venue = Venue(organiser_id=owner.id, kind="event", name="Hall", width=100, height=100)
    session.add(venue)
    session.flush()
    table = VenueTable(
        venue_id=venue.id, label="T1", shape="rect", x=0, y=0, w=20, h=10, max_party=6
    )
    session.add(table)
    session.flush()
    return owner, venue, table


def _event_with_seats_and_guests(session: Session) -> tuple[Event, list[Seat], list[Guest]]:
    owner, venue, table = _base(session)
    seats = [Seat(venue_id=venue.id, table_id=table.id, label=f"S{i}", x=i, y=0) for i in range(2)]
    event = Event(
        venue_id=venue.id,
        organiser_id=owner.id,
        name="Gala",
        starts_at=NOW,
        ends_at=NOW + timedelta(hours=2),
    )
    session.add_all([*seats, event])
    session.flush()
    guests = [
        Guest(event_id=event.id, name=f"Guest {i}", token_hash=hash_token(f"g{i}"))
        for i in range(2)
    ]
    session.add_all(guests)
    session.flush()
    return event, seats, guests


def _expect_integrity_error(session: Session) -> None:
    with pytest.raises(IntegrityError):
        session.flush()
    session.rollback()


def test_two_guests_cannot_share_a_seat(session: Session) -> None:
    event, seats, guests = _event_with_seats_and_guests(session)
    session.add(
        SeatAssignment(event_id=event.id, seat_id=seats[0].id, guest_id=guests[0].id, source="self")
    )
    session.flush()
    session.add(
        SeatAssignment(event_id=event.id, seat_id=seats[0].id, guest_id=guests[1].id, source="self")
    )
    _expect_integrity_error(session)


def test_one_guest_cannot_have_two_seats(session: Session) -> None:
    event, seats, guests = _event_with_seats_and_guests(session)
    session.add(
        SeatAssignment(event_id=event.id, seat_id=seats[0].id, guest_id=guests[0].id, source="self")
    )
    session.flush()
    session.add(
        SeatAssignment(event_id=event.id, seat_id=seats[1].id, guest_id=guests[0].id, source="self")
    )
    _expect_integrity_error(session)


def test_two_snapshots_cannot_share_a_scenario_number(session: Session) -> None:
    # Two auto-fills at once could both compute max(seq) + 1; one must fail.
    event, _seats, _guests = _event_with_seats_and_guests(session)
    for _ in range(2):
        session.add(
            PlanSnapshot(event_id=event.id, seq=1, label="Auto-fill", assignments={}, score={})
        )
    _expect_integrity_error(session)


def test_hold_unique_per_resource_and_slot(session: Session) -> None:
    def hold(holder: str) -> Hold:
        return Hold(
            scope="event-x",
            resource_kind="seat",
            resource_id=1,
            slot_key="",
            holder_key=holder,
            expires_at=NOW,
        )

    session.add(hold("a"))
    session.flush()
    session.add(hold("b"))
    _expect_integrity_error(session)


def test_table_slot_cannot_be_booked_twice(session: Session) -> None:
    _owner, venue, table = _base(session)
    bookings = [
        Booking(
            venue_id=venue.id,
            date=date(2026, 11, 20),
            start_at=NOW,
            end_at=NOW + timedelta(hours=2),
            party_size=2,
            name=f"Diner {i}",
            email=f"diner{i}@example.com",
            manage_token_hash=hash_token(f"b{i}"),
        )
        for i in range(2)
    ]
    session.add_all(bookings)
    session.flush()
    session.add(
        TableSlot(
            table_id=table.id, date=date(2026, 11, 20), slot_index=76, booking_id=bookings[0].id
        )
    )
    session.flush()
    session.add(
        TableSlot(
            table_id=table.id, date=date(2026, 11, 20), slot_index=76, booking_id=bookings[1].id
        )
    )
    _expect_integrity_error(session)


def test_email_idempotency_key_is_unique(session: Session) -> None:
    def email() -> EmailOutbox:
        return EmailOutbox(
            idempotency_key="k1",
            to_email="ana@example.com",
            kind="test",
            subject="Hi",
            body_text="Hi",
            body_html="<p>Hi</p>",
        )

    session.add(email())
    session.flush()
    session.add(email())
    _expect_integrity_error(session)


def test_organiser_email_and_guest_token_unique(session: Session) -> None:
    session.add_all(
        [
            Organiser(email="same@example.com", name="A", password_hash="x"),
            Organiser(email="same@example.com", name="B", password_hash="x"),
        ]
    )
    _expect_integrity_error(session)
    _event, _seats, guests = _event_with_seats_and_guests(session)
    session.add(Guest(event_id=guests[0].event_id, name="Copy", token_hash=guests[0].token_hash))
    _expect_integrity_error(session)


def test_sqlite_enforces_foreign_keys(session: Session) -> None:
    session.add(Seat(venue_id=999, table_id=999, label="ghost", x=0, y=0))
    _expect_integrity_error(session)


def test_datetimes_come_back_timezone_aware(session: Session) -> None:
    event, _seats, _guests = _event_with_seats_and_guests(session)
    session.commit()
    session.expire_all()
    assert session.get(Event, event.id).starts_at == NOW
    assert session.get(Event, event.id).starts_at.tzinfo is not None


def test_naive_datetimes_are_refused(session: Session) -> None:
    session.add(
        Hold(
            scope="s",
            resource_kind="seat",
            resource_id=1,
            holder_key="a",
            expires_at=datetime(2026, 1, 1),
        )
    )
    with pytest.raises(Exception, match="timezone-aware"):
        session.flush()
