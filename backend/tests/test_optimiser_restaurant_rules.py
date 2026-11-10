"""Hard rules, table recommendation and walk-in answers on tiny hand-made cases."""

from app.optimiser.restaurant_assign import (
    assign_service,
    recommend_table,
    whatif_walkin,
)
from app.optimiser.restaurant_model import (
    Floor,
    PartySpec,
    ServicePlan,
    TableSpec,
    candidate_choices,
    check_hard,
    choice_problem,
    largest_party,
    score_plan,
)


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


# ---------------------------------------------------------------- one rule at a time


def test_party_larger_than_table_does_not_fit() -> None:
    assert choice_problem([table(1, 4)], party(1, 5)) == "table 1 seats at most 4"


def test_party_below_table_minimum_does_not_fit() -> None:
    assert choice_problem([table(1, 6, min_party=3)], party(1, 2)) == "table 1 needs at least 3"


def test_accessibility_is_hard() -> None:
    assert (
        choice_problem([table(1, 4, accessible=False)], party(1, 2, needs_accessible=True))
        is not None
    )
    assert (
        choice_problem([table(1, 4, accessible=True)], party(1, 2, needs_accessible=True)) is None
    )


def test_high_chair_is_hard() -> None:
    assert (
        choice_problem([table(1, 4, high_chair_ok=False)], party(1, 3, high_chairs=1)) is not None
    )


def test_tables_combine_only_inside_one_group() -> None:
    same = [table(1, 4, combine_group="A"), table(2, 4, combine_group="A")]
    mixed = [table(1, 4, combine_group="A"), table(2, 4, combine_group="B")]
    loose = [table(1, 4), table(2, 4)]
    assert choice_problem(same, party(1, 8)) is None
    assert choice_problem(mixed, party(1, 8)) == "these tables cannot be combined"
    assert choice_problem(loose, party(1, 8)) == "these tables cannot be combined"


def test_combination_may_not_contain_a_spare_table() -> None:
    three = [
        table(1, 2, combine_group="A"),
        table(2, 2, combine_group="A"),
        table(3, 2, combine_group="A"),
    ]
    assert choice_problem(three, party(1, 4)) == "a smaller combination would already fit"
    assert choice_problem(three, party(1, 5)) is None


def test_fixed_party_has_only_its_own_choice() -> None:
    tables = [table(1, 2), table(2, 4)]
    assert candidate_choices(tables, party(1, 2, fixed=(2,))) == [(2,)]


def test_slots_are_half_open_so_back_to_back_parties_share_a_table() -> None:
    floor = Floor()
    floor.place(party(1, 2, start=0, end=4), (1,))
    assert floor.is_free(party(2, 2, start=4, end=8), (1,))
    assert not floor.is_free(party(3, 2, start=3, end=8), (1,))


def test_check_hard_reports_overlap_undersize_and_moved_fixed() -> None:
    tables = [table(1, 2), table(2, 4)]
    parties = [party(1, 2), party(2, 2), party(3, 4, start=10, end=12, fixed=(2,))]
    problems = check_hard(tables, parties, {1: (1,), 2: (1,), 3: (1,)})
    assert "parties 1 and 2 share table 1 at slot 0" in problems
    assert "fixed party 3 was moved" in problems
    assert "party 3: table 1 seats at most 2" in problems


def test_score_counts_covers_waste_and_zone() -> None:
    tables = [table(1, 6, zone="window"), table(2, 2)]
    parties = [party(1, 4, zone_pref="window"), party(2, 2), party(3, 2, start=1)]
    score = score_plan(tables, parties, {1: (1,), 2: (2,)})
    assert (
        score.covers_seated,
        score.wasted_seats,
        score.zone_prefs_met,
        score.parties_unseated,
    ) == (6, 2, 1, 1)
    assert score.key() == (6, -2, 1)


# ---------------------------------------------------------------- recommend_table


def test_party_of_two_gets_the_table_for_two_not_the_table_for_six() -> None:
    tables = [table(1, 6), table(2, 2)]
    best = recommend_table(tables, {}, party(1, 2))
    assert best[0].table_ids == (2,)
    assert "Exact fit for 2" in best[0].reasons
    assert "Keeps the table for 6 free for a larger party" in best[0].reasons
    assert [choice.table_ids for choice in best] == [(2,), (1,)]


def test_busy_table_is_never_recommended() -> None:
    tables = [table(1, 6), table(2, 2)]
    best = recommend_table(tables, {2: {3}}, party(1, 2, start=0, end=4))
    assert [choice.table_ids for choice in best] == [(1,)]


def test_zone_wish_breaks_a_tie_between_equal_tables() -> None:
    tables = [table(1, 4, zone="main"), table(2, 4, zone="window")]
    best = recommend_table(tables, {}, party(1, 4, zone_pref="window"))
    assert best[0].table_ids == (2,)
    assert "Window zone as requested" in best[0].reasons
    assert "Outside the window zone" in best[1].reasons


def test_zone_wish_never_beats_less_waste() -> None:
    tables = [table(1, 4, zone="main"), table(2, 6, zone="window")]
    best = recommend_table(tables, {}, party(1, 4, zone_pref="window"))
    assert best[0].table_ids == (1,)


def test_accessible_party_never_gets_a_step_table() -> None:
    tables = [table(1, 2, accessible=False), table(2, 6, accessible=True)]
    best = recommend_table(tables, {}, party(1, 2, needs_accessible=True))
    assert [choice.table_ids for choice in best] == [(2,)]
    assert "Accessible table as needed" in best[0].reasons


def test_big_party_gets_a_combination_when_no_single_table_fits() -> None:
    tables = [
        table(1, 4, combine_group="A"),
        table(2, 4, combine_group="A"),
        table(3, 6),
    ]
    best = recommend_table(tables, {}, party(1, 8))
    assert best[0].table_ids == (1, 2)
    assert "Joins tables 1 + 2 for a party of 8" in best[0].reasons


def test_combinations_are_not_offered_when_a_single_table_fits() -> None:
    tables = [
        table(1, 2, combine_group="A"),
        table(2, 2, combine_group="A"),
        table(3, 4),
    ]
    best = recommend_table(tables, {}, party(1, 4))
    assert [choice.table_ids for choice in best] == [(3,)]


def test_no_fitting_table_gives_an_empty_list() -> None:
    assert recommend_table([table(1, 2)], {}, party(1, 9)) == []


# ---------------------------------------------------------------- walk-ins


def _plan(tables: list[TableSpec], parties: list[PartySpec]) -> ServicePlan:
    return assign_service(tables, parties, seed=0, max_iterations=200)


def test_walkin_takes_a_free_table_without_moving_anyone() -> None:
    tables = [table(1, 2), table(2, 4)]
    parties = [party(1, 2)]
    answer = whatif_walkin(tables, parties, _plan(tables, parties), party(99, 4))
    assert answer.table_ids == (2,)
    assert answer.displaced == ()


def test_walkin_shows_the_cheapest_move_when_nothing_is_free() -> None:
    # Party 1 (2 people) sits on the 4-top because the 2-top is fixed to party 2
    # until slot 4. The walk-in of 4 at slot 4 needs the 4-top: party 1 can move
    # to the 2-top, which is free from slot 4.
    tables = [table(1, 2), table(2, 4)]
    parties = [party(1, 2, start=2, end=8), party(2, 2, start=0, end=4, fixed=(1,))]
    plan = ServicePlan(
        assignments={1: (2,), 2: (1,)},
        unseated=(),
        score=score_plan(tables, parties, {}),
        iterations=0,
    )
    answer = whatif_walkin(tables, parties, plan, party(99, 4, start=4, end=8))
    assert answer.table_ids is None
    assert answer.displaced == ()
    # Once the 2-top is free from slot 4 the move is possible.
    later = party(99, 4, start=4, end=8)
    parties_later = [
        party(1, 2, start=4, end=8),
        party(2, 2, start=0, end=4, fixed=(1,)),
    ]
    plan_later = ServicePlan(
        assignments={1: (2,), 2: (1,)}, unseated=(), score=plan.score, iterations=0
    )
    answer_later = whatif_walkin(tables, parties_later, plan_later, later)
    assert answer_later.table_ids == (2,)
    assert [(d.party_id, d.from_tables, d.to_tables) for d in answer_later.displaced] == [
        (1, (2,), (1,))
    ]
    assert dict(plan_later.assignments) == {
        1: (2,),
        2: (1,),
    }  # the plan itself is untouched


def test_walkin_never_displaces_a_fixed_party() -> None:
    tables = [table(1, 4), table(2, 2)]
    parties = [party(1, 2, fixed=(1,))]
    plan = _plan(tables, parties)
    answer = whatif_walkin(tables, parties, plan, party(99, 4))
    assert answer.table_ids is None
    assert "even by moving bookings" in answer.reasons[0]


# ---------------------------------------------------------------- names and limits


def test_reasons_use_table_labels_and_party_names_not_ids() -> None:
    labelled = [
        TableSpec(11, 1, 2, "main", True, True, None, label="T1"),
        TableSpec(12, 1, 4, "main", True, True, None, label="T2"),
    ]
    assert choice_problem([labelled[0]], party(1, 3)) == "table T1 seats at most 2"
    ana = PartySpec(7, 2, 0, 4, False, 0, None, None, label="Ana Costa")
    plan = ServicePlan(
        assignments={7: (12,)}, unseated=(), score=score_plan(labelled, [ana], {}), iterations=0
    )
    answer = whatif_walkin(labelled, [ana], plan, party(99, 4))
    assert answer.reasons[-1] == "Move Ana Costa (party of 2) from table T2 to table T1"


def test_largest_party_counts_only_combinations_the_rules_allow() -> None:
    # Two 4-tops that may be joined seat 8; the 6-top cannot join anything.
    tables = [table(1, 6), table(2, 4, combine_group="A"), table(3, 4, combine_group="A")]
    assert largest_party(tables) == 8
    # Without a combine group no table is joined, so the biggest single table wins.
    assert largest_party([table(1, 6), table(2, 4), table(3, 4)]) == 6
    assert largest_party([]) == 0
