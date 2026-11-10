"""Exact solver for SMALL events, used to measure how far the heuristic is from optimal.

Objective, in this order (lexicographic):
1. seat as many guests as possible;
2. among those plans, the highest score (same pair terms as events_score).

Two engines give the same answer:
- "cp-sat": Google OR-tools CP-SAT, used when the package is installed;
- "branch-and-bound": pure Python, so the check also works without OR-tools.
Both report whether optimality was PROVEN before the time limit.
"""

import random
import time
from collections.abc import Callable
from dataclasses import dataclass

from app.optimiser.events_greedy import complete_greedily, free_allowed_seats
from app.optimiser.events_model import Assignment, EventProblem, ExactResult, GuestSpec
from app.optimiser.events_score import (
    ScoreContext,
    adjacent_points,
    best_pair_value,
    make_context,
    placement_gain,
    score_with_context,
    table_points,
)

try:
    from ortools.sat.python import cp_model

    HAVE_ORTOOLS = True
except ImportError:  # OR-tools is an optional extra (contract, section 2)
    cp_model = None
    HAVE_ORTOOLS = False

# CP-SAT only works with whole numbers, so points are multiplied by SCALE and
# rounded. Weights with up to three decimals are therefore represented exactly.
SCALE = 1000
TOLERANCE = 1e-9  # float sums can differ in the last digit

# (guest id, seat id) -> CP-SAT yes/no variable "this guest sits on this seat"
SitVariables = dict[tuple[int, int], "cp_model.IntVar"]


def solve_exact(
    problem: EventProblem, time_limit_s: float = 10.0, engine: str = "auto"
) -> ExactResult:
    """engine: "auto" (CP-SAT if installed), "cp-sat" or "branch-and-bound"."""
    if engine == "auto":
        engine = "cp-sat" if HAVE_ORTOOLS else "branch-and-bound"
    context = make_context(problem)
    started = time.monotonic()
    if engine == "cp-sat":
        assignment, proven = solve_with_cp_sat(context, time_limit_s)
    elif engine == "branch-and-bound":
        assignment, proven = solve_with_branch_and_bound(context, time_limit_s)
    else:
        raise ValueError(f"Unknown engine '{engine}'.")
    return ExactResult(
        assignment=assignment,
        score=score_with_context(context, assignment),
        seated=len(assignment),
        engine=engine,
        proven_optimal=proven,
        seconds=time.monotonic() - started,
    )


# ---------------------------------------------------------------- CP-SAT model


def solve_with_cp_sat(context: ScoreContext, time_limit_s: float) -> tuple[Assignment, bool]:
    if cp_model is None:
        raise RuntimeError("OR-tools is not installed; use engine='branch-and-bound'.")
    model = cp_model.CpModel()
    sits = seat_variables(context, model)
    pair_terms = pair_variables(context, model, sits)
    # Seating one more guest must beat any amount of pair points, so each seated
    # guest is worth more than all pair points together (lexicographic objective).
    seat_value = sum(points for points, _ in pair_terms) + 1
    model.maximize(
        sum(seat_value * var for var in sits.values())
        + sum(points * var for points, var in pair_terms)
    )
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_s
    solver.parameters.num_workers = 1  # one worker = the same answer every run
    solver.parameters.random_seed = 0
    status = solver.solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return dict(context.problem.fixed), False
    assignment = {guest: seat for (guest, seat), var in sits.items() if solver.value(var)}
    return assignment, status == cp_model.OPTIMAL


def seat_variables(context: ScoreContext, model: "cp_model.CpModel") -> SitVariables:
    """One yes/no variable per allowed (guest, seat) pair, plus capacity rules."""
    problem = context.problem
    fixed_seats = set(problem.fixed.values())
    sits: SitVariables = {}
    for guest in problem.guests:
        if guest.id in problem.fixed:
            seat_id = problem.fixed[guest.id]
            sits[(guest.id, seat_id)] = model.new_bool_var(f"x_{guest.id}_{seat_id}")
            model.add(sits[(guest.id, seat_id)] == 1)  # human choice, kept exactly
            continue
        for seat_id in free_allowed_seats(context, {}, guest):
            if seat_id not in fixed_seats:
                sits[(guest.id, seat_id)] = model.new_bool_var(f"x_{guest.id}_{seat_id}")
    for guest in problem.guests:  # each guest sits at most once
        model.add(sum(v for (g, _), v in sits.items() if g == guest.id) <= 1)
    for seat in problem.seats:  # each seat holds at most one guest
        model.add(sum(v for (_, s), v in sits.items() if s == seat.id) <= 1)
    return sits


def pair_variables(
    context: ScoreContext, model: "cp_model.CpModel", sits: SitVariables
) -> list[tuple[int, "cp_model.IntVar"]]:
    """For each related pair: a variable "they are adjacent" and "same table".

    Each variable may only be 1 if the seating really makes it true; the
    objective then pushes it to 1 whenever it can be. Returns (points, variable).
    """
    weights = context.problem.weights
    terms = []
    for relation in context.relations:
        pair = (relation.guest_a, relation.guest_b)
        side_by_side = adjacent_points(weights, relation)
        same_table = table_points(weights, relation)
        if side_by_side > 0:
            near = link_variable(context, model, sits, pair, seats_next_to)
            terms.append((round(side_by_side * SCALE), near))
        if same_table > 0:
            together = link_variable(context, model, sits, pair, seats_at_same_table)
            terms.append((round(same_table * SCALE), together))
    return terms


def link_variable(
    context: ScoreContext,
    model: "cp_model.CpModel",
    sits: SitVariables,
    pair: tuple[int, int],
    partner_seats: Callable[[ScoreContext, int], set[int]],
) -> "cp_model.IntVar":
    """A 0/1 variable that may be 1 only if b sits on partner_seats(seat of a)."""
    guest_a, guest_b = pair
    link = model.new_bool_var(f"link_{guest_a}_{guest_b}")
    seats_of_a = [(s, v) for (g, s), v in sits.items() if g == guest_a]
    model.add(link <= sum(v for _, v in seats_of_a))  # a must be seated
    for seat_id, a_here in seats_of_a:
        allowed = partner_seats(context, seat_id)
        b_there = [v for (g, s), v in sits.items() if g == guest_b and s in allowed]
        # If a sits here and link is 1, then b must sit on an allowed seat.
        model.add(link + a_here - sum(b_there) <= 1)
    return link


def seats_next_to(context: ScoreContext, seat_id: int) -> set[int]:
    neighbours = set(context.problem.neighbours.get(seat_id, frozenset()))
    for other_id, around in context.problem.neighbours.items():
        if seat_id in around:
            neighbours.add(other_id)  # also accept a one-directional neighbour map
    return neighbours


def seats_at_same_table(context: ScoreContext, seat_id: int) -> set[int]:
    table_id = context.seats[seat_id].table_id
    return {s.id for s in context.problem.seats if s.table_id == table_id and s.id != seat_id}


# ---------------------------------------------------------- branch and bound


@dataclass
class Search:
    """Everything the recursive search shares, in one place."""

    context: ScoreContext
    order: list[GuestSpec]  # non-fixed guests, hardest first
    open_points: list[float]  # open_points[d]: best possible points still open at depth d
    assignment: Assignment
    best: Assignment
    best_key: tuple[int, float]  # (guests seated, score)
    deadline: float
    timed_out: bool = False


def solve_with_branch_and_bound(
    context: ScoreContext, time_limit_s: float
) -> tuple[Assignment, bool]:
    problem = context.problem
    # Start from a greedy plan: a good first answer lets the bound prune a lot.
    incumbent = complete_greedily(context, dict(problem.fixed), random.Random(0))
    order = search_order(context)
    search = Search(
        context=context,
        order=order,
        open_points=open_points_by_depth(context, order),
        assignment=dict(problem.fixed),
        best=incumbent,
        best_key=(len(incumbent), score_with_context(context, incumbent).total),
        deadline=time.monotonic() + time_limit_s,
    )
    fixed_value = score_with_context(context, search.assignment).total
    explore(search, 0, fixed_value)
    return search.best, not search.timed_out


def search_order(context: ScoreContext) -> list[GuestSpec]:
    """Guests with the fewest allowed seats first, then the most relations."""
    waiting = [g for g in context.problem.guests if g.id not in context.problem.fixed]

    def difficulty(guest: GuestSpec) -> tuple[int, int, int]:
        options = len(free_allowed_seats(context, {}, guest))
        return (options, -len(context.relations_of.get(guest.id, ())), guest.id)

    return sorted(waiting, key=difficulty)


def open_points_by_depth(context: ScoreContext, order: list[GuestSpec]) -> list[float]:
    """Upper bound on the points not yet decided at each depth of the search.

    A pair is decided once both guests are placed. Its points can never exceed
    best_pair_value, so summing that over undecided pairs never underestimates
    (an "admissible" bound): pruning with it cannot cut off the optimum.
    """
    position = {guest.id: index for index, guest in enumerate(order)}
    open_points = [0.0] * (len(order) + 1)
    for relation in context.relations:
        # Fixed guests are placed before the search starts (position -1).
        decided_at = max(position.get(relation.guest_a, -1), position.get(relation.guest_b, -1))
        for depth in range(decided_at + 1):
            open_points[depth] += best_pair_value(context, relation)
    return open_points


def explore(search: Search, depth: int, value: float) -> None:
    if time.monotonic() > search.deadline:
        search.timed_out = True
        return
    remaining = len(search.order) - depth
    bound = (len(search.assignment) + remaining, value + search.open_points[depth])
    if not is_better(bound, search.best_key):
        return  # even the most optimistic finish cannot beat the best plan found
    if remaining == 0:
        search.best = dict(search.assignment)
        search.best_key = (len(search.assignment), value)
        return
    guest = search.order[depth]
    for seat_id, gain in seat_options(search, guest):
        search.assignment[guest.id] = seat_id
        explore(search, depth + 1, value + gain)
        del search.assignment[guest.id]
    explore(search, depth + 1, value)  # last option: leave this guest unseated


def seat_options(search: Search, guest: GuestSpec) -> list[tuple[int, float]]:
    """Free allowed seats with their gain, best first (finds good plans early)."""
    context = search.context
    options = []
    for seat_id in free_allowed_seats(context, search.assignment, guest):
        options.append((seat_id, placement_gain(context, search.assignment, guest.id, seat_id)))
    options.sort(key=lambda option: (-option[1], option[0]))
    return options


def is_better(first: tuple[int, float], second: tuple[int, float]) -> bool:
    if first[0] != second[0]:
        return first[0] > second[0]
    return first[1] > second[1] + TOLERANCE
