"""Simulated annealing: improve a feasible plan with small random moves.

One move picks a free (not fixed) guest and a random seat:
- the seat is empty      -> the guest moves there;
- the seat has a free guest -> the two guests swap.
A move is only proposed if both guests may sit on their new seats, so every
state the search visits is feasible. Worse moves are sometimes accepted
(probability exp(delta / temperature)) so the search can escape local optima;
the temperature shrinks geometrically, so late in the run it behaves greedily.

Stopping rule: max_iterations (determinism rule of the contract). The time
limit is only a safety cut-off.

solve() at the bottom is the full heuristic: greedy start, then annealing.
"""

import math
import random
import time
from dataclasses import dataclass

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
    score_with_context,
    touching_value,
)

START_TEMPERATURE = 10.0  # about one "friend next to friend" bonus
END_TEMPERATURE = 0.05  # cold enough that worse moves are almost never taken
# Safety cut-off only. Far above what demo-sized events need (400 guests take
# about 4 s), so in practice max_iterations decides when the search stops and
# results stay reproducible. It must fire well before Vercel stops the whole
# function (maxDuration 30 s in vercel.json), so a huge request still gets its
# best plan so far; 15 s also leaves room for the 10 s exact solver of
# exact-check, which runs this heuristic first in the same request.
SAFETY_TIME_LIMIT_S = 15.0


@dataclass(frozen=True)
class Move:
    guest_id: int
    old_seat: int
    new_seat: int
    swap_with: int | None  # the guest who sat on new_seat, or None if it was empty


@dataclass(frozen=True)
class AnnealOutcome:
    assignment: Assignment
    iterations: int
    stopped_by_time: bool


def anneal(
    problem: EventProblem,
    start: Assignment,
    seed: int,
    max_iterations: int,
    time_limit_s: float,
    previous: Assignment | None = None,
) -> Assignment:
    """Contract entry point. `previous` turns on the replan change penalty."""
    context = make_context(problem)
    rng = random.Random(seed)
    outcome = run_anneal(context, start, rng, max_iterations, time_limit_s, previous)
    return outcome.assignment


def run_anneal(
    context: ScoreContext,
    start: Assignment,
    rng: random.Random,
    max_iterations: int,
    time_limit_s: float,
    previous: Assignment | None = None,
) -> AnnealOutcome:
    assignment = dict(start)
    seat_owner = {seat_id: guest_id for guest_id, seat_id in assignment.items()}
    movable = sorted(g for g in assignment if g not in context.problem.fixed)
    seat_ids = sorted(seat.id for seat in context.problem.seats)
    current = score_with_context(context, assignment, previous).total
    best_value, best = current, dict(assignment)
    if not movable or max_iterations <= 0:
        return AnnealOutcome(best, 0, False)
    cooling = (END_TEMPERATURE / START_TEMPERATURE) ** (1 / max_iterations)
    temperature = START_TEMPERATURE
    deadline = time.monotonic() + time_limit_s
    iterations = 0
    while iterations < max_iterations:
        if time.monotonic() > deadline:
            return AnnealOutcome(best, iterations, True)
        iterations += 1
        temperature *= cooling
        move = propose_move(context, assignment, seat_owner, movable, seat_ids, rng)
        if move is None:
            continue
        delta = try_move(context, assignment, seat_owner, move, previous)
        if delta >= 0 or rng.random() < math.exp(delta / temperature):
            current += delta
            # Small tolerance: sums of floats can differ in the last digit.
            if current > best_value + 1e-9:
                best_value, best = current, dict(assignment)
        else:
            undo_move(assignment, seat_owner, move)
    return AnnealOutcome(best, iterations, False)


def propose_move(
    context: ScoreContext,
    assignment: Assignment,
    seat_owner: dict[int, int],
    movable: list[int],
    seat_ids: list[int],
    rng: random.Random,
) -> Move | None:
    """A random feasible move, or None when the random pick is not allowed."""
    guest_id = rng.choice(movable)
    seat_id = rng.choice(seat_ids)
    old_seat = assignment[guest_id]
    if seat_id == old_seat:
        return None
    if not seat_allows(context.seats[seat_id], context.guests[guest_id]):
        return None
    owner = seat_owner.get(seat_id)
    if owner is None:
        return Move(guest_id, old_seat, seat_id, None)
    if owner in context.problem.fixed:
        return None  # human choices never move
    if not seat_allows(context.seats[old_seat], context.guests[owner]):
        return None
    return Move(guest_id, old_seat, seat_id, owner)


def try_move(
    context: ScoreContext,
    assignment: Assignment,
    seat_owner: dict[int, int],
    move: Move,
    previous: Assignment | None,
) -> float:
    """Apply the move and return the exact change in the objective.

    Only pairs touching the moved guests can change, so we measure just those
    before and after (incremental delta) instead of rescoring everyone.
    """
    affected = [move.guest_id] if move.swap_with is None else [move.guest_id, move.swap_with]
    before = touching_value(context, assignment, affected)
    before += change_value(context, assignment, affected, previous)
    apply_move(assignment, seat_owner, move)
    after = touching_value(context, assignment, affected)
    after += change_value(context, assignment, affected, previous)
    return after - before


def change_value(
    context: ScoreContext,
    assignment: Assignment,
    guest_ids: list[int],
    previous: Assignment | None,
) -> float:
    """Replan penalty (zero or negative) contributed by these guests."""
    if previous is None:
        return 0.0
    moved = [g for g in guest_ids if g in previous and assignment.get(g) != previous[g]]
    return -context.problem.weights.change_penalty * len(moved)


def apply_move(assignment: Assignment, seat_owner: dict[int, int], move: Move) -> None:
    assignment[move.guest_id] = move.new_seat
    seat_owner[move.new_seat] = move.guest_id
    if move.swap_with is None:
        del seat_owner[move.old_seat]
    else:
        assignment[move.swap_with] = move.old_seat
        seat_owner[move.old_seat] = move.swap_with


def undo_move(assignment: Assignment, seat_owner: dict[int, int], move: Move) -> None:
    # Undoing is the same move played backwards: the guest returns to the old
    # seat, and a swap partner (now on old_seat) goes back to new_seat.
    backwards = Move(move.guest_id, move.new_seat, move.old_seat, move.swap_with)
    apply_move(assignment, seat_owner, backwards)


def solve(
    problem: EventProblem,
    seed: int = 0,
    max_iterations: int = 20000,
    time_limit_s: float = SAFETY_TIME_LIMIT_S,
) -> SolveResult:
    """Greedy start, then annealing. One seeded random generator for both."""
    rng = random.Random(seed)
    context = make_context(problem)
    start = complete_greedily(context, dict(problem.fixed), rng)
    outcome = run_anneal(context, start, rng, max_iterations, time_limit_s)
    seated = outcome.assignment
    unseated = tuple(sorted(guest.id for guest in problem.guests if guest.id not in seated))
    return SolveResult(
        assignment=seated,
        score=score_with_context(context, seated),
        iterations=outcome.iterations,
        seed=seed,
        unseated=unseated,
    )
