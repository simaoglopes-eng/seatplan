"""How good is the heuristic? Compare it with the proven optimum on a small piece.

A whole wedding is far too big for an exact solver, so we cut out one or two
tables: their seats and the guests who sit there now. On that small piece we
run the normal heuristic and the exact solver and report the gap.

Both are scored on the same piece with the same objective. The exact solver
seats as many guests as possible first and only then maximises points, so the
points are only compared when both plans seat the same number of guests.
"""

import time
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.events_service.problem import active_guests, build_problem, current_rows, human_fixed
from app.models import Event, Seat, SeatAssignment, VenueTable
from app.optimiser.events_anneal import solve
from app.optimiser.events_exact import solve_exact
from app.optimiser.events_model import ExactResult, SolveResult

MAX_SEATS = 16  # beyond this the exact search can take minutes
HEURISTIC_ITERATIONS = 5000
EXACT_TIME_LIMIT_S = 10.0


def _busiest_table(session: Session, event: Event, rows: dict[int, SeatAssignment]) -> list[int]:
    """Default choice: the table where most guests sit now (lowest id on a tie)."""
    seats = session.scalars(select(Seat).where(Seat.venue_id == event.venue_id))
    table_of = {seat.id: seat.table_id for seat in seats}
    counts: dict[int, int] = {}
    for row in rows.values():
        table_id = table_of[row.seat_id]
        counts[table_id] = counts.get(table_id, 0) + 1
    if not counts:
        raise ApiError(422, "validation", "Nobody is seated yet, so there is nothing to check.")
    best = max(sorted(counts), key=lambda table_id: counts[table_id])
    return [best]


def _piece_seats(session: Session, event: Event, table_ids: list[int]) -> list[Seat]:
    tables = session.scalars(select(VenueTable).where(VenueTable.id.in_(table_ids))).all()
    if len(tables) != len(set(table_ids)) or any(t.venue_id != event.venue_id for t in tables):
        raise ApiError(422, "validation", "Choose tables from this event's venue.")
    seats = list(
        session.scalars(select(Seat).where(Seat.table_id.in_(table_ids)).order_by(Seat.id))
    )
    if len(seats) > MAX_SEATS:
        raise ApiError(
            422, "validation", f"Choose at most {MAX_SEATS} seats (one or two small tables)."
        )
    return seats


def exact_check(session: Session, event: Event, table_ids: list[int] | None) -> dict[str, Any]:
    rows = current_rows(session, event)
    chosen = table_ids or _busiest_table(session, event, rows)
    seats = _piece_seats(session, event, chosen)
    seat_ids = {seat.id for seat in seats}
    guests = [
        g for g in active_guests(session, event) if g.id in rows and rows[g.id].seat_id in seat_ids
    ]
    if not guests:
        raise ApiError(422, "validation", "Nobody sits at these tables yet.")
    problem = build_problem(session, seats, guests, human_fixed(rows, {g.id for g in guests}))
    started = time.monotonic()
    heuristic = solve(problem, seed=0, max_iterations=HEURISTIC_ITERATIONS)
    heuristic_seconds = time.monotonic() - started
    exact = solve_exact(problem, time_limit_s=EXACT_TIME_LIMIT_S)
    gap, note = _gap(heuristic, exact)
    return {
        "table_ids": sorted(set(chosen)),
        "seats": len(seats),
        "guests": len(guests),
        "heuristic_seated": len(heuristic.assignment),
        "exact_seated": exact.seated,
        "heuristic_score": heuristic.score.total,
        "optimal_score": exact.score.total,
        "gap_percent": gap,
        "note": note,
        "proven_optimal": exact.proven_optimal,
        "engine": exact.engine,
        "heuristic_ms": round(heuristic_seconds * 1000, 1),
        "exact_ms": round(exact.seconds * 1000, 1),
    }


def _gap(heuristic: SolveResult, exact: ExactResult) -> tuple[float | None, str]:
    """(gap in percent, plain-language note). No gap when the seat counts differ.

    A plan that leaves someone without a seat can have MORE points than the
    optimum, because the optimum gave up points to seat that person. Comparing
    points alone would then report 0% or even a negative gap.
    """
    missing = exact.seated - len(heuristic.assignment)
    if missing > 0:
        people = "1 guest" if missing == 1 else f"{missing} guests"
        return None, f"The heuristic left {people} unseated that the optimum seats."
    if missing < 0:
        # Only possible when the exact search hit its time limit unproven.
        return None, "The exact search stopped early and seated fewer guests than the heuristic."
    optimal = exact.score.total
    gap = 0.0 if optimal <= 0 else (optimal - heuristic.score.total) / optimal * 100
    return round(gap, 2), "Both plans seat the same guests; the gap compares their points."
