"""Property-based tests: for ANY random event, the search stays feasible.

Hypothesis invents many random events (blocked, reserved and accessible seats,
groups, friendships, fixed choices) and checks that solve() and replan() always
return plans where check_hard finds nothing and every fixed guest is in place.
"""

from hypothesis import given, settings
from hypothesis import strategies as st

from app.optimiser.events_anneal import solve
from app.optimiser.events_model import (
    EventProblem,
    GuestSpec,
    SeatSpec,
    Weights,
    check_hard,
    seat_allows,
)
from app.optimiser.events_replan import replan

TAGS = st.sampled_from([None, None, None, "vip", "speaker"])


@st.composite
def events(draw: st.DrawFn) -> EventProblem:
    seats, neighbours = draw_seats(draw)
    guests = draw_guests(draw)
    fixed = draw_fixed(draw, seats, guests)
    return EventProblem(tuple(seats), tuple(guests), neighbours, fixed, Weights())


def draw_seats(draw: st.DrawFn) -> tuple[list[SeatSpec], dict[int, frozenset[int]]]:
    """1 to 3 tables of 1 to 5 seats in a row; random accessible/blocked/tag."""
    seats: list[SeatSpec] = []
    neighbours: dict[int, frozenset[int]] = {}
    for table in range(draw(st.integers(min_value=1, max_value=3))):
        size = draw(st.integers(min_value=1, max_value=5))
        ids = [len(seats) + place + 1 for place in range(size)]
        for place, seat_id in enumerate(ids):
            accessible = draw(st.booleans())
            blocked = draw(st.integers(0, 9)) == 0
            seats.append(
                SeatSpec(seat_id, table + 1, place, table, accessible, blocked, draw(TAGS))
            )
            neighbours[seat_id] = frozenset(
                ids[max(0, place - 1) : place] + ids[place + 1 : place + 2]
            )
    return seats, neighbours


def draw_guests(draw: st.DrawFn) -> list[GuestSpec]:
    """0 to 12 guests with random groups, needs, tags and up to 3 friends each."""
    ids = list(range(1, draw(st.integers(min_value=0, max_value=12)) + 1))
    guests = []
    for guest_id in ids:
        knows = draw(st.frozensets(st.sampled_from(ids), max_size=3)) - {guest_id}
        group = draw(st.sampled_from([None, 1, 2]))
        keep_adjacent = draw(st.booleans())
        needs_accessible = draw(st.booleans())
        guests.append(
            GuestSpec(guest_id, group, keep_adjacent, needs_accessible, draw(TAGS), knows)
        )
    return guests


def draw_fixed(draw: st.DrawFn, seats: list[SeatSpec], guests: list[GuestSpec]) -> dict[int, int]:
    """Some guests already chose a seat. Their choices are valid, as the API ensures."""
    fixed: dict[int, int] = {}
    for guest in guests:
        options = [s.id for s in seats if seat_allows(s, guest) and s.id not in fixed.values()]
        if options and draw(st.integers(0, 3)) == 0:
            fixed[guest.id] = draw(st.sampled_from(options))
    return fixed


def assert_valid(problem: EventProblem, assignment: dict[int, int]) -> None:
    assert check_hard(problem, assignment) == []
    for guest_id, seat_id in problem.fixed.items():
        assert assignment[guest_id] == seat_id


@settings(max_examples=150, deadline=None)
@given(problem=events(), seed=st.integers(0, 1000))
def test_solve_is_always_feasible(problem: EventProblem, seed: int) -> None:
    result = solve(problem, seed=seed, max_iterations=300)
    assert_valid(problem, result.assignment)
    seated = set(result.assignment)
    assert seated.isdisjoint(result.unseated)
    assert seated | set(result.unseated) == {g.id for g in problem.guests}


@settings(max_examples=150, deadline=None)
@given(problem=events(), seed=st.integers(0, 1000), leaving=st.integers(1, 12))
def test_replan_is_always_feasible(problem: EventProblem, seed: int, leaving: int) -> None:
    previous = solve(problem, seed=seed, max_iterations=200).assignment
    # One guest cancels (unless they are fixed) and the plan is repaired.
    staying = tuple(g for g in problem.guests if g.id != leaving or g.id in problem.fixed)
    changed = EventProblem(
        problem.seats, staying, problem.neighbours, problem.fixed, problem.weights
    )
    result = replan(changed, previous, seed=seed, max_iterations=200)
    assert_valid(changed, result.assignment)
    assert set(result.moved) <= set(previous)


@settings(max_examples=100, deadline=None)
@given(problem=events(), seed=st.integers(0, 1000))
def test_same_seed_same_result(problem: EventProblem, seed: int) -> None:
    assert solve(problem, seed=seed, max_iterations=200) == solve(
        problem, seed=seed, max_iterations=200
    )
