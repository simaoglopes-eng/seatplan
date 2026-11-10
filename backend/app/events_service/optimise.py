"""Organiser tools that call the optimiser: auto-fill, re-plan, compare, what-if.

Auto-fill and re-plan only PROPOSE: the result is stored as a scenario in
plan_snapshots and nothing on the map changes until the organiser applies it
(plans.apply_plan). Seats chosen by a guest or placed by the organiser are
passed to the optimiser as `fixed`, so the optimiser can never move them.
"""

from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.events_service.plans import SCENARIO, PlanState, save_snapshot, state_of
from app.events_service.problem import (
    active_guests,
    build_problem,
    current_rows,
    human_fixed,
    plan_of,
    score_dict,
    venue_seats,
)
from app.models import Event, PlanSnapshot, SeatAssignment
from app.optimiser.events_anneal import solve
from app.optimiser.events_model import EventProblem, SolveResult, check_hard
from app.optimiser.events_replan import replan
from app.optimiser.events_score import score

SCORE_TERMS = (
    "total",
    "friend_adjacent",
    "friend_same_table",
    "group_adjacent",
    "group_same_table",
    "changes",
)


def organiser_problem(
    session: Session, event: Event
) -> tuple[EventProblem, dict[int, SeatAssignment]]:
    """Every guest still coming, every seat, and human choices as fixed."""
    guests = active_guests(session, event)
    rows = current_rows(session, event)
    fixed = human_fixed(rows, {guest.id for guest in guests})
    problem = build_problem(session, venue_seats(session, event.venue_id), guests, fixed)
    return problem, rows


def _scenario_state(result: SolveResult, rows: dict[int, SeatAssignment]) -> PlanState:
    """Keep the source of seats people chose; everything else is the optimiser's."""
    state: PlanState = {}
    for guest_id, seat_id in result.assignment.items():
        row = rows.get(guest_id)
        if row is not None and row.seat_id == seat_id:
            state[guest_id] = (seat_id, row.source)
        else:
            state[guest_id] = (seat_id, "optimiser")
    return state


def scenario_dict(snapshot: PlanSnapshot) -> dict[str, Any]:
    return {
        "id": snapshot.seq,
        "label": snapshot.label,
        "score": {term: snapshot.score.get(term, 0.0) for term in SCORE_TERMS},
        "seated": len(state_of(snapshot)),
        "unseated": snapshot.score.get("unseated", []),
        "moved": snapshot.score.get("moved", []),
        "iterations": snapshot.score.get("iterations", 0),
        "seed": snapshot.score.get("seed", 0),
        # Guest id (as text, because JSON keys are text) -> seat id, so the
        # organiser's map can preview the scenario before it is applied.
        "assignments": {
            str(guest_id): seat for guest_id, (seat, _source) in state_of(snapshot).items()
        },
    }


def _store(
    session: Session, event: Event, label: str, result: SolveResult, rows: dict[int, SeatAssignment]
) -> dict[str, Any]:
    details = {
        **score_dict(result.score),
        "unseated": list(result.unseated),
        "moved": list(result.moved),
        "iterations": result.iterations,
        "seed": result.seed,
    }
    snapshot = save_snapshot(
        session, event, SCENARIO, label, _scenario_state(result, rows), details
    )
    return scenario_dict(snapshot)


def autofill(session: Session, event: Event, seed: int, max_iterations: int) -> dict[str, Any]:
    """Seat everyone who has not chosen, around the fixed human choices."""
    problem, rows = organiser_problem(session, event)
    result = solve(problem, seed=seed, max_iterations=max_iterations)
    return _store(session, event, f"Auto-fill (seed {seed})", result, rows)


def replan_event(session: Session, event: Event, seed: int, max_iterations: int) -> dict[str, Any]:
    """Repair the current plan after changes, moving as few guests as possible."""
    problem, rows = organiser_problem(session, event)
    guest_ids = {guest.id for guest in problem.guests}
    previous = {g: s for g, s in plan_of(rows).items() if g in guest_ids}
    result = replan(problem, previous, seed=seed, max_iterations=max_iterations)
    return _store(session, event, f"Re-plan (seed {seed})", result, rows)


def _delta(before: dict[str, float], after: dict[str, float]) -> dict[str, float]:
    return {term: after.get(term, 0.0) - before.get(term, 0.0) for term in SCORE_TERMS}


def compare(first: PlanSnapshot, second: PlanSnapshot) -> dict[str, Any]:
    plan_a = {g: seat for g, (seat, _source) in state_of(first).items()}
    plan_b = {g: seat for g, (seat, _source) in state_of(second).items()}
    differ = sorted(g for g in set(plan_a) | set(plan_b) if plan_a.get(g) != plan_b.get(g))
    return {
        "a": scenario_dict(first),
        "b": scenario_dict(second),
        "delta": _delta(first.score, second.score),
        "guests_seated_differently": len(differ),
        "guest_ids": differ,
    }


def _apply_moves(
    problem: EventProblem, plan: dict[int, int], moves: list[tuple[int, int | None]]
) -> dict[int, int]:
    """The plan after the moves. Moving onto a taken seat swaps the two guests."""
    guest_ids = {guest.id for guest in problem.guests}
    seat_ids = {seat.id for seat in problem.seats}
    after = dict(plan)
    for guest_id, seat_id in moves:
        if guest_id not in guest_ids:
            raise ApiError(422, "validation", f"Guest {guest_id} is not coming to this event.")
        if seat_id is None:
            after.pop(guest_id, None)
            continue
        if seat_id not in seat_ids:
            raise ApiError(422, "validation", f"Seat {seat_id} is not in this venue.")
        owner = next((g for g, s in after.items() if s == seat_id and g != guest_id), None)
        if owner is not None and guest_id in after:
            after[owner] = after[guest_id]
        elif owner is not None:
            after.pop(owner)
        after[guest_id] = seat_id
    return after


def whatif(session: Session, event: Event, moves: list[tuple[int, int | None]]) -> dict[str, Any]:
    """Score the plan before and after some moves, without saving anything."""
    problem, rows = organiser_problem(session, event)
    guest_ids = {guest.id for guest in problem.guests}
    before_plan = {g: s for g, s in plan_of(rows).items() if g in guest_ids}
    after_plan = _apply_moves(problem, before_plan, moves)
    before = score_dict(score(problem, before_plan))
    after = score_dict(score(problem, after_plan))
    return {
        "before": before,
        "after": after,
        "delta": _delta(before, after),
        "hard_rule_problems": check_hard(problem, after_plan),
    }
