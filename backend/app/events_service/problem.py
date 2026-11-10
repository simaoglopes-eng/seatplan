"""Turn database rows into the optimiser's frozen dataclasses (contract section 6).

The optimiser never imports the database, so this module is the one bridge:
it reads seats, neighbours, guests, groups and acquaintances, and builds an
EventProblem. It also reads the current plan (who sits where right now).
"""

from collections.abc import Iterable
from dataclasses import asdict
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.events_service.access import is_active
from app.models import (
    Acquaintance,
    Event,
    Guest,
    GuestGroup,
    Seat,
    SeatAssignment,
    SeatNeighbour,
)
from app.optimiser.events_model import (
    Assignment,
    EventProblem,
    GuestSpec,
    ScoreBreakdown,
    SeatSpec,
    Weights,
)
from app.optimiser.events_score import score

# Assignments with these sources were placed by a person, so the optimiser
# must treat them as fixed ("human choices are never moved", section 1).
HUMAN_SOURCES = ("self", "organiser")


def venue_seats(session: Session, venue_id: int) -> list[Seat]:
    return list(session.scalars(select(Seat).where(Seat.venue_id == venue_id).order_by(Seat.id)))


def event_guests(session: Session, event: Event) -> list[Guest]:
    query = select(Guest).where(Guest.event_id == event.id).order_by(Guest.id)
    return list(session.scalars(query))


def active_guests(session: Session, event: Event) -> list[Guest]:
    return [guest for guest in event_guests(session, event) if is_active(guest)]


def current_rows(session: Session, event: Event) -> dict[int, SeatAssignment]:
    """guest id -> their seat assignment row, for every seated guest."""
    rows = session.scalars(select(SeatAssignment).where(SeatAssignment.event_id == event.id))
    return {row.guest_id: row for row in rows}


def plan_of(rows: dict[int, SeatAssignment]) -> Assignment:
    return {guest_id: row.seat_id for guest_id, row in rows.items()}


def human_fixed(rows: dict[int, SeatAssignment], guest_ids: set[int]) -> dict[int, int]:
    """Seats chosen by a person (the guest or the organiser), for guests in the problem."""
    return {
        guest_id: row.seat_id
        for guest_id, row in rows.items()
        if row.source in HUMAN_SOURCES and guest_id in guest_ids
    }


def seat_spec(seat: Seat, blocked: bool = False) -> SeatSpec:
    return SeatSpec(
        id=seat.id,
        table_id=seat.table_id,
        x=seat.x,
        y=seat.y,
        accessible=seat.is_accessible,
        blocked=seat.is_blocked or blocked,
        reserved_tag=seat.reserved_tag,
    )


def neighbour_map(session: Session, seat_ids: set[int]) -> dict[int, frozenset[int]]:
    """seat id -> adjacent seat ids, keeping only seats inside `seat_ids`."""
    found: dict[int, set[int]] = {seat_id: set() for seat_id in seat_ids}
    for pair in session.scalars(select(SeatNeighbour).where(SeatNeighbour.seat_id.in_(seat_ids))):
        if pair.neighbour_id in seat_ids:
            found[pair.seat_id].add(pair.neighbour_id)
    return {seat_id: frozenset(ids) for seat_id, ids in found.items()}


def guest_specs(session: Session, guests: list[Guest]) -> tuple[GuestSpec, ...]:
    """One GuestSpec per guest. "knows" only keeps people who are in the list."""
    ids = {guest.id for guest in guests}
    knows: dict[int, set[int]] = {guest_id: set() for guest_id in ids}
    for row in session.scalars(select(Acquaintance).where(Acquaintance.guest_id.in_(ids))):
        if row.knows_guest_id in ids:
            knows[row.guest_id].add(row.knows_guest_id)
    group_ids = {guest.group_id for guest in guests if guest.group_id is not None}
    groups = session.scalars(select(GuestGroup).where(GuestGroup.id.in_(group_ids)))
    keep_adjacent = {group.id: group.keep_adjacent for group in groups}
    return tuple(
        GuestSpec(
            id=guest.id,
            group_id=guest.group_id,
            keep_adjacent=keep_adjacent.get(guest.group_id, False) if guest.group_id else False,
            needs_accessible=guest.needs_accessible,
            reserved_tag=guest.reserved_tag,
            knows=frozenset(knows[guest.id]),
        )
        for guest in guests
    )


def build_problem(
    session: Session,
    seats: Iterable[Seat],
    guests: list[Guest],
    fixed: dict[int, int],
    extra_blocked: frozenset[int] = frozenset(),
) -> EventProblem:
    """Build the problem from rows the caller already chose.

    extra_blocked: seats to treat as unusable for this question only, for
    example seats someone else is holding while we recommend seats.
    """
    seat_list = list(seats)
    seat_ids = {seat.id for seat in seat_list}
    return EventProblem(
        seats=tuple(seat_spec(seat, seat.id in extra_blocked) for seat in seat_list),
        guests=guest_specs(session, guests),
        neighbours=neighbour_map(session, seat_ids),
        fixed={guest_id: seat_id for guest_id, seat_id in fixed.items() if seat_id in seat_ids},
        weights=Weights(),
    )


def score_dict(breakdown: ScoreBreakdown) -> dict[str, float]:
    return asdict(breakdown)


def score_plan(session: Session, event: Event, venue_id: int, plan: Assignment) -> dict[str, Any]:
    """Score any plan of this event (used when saving undo snapshots)."""
    guests = active_guests(session, event)
    ids = {guest.id for guest in guests}
    problem = build_problem(session, venue_seats(session, venue_id), guests, {})
    kept = {guest_id: seat_id for guest_id, seat_id in plan.items() if guest_id in ids}
    return score_dict(score(problem, kept))
