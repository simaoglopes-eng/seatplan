"""assign_service on tiny services where the right answer is known by hand."""

import pytest

from app.optimiser.restaurant_assign import assign_service
from app.optimiser.restaurant_model import PartySpec, TableSpec, check_hard


def table(
    id: int,
    max_party: int,
    zone: str = "main",
    accessible: bool = True,
    high_chair_ok: bool = True,
    combine_group: str | None = None,
    min_party: int = 1,
) -> TableSpec:
    return TableSpec(id, min_party, max_party, zone, accessible, high_chair_ok, combine_group)


def party(
    id: int,
    size: int,
    start: int = 0,
    end: int = 4,
    needs_accessible: bool = False,
    high_chairs: int = 0,
    zone_pref: str | None = None,
    fixed: tuple[int, ...] | None = None,
) -> PartySpec:
    return PartySpec(id, size, start, end, needs_accessible, high_chairs, zone_pref, fixed)


def test_most_covers_come_first() -> None:
    # One table for 6, two parties at the same time: the 6 must win over the 2.
    plan = assign_service([table(1, 6)], [party(1, 2), party(2, 6)], seed=0, max_iterations=100)
    assert dict(plan.assignments) == {2: (1,)}
    assert plan.unseated == (1,)
    assert plan.score.covers_seated == 6


def test_small_party_does_not_take_the_big_table() -> None:
    tables = [table(1, 6), table(2, 2)]
    plan = assign_service(tables, [party(1, 2)], seed=0, max_iterations=100)
    assert dict(plan.assignments) == {1: (2,)}
    assert plan.score.wasted_seats == 0


def test_big_table_is_kept_for_the_big_party_that_comes_later() -> None:
    # The party of 2 could take either table; only one plan seats both parties.
    tables = [table(1, 6), table(2, 4)]
    parties = [party(1, 2, start=0, end=8), party(2, 6, start=4, end=8)]
    plan = assign_service(tables, parties, seed=3, max_iterations=200)
    assert dict(plan.assignments) == {1: (2,), 2: (1,)}


def test_zone_wish_is_honoured_when_it_costs_nothing() -> None:
    tables = [table(1, 4, zone="main"), table(2, 4, zone="terrace")]
    plan = assign_service(tables, [party(1, 4, zone_pref="terrace")], seed=0, max_iterations=100)
    assert dict(plan.assignments) == {1: (2,)}
    assert plan.score.zone_prefs_met == 1


def test_big_party_sits_at_combined_tables() -> None:
    tables = [
        table(1, 4, combine_group="A"),
        table(2, 4, combine_group="A"),
        table(3, 2),
    ]
    plan = assign_service(tables, [party(1, 8), party(2, 2)], seed=0, max_iterations=100)
    assert dict(plan.assignments) == {1: (1, 2), 2: (3,)}


def test_fixed_party_never_moves_even_when_moving_would_score_better() -> None:
    # The diner chose the 6-top for 2 people. Moving them would seat the party
    # of 6 too, but a human choice is a hard rule.
    tables = [table(1, 6), table(2, 2)]
    parties = [party(1, 2, fixed=(1,)), party(2, 6)]
    plan = assign_service(tables, parties, seed=0, max_iterations=500)
    assert plan.assignments[1] == (1,)
    assert plan.unseated == (2,)


def test_invalid_fixed_choice_is_refused_loudly() -> None:
    with pytest.raises(ValueError, match="fixed choice is invalid"):
        assign_service([table(1, 2)], [party(1, 4, fixed=(1,))])
    with pytest.raises(ValueError, match="overlaps"):
        assign_service([table(1, 4)], [party(1, 2, fixed=(1,)), party(2, 2, fixed=(1,))])


def test_hard_needs_leave_a_party_unseated_rather_than_break_a_rule() -> None:
    tables = [table(1, 4, accessible=False, high_chair_ok=False)]
    parties = [
        party(1, 2, needs_accessible=True),
        party(2, 2, start=8, end=10, high_chairs=1),
    ]
    plan = assign_service(tables, parties, seed=0, max_iterations=100)
    assert plan.unseated == (1, 2)


def _service() -> tuple[list[TableSpec], list[PartySpec]]:
    tables = [
        table(i, size, combine_group="A" if i <= 4 else None)
        for i, size in enumerate([2, 2, 4, 4, 6, 8], 1)
    ]
    parties = [
        party(i, (i * 3) % 7 + 1, start=(i * 5) % 12, end=(i * 5) % 12 + 6) for i in range(1, 15)
    ]
    return tables, parties


def test_same_seed_gives_the_same_plan() -> None:
    tables, parties = _service()
    first = assign_service(tables, parties, seed=7, max_iterations=1000)
    second = assign_service(tables, list(reversed(parties)), seed=7, max_iterations=1000)
    assert first == second


def test_every_seed_gives_a_feasible_plan_and_uses_the_whole_budget() -> None:
    tables, parties = _service()
    for seed in range(5):
        plan = assign_service(tables, parties, seed=seed, max_iterations=300)
        assert check_hard(tables, parties, dict(plan.assignments)) == []
        assert plan.iterations == 300
        assert set(plan.assignments) | set(plan.unseated) == {p.id for p in parties}
