"""Exact solvers against an independent brute force, and heuristic versus exact.

The brute force takes a different route from both engines: it lists EVERY way
to give each guest a seat or no seat, throws away plans that check_hard
rejects, and keeps the best by (guests seated, score).
"""

import itertools
import random

import pytest

from app.optimiser import events_exact
from app.optimiser.events_anneal import solve
from app.optimiser.events_exact import HAVE_ORTOOLS, solve_exact
from app.optimiser.events_model import (
    Assignment,
    EventProblem,
    GuestSpec,
    SeatSpec,
    Weights,
    check_hard,
)
from app.optimiser.events_score import score

ENGINES = [
    "branch-and-bound",
    pytest.param(
        "cp-sat",
        marks=pytest.mark.skipif(not HAVE_ORTOOLS, reason="OR-tools not installed"),
    ),
]


def tiny_problem(seed: int, guests: int, tables: int, per_table: int) -> EventProblem:
    """Random small event with every kind of rule switched on somewhere."""
    rng = random.Random(seed)
    seats = []
    neighbours = {}
    for table in range(tables):
        ids = [table * per_table + place + 1 for place in range(per_table)]
        for place, seat_id in enumerate(ids):
            tag = "vip" if rng.random() < 0.15 else None
            accessible = rng.random() < 0.3
            blocked = rng.random() < 0.1
            seats.append(SeatSpec(seat_id, table + 1, place, table, accessible, blocked, tag))
            # Seats in a row: left and right neighbours only.
            neighbours[seat_id] = frozenset(
                ids[max(0, place - 1) : place] + ids[place + 1 : place + 2]
            )
    people = []
    for guest_id in range(1, guests + 1):
        group = rng.choice([None, 1, 2])
        knows = frozenset(o for o in range(1, guests + 1) if o != guest_id and rng.random() < 0.3)
        tag = "vip" if rng.random() < 0.2 else None
        needs = rng.random() < 0.2
        people.append(GuestSpec(guest_id, group, rng.random() < 0.5, needs, tag, knows))
    fixed = {}
    first = people[0]
    open_seats = [
        s for s in seats if not s.blocked and s.reserved_tag in (None, first.reserved_tag)
    ]
    open_seats = [s for s in open_seats if s.accessible or not first.needs_accessible]
    if open_seats and rng.random() < 0.5:
        fixed[first.id] = rng.choice(open_seats).id
    return EventProblem(tuple(seats), tuple(people), neighbours, fixed, Weights())


def brute_force(problem: EventProblem) -> tuple[int, float]:
    """Best (guests seated, score) by trying every possible plan."""
    choices = [None] + [s.id for s in problem.seats]
    guest_ids = [g.id for g in problem.guests]
    best = (-1, float("-inf"))
    for seats in itertools.product(choices, repeat=len(guest_ids)):
        plan: Assignment = {g: s for g, s in zip(guest_ids, seats) if s is not None}
        if check_hard(problem, plan):
            continue
        best = max(best, (len(plan), score(problem, plan).total))
    return best


TINY_CASES = [(seed, 4, 2, 3) for seed in range(6)] + [(seed, 5, 2, 3) for seed in range(6, 10)]


@pytest.mark.parametrize("engine", ENGINES)
@pytest.mark.parametrize("case", TINY_CASES)
def test_exact_equals_brute_force(engine: str, case: tuple[int, int, int, int]) -> None:
    problem = tiny_problem(*case)
    expected_seated, expected_score = brute_force(problem)
    result = solve_exact(problem, time_limit_s=30, engine=engine)
    assert result.engine == engine
    assert result.proven_optimal
    assert check_hard(problem, result.assignment) == []
    assert result.seated == expected_seated
    assert result.score.total == pytest.approx(expected_score)


SMALL_CASES = [(seed, guests, 2, 5) for seed in range(4) for guests in (6, 8, 10)]


@pytest.mark.parametrize("engine", ENGINES)
@pytest.mark.parametrize("case", SMALL_CASES)
def test_heuristic_never_beats_exact(engine: str, case: tuple[int, int, int, int]) -> None:
    problem = tiny_problem(*case)
    exact = solve_exact(problem, time_limit_s=60, engine=engine)
    heuristic = solve(problem, seed=case[0], max_iterations=5000)
    assert exact.proven_optimal
    assert check_hard(problem, exact.assignment) == []
    heuristic_seated = len(heuristic.assignment)
    assert heuristic_seated <= exact.seated
    if heuristic_seated == exact.seated:
        assert heuristic.score.total <= exact.score.total + 1e-9


@pytest.mark.parametrize("case", SMALL_CASES)
def test_engines_agree(case: tuple[int, int, int, int]) -> None:
    if not HAVE_ORTOOLS:
        pytest.skip("OR-tools not installed")
    problem = tiny_problem(*case)
    by_cp_sat = solve_exact(problem, time_limit_s=60, engine="cp-sat")
    by_search = solve_exact(problem, time_limit_s=60, engine="branch-and-bound")
    assert by_cp_sat.seated == by_search.seated
    assert by_cp_sat.score.total == pytest.approx(by_search.score.total)


def test_auto_engine_uses_cp_sat_when_installed() -> None:
    result = solve_exact(tiny_problem(1, 4, 2, 3), time_limit_s=10)
    assert result.engine == ("cp-sat" if HAVE_ORTOOLS else "branch-and-bound")


@pytest.mark.parametrize("engine", ENGINES)
def test_exact_reports_unseated_when_seats_run_out(engine: str) -> None:
    seats = tuple(SeatSpec(i, 1, i, 0, False, False, None) for i in (1, 2, 3))
    guests = tuple(GuestSpec(i, None, False, False, None, frozenset()) for i in range(1, 5))
    neighbours = {1: frozenset({2}), 2: frozenset({1, 3}), 3: frozenset({2})}
    problem = EventProblem(seats, guests, neighbours, {4: 3}, Weights())
    result = solve_exact(problem, time_limit_s=10, engine=engine)
    assert result.seated == 3
    assert result.assignment[4] == 3


def test_unknown_engine_is_rejected() -> None:
    with pytest.raises(ValueError):
        solve_exact(tiny_problem(1, 3, 1, 3), time_limit_s=1, engine="magic")


def test_auto_falls_back_to_branch_and_bound_without_ortools(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Pretend OR-tools failed to import, as on a machine without the wheel.
    monkeypatch.setattr(events_exact, "HAVE_ORTOOLS", False)
    monkeypatch.setattr(events_exact, "cp_model", None)
    result = events_exact.solve_exact(tiny_problem(2, 4, 2, 3), time_limit_s=10)
    assert result.engine == "branch-and-bound"
    assert result.proven_optimal
    with pytest.raises(RuntimeError):
        events_exact.solve_exact(tiny_problem(2, 4, 2, 3), 10, engine="cp-sat")
