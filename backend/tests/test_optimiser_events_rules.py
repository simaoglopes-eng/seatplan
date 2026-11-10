"""Hard rules (check_hard) and every score term, on tiny hand-made events.

Layout used by most tests: table 1 has seats 1-2-3 in a row (1 touches 2,
2 touches 3), table 2 has seat 4 on its own. Default weights:
friend_adjacent 10, friend_same_table 4, group_adjacent 15,
group_same_table 6, change_penalty 8.
"""

from app.optimiser.events_model import (
    EventProblem,
    GuestSpec,
    SeatSpec,
    Weights,
    check_hard,
)
from app.optimiser.events_score import score


def seat(
    seat_id: int,
    table_id: int,
    *,
    accessible: bool = False,
    blocked: bool = False,
    reserved_tag: str | None = None,
) -> SeatSpec:
    return SeatSpec(seat_id, table_id, float(seat_id), 0.0, accessible, blocked, reserved_tag)


def guest(
    guest_id: int,
    knows: tuple[int, ...] = (),
    *,
    group_id: int | None = None,
    keep_adjacent: bool = False,
    needs_accessible: bool = False,
    reserved_tag: str | None = None,
) -> GuestSpec:
    return GuestSpec(
        guest_id,
        group_id,
        keep_adjacent,
        needs_accessible,
        reserved_tag,
        frozenset(knows),
    )


NEIGHBOURS = {
    1: frozenset({2}),
    2: frozenset({1, 3}),
    3: frozenset({2}),
    4: frozenset(),
}


def problem(
    seats: tuple[SeatSpec, ...] | None = None,
    guests: tuple[GuestSpec, ...] = (),
    fixed: dict[int, int] | None = None,
) -> EventProblem:
    if seats is None:
        seats = (seat(1, 1), seat(2, 1), seat(3, 1), seat(4, 2))
    return EventProblem(tuple(seats), tuple(guests), NEIGHBOURS, fixed or {}, Weights())


# ------------------------------------------------------------------ hard rules


def test_feasible_plan_has_no_violations() -> None:
    event = problem(guests=(guest(1), guest(2)))
    assert check_hard(event, {1: 1, 2: 4}) == []


def test_unseated_guest_is_not_a_violation() -> None:
    event = problem(guests=(guest(1), guest(2)))
    assert check_hard(event, {1: 1}) == []


def test_two_guests_on_one_seat_is_reported() -> None:
    event = problem(guests=(guest(1), guest(2)))
    violations = check_hard(event, {1: 3, 2: 3})
    assert violations == ["Seat 3 is given to both guest 1 and guest 2."]


def test_blocked_seat_is_reported() -> None:
    event = problem(seats=(seat(1, 1, blocked=True),), guests=(guest(1),))
    assert check_hard(event, {1: 1}) == ["Seat 1 is blocked but guest 1 sits on it."]


def test_reserved_seat_needs_matching_tag() -> None:
    seats = (seat(1, 1, reserved_tag="vip"), seat(2, 1))
    event = problem(seats=seats, guests=(guest(1), guest(2, reserved_tag="vip")))
    assert len(check_hard(event, {1: 1})) == 1
    assert check_hard(event, {2: 1}) == []
    # A tagged guest may still use an ordinary seat.
    assert check_hard(event, {2: 2}) == []


def test_reserved_seat_rejects_other_tag() -> None:
    seats = (seat(1, 1, reserved_tag="vip"),)
    event = problem(seats=seats, guests=(guest(1, reserved_tag="speaker"),))
    assert len(check_hard(event, {1: 1})) == 1


def test_accessibility_need_requires_accessible_seat() -> None:
    seats = (seat(1, 1, accessible=True), seat(2, 1))
    event = problem(seats=seats, guests=(guest(1, needs_accessible=True),))
    assert check_hard(event, {1: 1}) == []
    assert check_hard(event, {1: 2}) == ["Guest 1 needs an accessible seat; seat 2 is not."]


def test_fixed_guest_must_stay_on_chosen_seat() -> None:
    event = problem(guests=(guest(1),), fixed={1: 2})
    assert check_hard(event, {1: 2}) == []
    assert check_hard(event, {1: 3}) == ["Guest 1 chose seat 2 and must stay there."]
    assert check_hard(event, {}) == ["Guest 1 chose seat 2 and must stay there."]


def test_unknown_guest_and_seat_are_reported() -> None:
    event = problem(guests=(guest(1),))
    assert len(check_hard(event, {99: 1})) == 1
    assert len(check_hard(event, {1: 99})) == 1


# ------------------------------------------------------------------ score terms


def test_one_way_friendship_counts_once_when_adjacent() -> None:
    event = problem(guests=(guest(1, knows=(2,)), guest(2)))
    result = score(event, {1: 1, 2: 2})
    assert result.friend_adjacent == 10
    assert result.friend_same_table == 4
    assert result.total == 14


def test_mutual_friendship_is_not_double_counted() -> None:
    event = problem(guests=(guest(1, knows=(2,)), guest(2, knows=(1,))))
    assert score(event, {1: 1, 2: 2}).total == 14


def test_friends_same_table_but_not_adjacent() -> None:
    event = problem(guests=(guest(1, knows=(2,)), guest(2)))
    result = score(event, {1: 1, 2: 3})
    assert result.friend_adjacent == 0
    assert result.friend_same_table == 4


def test_friends_at_different_tables_earn_nothing() -> None:
    event = problem(guests=(guest(1, knows=(2,)), guest(2)))
    assert score(event, {1: 1, 2: 4}).total == 0


def test_group_that_keeps_adjacent() -> None:
    members = (
        guest(1, group_id=7, keep_adjacent=True),
        guest(2, group_id=7, keep_adjacent=True),
    )
    event = problem(guests=members)
    result = score(event, {1: 2, 2: 3})
    assert result.group_adjacent == 15
    assert result.group_same_table == 6
    assert result.total == 21


def test_group_without_keep_adjacent_only_gets_table_points() -> None:
    members = (guest(1, group_id=7), guest(2, group_id=7))
    result = score(problem(guests=members), {1: 1, 2: 2})
    assert result.group_adjacent == 0
    assert result.group_same_table == 6


def test_unseated_partner_earns_nothing() -> None:
    event = problem(guests=(guest(1, knows=(2,)), guest(2)))
    assert score(event, {1: 1}).total == 0


def test_changes_term_counts_each_moved_guest() -> None:
    event = problem(guests=(guest(1), guest(2), guest(3)))
    previous = {1: 1, 2: 2, 3: 3}
    result = score(event, {1: 1, 2: 3, 3: 2}, previous)
    assert result.changes == -16  # guests 2 and 3 moved
    assert result.total == -16


def test_guest_who_left_is_not_a_change() -> None:
    event = problem(guests=(guest(1),))
    assert score(event, {1: 1}, {1: 1, 2: 2}).changes == 0


def test_total_is_sum_of_terms() -> None:
    guests = (
        guest(1, knows=(2,), group_id=5, keep_adjacent=True),
        guest(2, group_id=5, keep_adjacent=True),
        guest(3, knows=(1,)),
    )
    event = problem(guests=guests)
    result = score(event, {1: 2, 2: 1, 3: 3}, {1: 1, 2: 2, 3: 3})
    parts = (
        result.friend_adjacent
        + result.friend_same_table
        + result.group_adjacent
        + result.group_same_table
        + result.changes
    )
    assert result.total == parts
    # pair 1-2: friends + group, adjacent same table = 10+4+15+6; pair 1-3: 10+4;
    # two guests moved: -16.
    assert result.total == 35 + 14 - 16
