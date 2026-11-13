"""Re-plan the tables of one service, and measure how good the planner is.

Two staff tools, both built on the pure optimiser:

1. POST /staff/{vid}/optimise/service: assign_service re-plans the tables of
   the service's bookings. Only bookings the optimiser placed in the first
   place (table_choice "auto") and that are not seated yet may move. A diner
   who picked their own table, a diner who asked for sun, a view or the like, a party already sitting down, and every booking
   of another service stay exactly where they are (fixed_tables). The first
   call only previews; a second call with "apply" and the preview's plan_id
   writes it.
2. POST /staff/{vid}/optimise/exact-check: on a small slice of the service
   (at most max_parties bookings) run both the heuristic and assign_exact,
   the proven optimum, and report the gap between them.
"""

import hashlib
import time as clock
from dataclasses import dataclass, replace
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import ApiError, SeatTaken
from app.core.holds import commit_or_seat_taken
from app.models import Booking, Organiser, ServicePeriod, Venue
from app.optimiser.restaurant_assign import assign_service
from app.optimiser.restaurant_exact import assign_exact
from app.optimiser.restaurant_model import Assignment, PartySpec, ScoreBreakdown, score_plan
from app.restaurant_service import booking_rows, occupancy, schedule
from app.restaurant_service.availability import table_specs_for
from app.restaurant_service.changes import record_change
from app.restaurant_service.clock import booking_window, hhmm, local_datetime, venue_zone
from app.restaurant_service.whatif import tonight

# The exact solver grows exponentially with the number of parties; this many
# finish in well under a second, far inside the 30-second function limit.
DEFAULT_EXACT_PARTIES = 8
EXACT_TIME_LIMIT_S = 5.0


@dataclass(frozen=True)
class Service:
    """One service of one date, as the optimiser sees it."""

    name: str
    parties: list[PartySpec]  # every active booking of the date
    plan: Assignment  # booking id -> the tables it has now
    bookings: dict[int, Booking]
    inside: list[int]  # ids of the bookings that start in this service


def _period_named(session: Session, venue: Venue, day: date, name: str) -> ServicePeriod:
    for period in schedule.periods_for_day(session, venue, day):
        if period.name.lower() == name.lower():
            return period
    raise ApiError(404, "not_found", f"There is no service called {name} on this date.")


def load_service(session: Session, venue: Venue, day: date, name: str) -> Service:
    period = _period_named(session, venue, day, name)
    opens = local_datetime(venue, day, period.start_time)
    closes = local_datetime(venue, day, period.end_time)
    parties, plan, bookings = tonight(session, venue, day)
    inside = [pid for pid in plan if opens <= bookings[pid].start_at < closes]
    # Bookings of other services are never re-planned here: they keep their tables.
    frozen = [
        party if party.id in inside else replace(party, fixed_tables=plan[party.id])
        for party in parties
    ]
    return Service(period.name, frozen, plan, bookings, inside)


def _score(score: ScoreBreakdown) -> dict[str, int]:
    return {
        "covers_seated": score.covers_seated,
        "wasted_seats": score.wasted_seats,
        "parties_unseated": score.parties_unseated,
    }


def _run(fn: Any, *args: Any) -> Any:
    """Call the optimiser; a fixed booking that breaks a rule becomes a clear 409."""
    try:
        return fn(*args)
    except ValueError as problem:
        raise ApiError(409, "conflict", f"The planner cannot use this plan: {problem}") from None


# ---------------------------------------------------------------- re-plan


@dataclass(frozen=True)
class Proposal:
    service: Service
    new_plan: Assignment
    moved: list[int]  # booking ids whose tables change
    before: ScoreBreakdown
    after: ScoreBreakdown
    plan_id: str


def _plan_id(day: date, service: Service, moved: list[int], new_plan: Assignment) -> str:
    """A fingerprint of the exact moves, so "apply" writes what the preview showed."""
    parts = [day.isoformat(), service.name]
    parts += [f"{service.bookings[pid].public_id}:{new_plan[pid]}" for pid in moved]
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:16]


def propose(session: Session, venue: Venue, day: date, name: str, seed: int) -> Proposal:
    """The optimiser's plan, kept only if it seats everyone and scores better."""
    service = load_service(session, venue, day, name)
    specs = table_specs_for(session, venue)
    result = _run(assign_service, specs, service.parties, seed)
    # Scores count this service only; other services are fixed and never change.
    ours = [party for party in service.parties if party.id in service.inside]
    before = score_plan(specs, ours, service.plan)
    # Never trade a confirmed booking for a better score: everyone keeps a table.
    better = not result.unseated and result.score.key() > before.key()
    new_plan = dict(result.assignments) if better else dict(service.plan)
    moved = [pid for pid in sorted(new_plan) if new_plan[pid] != service.plan[pid]]
    after = score_plan(specs, ours, new_plan)
    return Proposal(
        service, new_plan, moved, before, after, _plan_id(day, service, moved, new_plan)
    )


def _move_row(session: Session, venue: Venue, proposal: Proposal, pid: int) -> dict[str, Any]:
    booking = proposal.service.bookings[pid]
    return {
        "booking_id": booking.public_id,
        "name": booking.name,
        "party_size": booking.party_size,
        "time": hhmm(booking.start_at.astimezone(venue_zone(venue)).time()),
        "from_tables": booking_rows.table_labels(session, proposal.service.plan[pid]),
        "to_tables": booking_rows.table_labels(session, proposal.new_plan[pid]),
    }


def describe_proposal(
    session: Session, venue: Venue, day: date, proposal: Proposal, applied: bool
) -> dict[str, Any]:
    service = proposal.service
    fixed = [p for p in service.parties if p.id in service.inside and p.fixed_tables is not None]
    return {
        "date": day.isoformat(),
        "service": service.name,
        "applied": applied,
        "plan_id": proposal.plan_id,
        "moves": [_move_row(session, venue, proposal, pid) for pid in proposal.moved],
        "before": _score(proposal.before),
        "after": _score(proposal.after),
        "fixed": len(fixed),
        "movable": len(service.inside) - len(fixed),
    }


def _check_not_held(session: Session, venue: Venue, day: date, proposal: Proposal) -> None:
    """A diner may be holding a table we want to move a party onto. They come first."""
    held = occupancy.held_slots(session, venue, day)
    for pid in proposal.moved:
        window = booking_window(venue, proposal.service.bookings[pid])
        if not occupancy.is_free(proposal.new_plan[pid], held, window):
            raise SeatTaken("A diner is holding one of these tables. Try again in 5 minutes.")


def apply_proposal(
    session: Session, venue: Venue, day: date, proposal: Proposal, user: Organiser
) -> None:
    """Write the new tables of every moved booking in one transaction. Commits."""
    _check_not_held(session, venue, day, proposal)
    movers = [proposal.service.bookings[pid] for pid in proposal.moved]
    # Free every old table first, so two parties can swap tables.
    for booking in movers:
        booking_rows.release_slots(session, booking)
    session.flush()
    for booking in movers:
        window = booking_window(venue, booking)
        booking_rows.write_slots(session, booking, proposal.new_plan[booking.id], window)
    record_change(
        session,
        venue,
        [day],
        actor=user.email,
        action="service.optimise",
        entity="service",
        entity_id=proposal.service.name,
        detail={"moved": [booking.public_id for booking in movers]},
    )
    commit_or_seat_taken(session)


# ---------------------------------------------------------------- exact check


def _gap(heuristic: ScoreBreakdown, optimum: ScoreBreakdown) -> dict[str, Any]:
    covers = optimum.covers_seated - heuristic.covers_seated
    percent = round(100 * covers / optimum.covers_seated, 1) if optimum.covers_seated else 0.0
    return {
        "covers": covers,
        "wasted_seats": heuristic.wasted_seats - optimum.wasted_seats,
        "percent": percent,
    }


def exact_check(
    session: Session, venue: Venue, day: date, name: str, max_parties: int
) -> dict[str, Any]:
    """Heuristic versus proven optimum on the first max_parties bookings of a service."""
    service = load_service(session, venue, day, name)
    inside = [party for party in service.parties if party.id in service.inside]
    inside.sort(key=lambda party: (party.start_slot, party.id))
    # Both solvers get the same slice, so the comparison is fair.
    chosen = inside[:max_parties]
    specs = table_specs_for(session, venue)
    started = clock.perf_counter()
    heuristic = _run(assign_service, specs, chosen, 0)
    heuristic_seconds = clock.perf_counter() - started
    optimum = _run(assign_exact, specs, chosen, EXACT_TIME_LIMIT_S)
    return {
        "date": day.isoformat(),
        "service": service.name,
        "parties_total": len(inside),
        "parties_considered": len(chosen),
        "capped": len(chosen) < len(inside),
        "heuristic": {**_score(heuristic.score), "seconds": round(heuristic_seconds, 3)},
        "optimal": {
            **_score(optimum.score),
            "proven_optimal": optimum.proven_optimal,
            "method": optimum.method,
            "seconds": round(optimum.seconds, 3),
        },
        "gap": _gap(heuristic.score, optimum.score),
        "matches_optimum": heuristic.score.key() == optimum.score.key(),
    }
