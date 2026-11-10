"""Re-plan after a change (cancellation, new guest, new choice) with few moves.

Same search as solve(), with two differences:
1. the start is the previous plan, kept wherever it is still valid, and only
   the gaps are filled greedily;
2. the objective subtracts change_penalty for every guest whose seat differs
   from the previous plan, so a move must earn more than it disturbs.
"""

import random

from app.optimiser.events_anneal import SAFETY_TIME_LIMIT_S, run_anneal
from app.optimiser.events_greedy import complete_greedily
from app.optimiser.events_model import (
    Assignment,
    EventProblem,
    SolveResult,
    seat_allows,
)
from app.optimiser.events_score import (
    ScoreContext,
    make_context,
    moved_guests,
    score_with_context,
)


def replan(
    problem: EventProblem,
    previous: Assignment,
    seed: int = 0,
    max_iterations: int = 20000,
    time_limit_s: float = SAFETY_TIME_LIMIT_S,
) -> SolveResult:
    rng = random.Random(seed)
    context = make_context(problem)
    kept = keep_valid_seats(context, previous)
    start = complete_greedily(context, kept, rng)
    outcome = run_anneal(context, start, rng, max_iterations, time_limit_s, previous)
    seated = outcome.assignment
    unseated = tuple(sorted(guest.id for guest in problem.guests if guest.id not in seated))
    return SolveResult(
        assignment=seated,
        score=score_with_context(context, seated, previous),
        iterations=outcome.iterations,
        seed=seed,
        unseated=unseated,
        moved=tuple(moved_guests(problem, seated, previous)),
    )


def keep_valid_seats(context: ScoreContext, previous: Assignment) -> Assignment:
    """Fixed guests, plus every previous seat that is still allowed and free.

    A previous seat is dropped when the guest left the event, the seat no longer
    exists or became blocked/reserved, or a fixed guest now owns it.
    """
    kept: Assignment = dict(context.problem.fixed)
    taken = set(kept.values())
    for guest_id, seat_id in sorted(previous.items()):
        guest = context.guests.get(guest_id)
        seat = context.seats.get(seat_id)
        if guest is None or seat is None or guest_id in kept or seat_id in taken:
            continue
        if seat_allows(seat, guest):
            kept[guest_id] = seat_id
            taken.add(seat_id)
    return kept
