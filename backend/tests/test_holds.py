"""Holds: taking, refreshing, expiry, confirming, and the 30-thread race."""

import threading
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app import db
from app.core.errors import HoldExpired, SeatTaken
from app.core.holds import commit_or_seat_taken, confirm_hold, take_hold
from app.models import (
    Event,
    Guest,
    Hold,
    Organiser,
    Seat,
    SeatAssignment,
    Venue,
    VenueTable,
)
from app.security import hash_token

SCOPE = "event-abcdefghijkl"


def _hold(session: Session, holder: str, seat_id: int = 1) -> Hold:
    return take_hold(
        session, scope=SCOPE, resource_kind="seat", resource_id=seat_id, holder_key=holder
    )


def test_second_holder_gets_seat_taken(session: Session) -> None:
    _hold(session, "guest-a")
    with pytest.raises(SeatTaken):
        _hold(session, "guest-b")


def test_same_holder_can_refresh_their_hold(session: Session) -> None:
    first = _hold(session, "guest-a")
    second = _hold(session, "guest-a")
    assert second.expires_at >= first.expires_at
    assert session.scalar(select(func.count()).select_from(Hold)) == 1


def test_expired_hold_is_replaced(session: Session) -> None:
    old = _hold(session, "guest-a")
    old.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    session.commit()
    new = _hold(session, "guest-b")
    assert new.holder_key == "guest-b"
    assert session.scalar(select(func.count()).select_from(Hold)) == 1


def test_hold_lasts_five_minutes(session: Session) -> None:
    hold = _hold(session, "guest-a")
    remaining = hold.expires_at - datetime.now(UTC)
    assert timedelta(minutes=4, seconds=50) < remaining <= timedelta(minutes=5)


def test_different_slots_do_not_clash(session: Session) -> None:
    take_hold(
        session,
        scope=SCOPE,
        resource_kind="table",
        resource_id=7,
        holder_key="a",
        slot_key="2026-11-20T19:00",
    )
    take_hold(
        session,
        scope=SCOPE,
        resource_kind="table",
        resource_id=7,
        holder_key="b",
        slot_key="2026-11-20T21:00",
    )


def test_confirm_consumes_the_hold(session: Session) -> None:
    _hold(session, "guest-a")
    confirm_hold(session, scope=SCOPE, resource_kind="seat", resource_id=1, holder_key="guest-a")
    session.commit()
    assert session.scalar(select(func.count()).select_from(Hold)) == 0


def test_confirm_after_expiry_fails(session: Session) -> None:
    _hold(session, "guest-a")
    later = datetime.now(UTC) + timedelta(minutes=6)
    with pytest.raises(HoldExpired):
        confirm_hold(
            session,
            scope=SCOPE,
            resource_kind="seat",
            resource_id=1,
            holder_key="guest-a",
            now=later,
        )


def test_confirm_by_someone_else_fails(session: Session) -> None:
    _hold(session, "guest-a")
    with pytest.raises(HoldExpired):
        confirm_hold(
            session, scope=SCOPE, resource_kind="seat", resource_id=1, holder_key="guest-b"
        )


# ---------------------------------------------------------------- the race

THREADS = 30


def _make_event_with_guests(session: Session) -> tuple[int, int, list[int]]:
    """One event, one seat, THREADS guests. Returns (event id, seat id, guest ids)."""
    owner = Organiser(email="race@example.com", name="Race Owner", password_hash="x")
    session.add(owner)
    session.flush()
    venue = Venue(organiser_id=owner.id, kind="event", name="Hall", width=100, height=100)
    session.add(venue)
    session.flush()
    table = VenueTable(
        venue_id=venue.id, label="T1", shape="round", x=0, y=0, w=10, h=10, max_party=8
    )
    session.add(table)
    session.flush()
    seat = Seat(venue_id=venue.id, table_id=table.id, label="T1-1", x=5, y=0)
    now = datetime.now(UTC)
    event = Event(
        venue_id=venue.id,
        organiser_id=owner.id,
        name="Gala",
        starts_at=now,
        ends_at=now + timedelta(hours=3),
    )
    session.add_all([seat, event])
    session.flush()
    guests = [
        Guest(event_id=event.id, name=f"Guest {i}", token_hash=hash_token(f"t{i}"))
        for i in range(THREADS)
    ]
    session.add_all(guests)
    session.commit()
    return event.id, seat.id, [guest.id for guest in guests]


def _hold_then_confirm(
    event_id: int, seat_id: int, guest_id: int, start: threading.Barrier, outcomes: list[str]
) -> None:
    """What one browser does: hold the seat, then confirm it. Own session."""
    scope = f"event-{event_id:012d}"
    with db.new_session() as session:
        start.wait()  # every thread fires at the same moment
        try:
            take_hold(
                session,
                scope=scope,
                resource_kind="seat",
                resource_id=seat_id,
                holder_key=f"guest-{guest_id}",
            )
            confirm_hold(
                session,
                scope=scope,
                resource_kind="seat",
                resource_id=seat_id,
                holder_key=f"guest-{guest_id}",
            )
            session.add(
                SeatAssignment(event_id=event_id, seat_id=seat_id, guest_id=guest_id, source="self")
            )
            commit_or_seat_taken(session)
            outcomes.append("won")
        except SeatTaken:
            outcomes.append("seat_taken")
        except (SQLAlchemyError, HoldExpired) as error:  # shown if the test fails
            outcomes.append(f"error: {error!r}")


def _run_threads(target: Callable[..., None], args_per_thread: list[tuple[object, ...]]) -> None:
    threads = [threading.Thread(target=target, args=args) for args in args_per_thread]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=120)


def _only_hold(seat_id: int, guest_id: int, start: threading.Barrier, outcomes: list[str]) -> None:
    with db.new_session() as session:
        start.wait()
        try:
            take_hold(
                session,
                scope=SCOPE,
                resource_kind="seat",
                resource_id=seat_id,
                holder_key=f"guest-{guest_id}",
            )
            outcomes.append("held")
        except SeatTaken:
            outcomes.append("seat_taken")
        except (SQLAlchemyError, HoldExpired) as error:
            outcomes.append(f"error: {error!r}")


def test_thirty_threads_race_for_one_hold(session: Session, database_url: str) -> None:
    """Only the holds table's UNIQUE constraint stands between 30 simultaneous
    requests. Remove it and all 30 inserts succeed, so this test fails."""
    # A real file or server: an in-memory SQLite database is not shared by threads.
    assert ":memory:" not in database_url
    _event_id, seat_id, guest_ids = _make_event_with_guests(session)
    start = threading.Barrier(THREADS)
    outcomes: list[str] = []
    _run_threads(_only_hold, [(seat_id, gid, start, outcomes) for gid in guest_ids])

    assert outcomes.count("held") == 1, outcomes
    assert outcomes.count("seat_taken") == THREADS - 1, outcomes
    assert session.scalar(select(func.count()).select_from(Hold)) == 1


def test_thirty_people_hold_then_confirm_exactly_one_wins(
    session: Session, database_url: str
) -> None:
    """The full flow: 30 threads, 30 separate sessions, one file database.

    Exactly one person ends up with the seat and the other 29 hear SeatTaken,
    either from the holds constraint or, if they took a hold after the winner
    had already consumed theirs, from the seat_assignments constraint.
    """
    assert ":memory:" not in database_url
    event_id, seat_id, guest_ids = _make_event_with_guests(session)
    start = threading.Barrier(THREADS)
    outcomes: list[str] = []
    _run_threads(
        _hold_then_confirm, [(event_id, seat_id, gid, start, outcomes) for gid in guest_ids]
    )

    assert outcomes.count("won") == 1, outcomes
    assert outcomes.count("seat_taken") == THREADS - 1, outcomes
    session.expire_all()
    rows = session.scalars(select(SeatAssignment).where(SeatAssignment.seat_id == seat_id)).all()
    assert len(rows) == 1
