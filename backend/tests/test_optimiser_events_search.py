"""Greedy, annealing, solve, replan and recommend."""

import json
import random
from pathlib import Path

from app.events_service.exact_check import EXACT_TIME_LIMIT_S
from app.optimiser.events_anneal import (
    SAFETY_TIME_LIMIT_S,
    propose_move,
    run_anneal,
    solve,
    try_move,
)
from app.optimiser.events_greedy import greedy
from app.optimiser.events_model import (
    EventProblem,
    GuestSpec,
    SeatSpec,
    Weights,
    check_hard,
)
from app.optimiser.events_recommend import recommend
from app.optimiser.events_replan import replan
from app.optimiser.events_score import make_context, score, score_with_context


def banquet(guests: int, tables: int, per_table: int, seed: int) -> EventProblem:
    """Round tables (each seat touches left and right), random friends and groups."""
    rng = random.Random(seed)
    seats = []
    neighbours = {}
    for table in range(tables):
        ids = [table * per_table + place + 1 for place in range(per_table)]
        for place, seat_id in enumerate(ids):
            accessible = place == 0
            seats.append(
                SeatSpec(
                    seat_id,
                    table + 1,
                    float(place),
                    float(table),
                    accessible,
                    False,
                    None,
                )
            )
            neighbours[seat_id] = frozenset({ids[place - 1], ids[(place + 1) % per_table]})
    people = []
    for guest_id in range(1, guests + 1):
        group = rng.choice([None, None, guest_id % 4])
        knows = frozenset(o for o in range(1, guests + 1) if o != guest_id and rng.random() < 0.1)
        people.append(GuestSpec(guest_id, group, group == 1, guest_id % 9 == 0, None, knows))
    fixed = {1: seats[3].id, 2: seats[10].id}
    return EventProblem(tuple(seats), tuple(people), neighbours, fixed, Weights())


def row_problem(guests: tuple[GuestSpec, ...], seats: tuple[SeatSpec, ...]) -> EventProblem:
    """Seats in one straight row: seat i touches seat i-1 and i+1."""
    ids = [s.id for s in seats]
    neighbours = {
        seat_id: frozenset(ids[max(0, i - 1) : i] + ids[i + 1 : i + 2])
        for i, seat_id in enumerate(ids)
    }
    return EventProblem(seats, guests, neighbours, {}, Weights())


def plain_seat(seat_id: int, table_id: int = 1) -> SeatSpec:
    return SeatSpec(seat_id, table_id, float(seat_id), 0.0, False, False, None)


def plain_guest(guest_id: int, knows: tuple[int, ...] = ()) -> GuestSpec:
    return GuestSpec(guest_id, None, False, False, None, frozenset(knows))


# ------------------------------------------------------------------ greedy


def test_greedy_is_feasible_and_keeps_fixed() -> None:
    event = banquet(30, 4, 8, seed=1)
    plan = greedy(event, seed=3)
    assert check_hard(event, plan) == []
    for guest_id, seat_id in event.fixed.items():
        assert plan[guest_id] == seat_id


def test_greedy_same_seed_same_plan() -> None:
    event = banquet(30, 4, 8, seed=1)
    assert greedy(event, seed=5) == greedy(event, seed=5)


def test_greedy_gives_accessible_seat_first_to_who_needs_it() -> None:
    seats = (
        SeatSpec(1, 1, 0, 0, True, False, None),
        plain_seat(2),
    )
    guests = (plain_guest(1), GuestSpec(2, None, False, True, None, frozenset()))
    event = row_problem(guests, seats)
    for seed in range(10):
        assert greedy(event, seed)[2] == 1


def test_greedy_puts_tagged_guest_on_their_reserved_seat() -> None:
    seats = (plain_seat(1), SeatSpec(2, 1, 1, 0, False, False, "vip"), plain_seat(3))
    guests = (
        plain_guest(1),
        GuestSpec(2, None, False, False, "vip", frozenset()),
        plain_guest(3),
    )
    event = row_problem(guests, seats)
    for seed in range(10):
        plan = greedy(event, seed)
        assert plan[2] == 2
        assert len(plan) == 3  # nobody loses a seat because the VIP took a general one


def test_guest_without_needs_leaves_the_accessible_seat_free() -> None:
    # Review finding: the VIP (no VIP seat exists) is placed first and used to
    # take the only accessible seat, so the guest who needs it got nothing.
    seats = (plain_seat(2), SeatSpec(3, 1, 3, 0, True, False, None))
    needs_access = GuestSpec(101, None, False, True, None, frozenset())
    vip = GuestSpec(102, None, False, False, "vip", frozenset())
    event = row_problem((needs_access, vip), seats)
    for seed in range(10):
        result = solve(event, seed=seed, max_iterations=200)
        assert result.unseated == ()
        assert result.assignment == {101: 3, 102: 2}


def test_replan_moves_a_kept_guest_to_seat_a_newcomer_who_needs_access() -> None:
    # The previous plan put guest 1 (no needs) on the only accessible seat.
    # Keeping that would leave the new guest 2 without any seat.
    seats = (SeatSpec(1, 1, 1, 0, True, False, None), plain_seat(2))
    needs_access = GuestSpec(2, None, False, True, None, frozenset())
    event = row_problem((plain_guest(1), needs_access), seats)
    result = replan(event, {1: 1}, seed=0, max_iterations=200)
    assert result.unseated == ()
    assert result.assignment == {1: 2, 2: 1}


def test_greedy_seats_friend_next_to_friend() -> None:
    seats = tuple(plain_seat(i) for i in range(1, 6))
    event = row_problem((plain_guest(1), plain_guest(2, knows=(1,))), seats)
    for seed in range(10):
        plan = greedy(event, seed)
        assert abs(plan[1] - plan[2]) == 1


# ------------------------------------------------------------------ anneal and solve


def test_incremental_delta_matches_full_rescore() -> None:
    event = banquet(25, 4, 8, seed=2)
    context = make_context(event)
    plan = greedy(event, seed=0)
    previous = greedy(event, seed=1)  # also exercise the change penalty
    seat_owner = {s: g for g, s in plan.items()}
    movable = sorted(g for g in plan if g not in event.fixed)
    seat_ids = sorted(s.id for s in event.seats)
    rng = random.Random(0)
    checked = 0
    while checked < 300:
        move = propose_move(context, plan, seat_owner, movable, seat_ids, rng)
        if move is None:
            continue
        before = score_with_context(context, plan, previous).total
        delta = try_move(context, plan, seat_owner, move, previous)
        after = score_with_context(context, plan, previous).total
        assert abs((after - before) - delta) < 1e-9
        assert check_hard(event, plan) == []
        checked += 1


def test_solve_same_seed_same_result() -> None:
    event = banquet(30, 4, 8, seed=4)
    first = solve(event, seed=11, max_iterations=3000)
    second = solve(event, seed=11, max_iterations=3000)
    assert first == second


def test_solve_is_feasible_for_several_seeds_and_improves_on_greedy() -> None:
    event = banquet(30, 4, 8, seed=4)
    for seed in range(4):
        result = solve(event, seed=seed, max_iterations=4000)
        assert check_hard(event, result.assignment) == []
        assert result.iterations == 4000
        assert result.seed == seed
        assert result.score == score(event, result.assignment)
        assert result.score.total >= score(event, greedy(event, seed)).total - 1e-9


def test_anneal_never_moves_fixed_guests() -> None:
    event = banquet(30, 4, 8, seed=6)
    result = solve(event, seed=2, max_iterations=5000)
    for guest_id, seat_id in event.fixed.items():
        assert result.assignment[guest_id] == seat_id


def test_safety_time_limit_returns_start_plan() -> None:
    event = banquet(20, 3, 8, seed=6)
    context = make_context(event)
    start = greedy(event, seed=0)
    outcome = run_anneal(context, start, random.Random(0), 1000, time_limit_s=-1.0)
    assert outcome.stopped_by_time
    assert outcome.iterations == 0
    assert outcome.assignment == start


def test_safety_cut_off_fires_before_the_platform_limit() -> None:
    # A cut-off that only fires after Vercel has killed the function is no
    # cut-off. Exact-check runs the heuristic AND the exact solver in one call.
    vercel = json.loads((Path(__file__).parents[2] / "vercel.json").read_text())
    platform_limit = vercel["functions"]["api/index.py"]["maxDuration"]
    assert SAFETY_TIME_LIMIT_S + EXACT_TIME_LIMIT_S < platform_limit


def test_unseated_guests_are_reported_not_forced() -> None:
    seats = (plain_seat(1), plain_seat(2))
    needs_access = GuestSpec(3, None, False, True, None, frozenset())
    event = row_problem((plain_guest(1), plain_guest(2), needs_access), seats)
    result = solve(event, seed=0, max_iterations=200)
    assert result.unseated == (3,)
    assert check_hard(event, result.assignment) == []


def test_more_guests_than_seats() -> None:
    seats = (plain_seat(1), plain_seat(2))
    event = row_problem(tuple(plain_guest(i) for i in range(1, 5)), seats)
    result = solve(event, seed=0, max_iterations=200)
    assert len(result.assignment) == 2
    assert len(result.unseated) == 2


# ------------------------------------------------------------------ replan


def cancel(event: EventProblem, leaving: set[int]) -> EventProblem:
    staying = tuple(g for g in event.guests if g.id not in leaving)
    return EventProblem(event.seats, staying, event.neighbours, event.fixed, event.weights)


def test_replan_moves_fewer_guests_than_a_fresh_solve() -> None:
    event = banquet(36, 5, 8, seed=7)
    before = solve(event, seed=0, max_iterations=6000).assignment
    after_cancel = cancel(event, {5, 12, 20})
    replanned = replan(after_cancel, before, seed=0, max_iterations=6000)
    fresh = solve(after_cancel, seed=1, max_iterations=6000)
    fresh_moves = [g for g in fresh.assignment if fresh.assignment[g] != before.get(g)]
    assert check_hard(after_cancel, replanned.assignment) == []
    assert len(replanned.moved) < len(fresh_moves)
    for guest_id, seat_id in event.fixed.items():
        assert replanned.assignment[guest_id] == seat_id


def test_replan_reports_exactly_the_moved_guests() -> None:
    event = banquet(30, 4, 8, seed=8)
    before = solve(event, seed=0, max_iterations=3000).assignment
    result = replan(cancel(event, {7}), before, seed=3, max_iterations=3000)
    expected = sorted(g for g, s in before.items() if g != 7 and result.assignment.get(g) != s)
    assert list(result.moved) == expected
    assert result.score.changes == -8 * len(expected)


def test_replan_with_unchanged_problem_keeps_everyone() -> None:
    event = banquet(30, 4, 8, seed=9)
    before = solve(event, seed=0, max_iterations=4000).assignment
    # The previous plan was already annealed, so a large change penalty means
    # no move can pay for itself.
    strict = EventProblem(
        event.seats,
        event.guests,
        event.neighbours,
        event.fixed,
        Weights(change_penalty=1000),
    )
    result = replan(strict, before, seed=0, max_iterations=2000)
    assert result.moved == ()
    assert result.assignment == before


# ------------------------------------------------------------------ recommend


def test_recommend_returns_only_free_feasible_seats() -> None:
    event = banquet(20, 3, 8, seed=10)
    current = greedy(event, seed=0)
    guest_id = 9  # needs an accessible seat (9 % 9 == 0)
    del current[guest_id]
    seats = {s.id: s for s in event.seats}
    taken = set(current.values())
    picks = recommend(event, current, guest_id, top=30)
    assert picks
    for pick in picks:
        assert pick.seat_id not in taken
        assert seats[pick.seat_id].accessible


def test_recommend_ranks_by_gain_and_explains() -> None:
    seats = tuple(plain_seat(i) for i in range(1, 5)) + (plain_seat(5, table_id=2),)
    guests = (plain_guest(1, knows=(2,)), plain_guest(2), plain_guest(3))
    event = row_problem(guests, seats)
    current = {2: 2, 3: 4}
    picks = recommend(event, current, guest_id=1, top=5)
    assert [p.seat_id for p in picks] == [1, 3, 5]
    assert picks[0].gain == 14
    assert picks[0].reasons == ("Next to 1 person you know",)
    assert picks[0].known_nearby == (2,)
    assert picks[2].gain == 0
    assert picks[2].reasons == ()


def test_recommend_never_reveals_who_listed_the_guest() -> None:
    seats = tuple(plain_seat(i) for i in range(1, 4))
    # Guest 2 listed guest 1, but guest 1 did not list guest 2.
    guests = (plain_guest(1), plain_guest(2, knows=(1,)))
    event = row_problem(guests, seats)
    picks = recommend(event, {2: 2}, guest_id=1)
    for pick in picks:
        assert pick.known_nearby == ()
        assert not any("know" in reason for reason in pick.reasons)


def test_recommend_respects_top() -> None:
    event = banquet(10, 3, 8, seed=11)
    assert len(recommend(event, {}, guest_id=3, top=2)) == 2
