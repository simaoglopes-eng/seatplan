"""Property-based tests: random services must never break a hard rule.

Hypothesis invents many random restaurants and bookings. For each one we check
the rules directly (not only through check_hard), so a bug in check_hard cannot
hide a bug in the optimiser.
"""

from hypothesis import given, settings
from hypothesis import strategies as st

from app.optimiser.restaurant_assign import (
    assign_service,
    recommend_table,
    whatif_walkin,
)
from app.optimiser.restaurant_model import (
    Assignment,
    Floor,
    PartySpec,
    TableSpec,
    candidate_choices,
    check_hard,
)


@st.composite
def service(draw: st.DrawFn) -> tuple[list[TableSpec], list[PartySpec]]:
    tables = [
        TableSpec(
            i,
            draw(st.integers(1, 2)),
            draw(st.sampled_from([2, 4, 6, 8])),
            draw(st.sampled_from(["main", "window"])),
            draw(st.booleans()),
            draw(st.booleans()),
            draw(st.sampled_from([None, "A", "B"])),
        )
        for i in range(1, draw(st.integers(1, 7)) + 1)
    ]
    floor = Floor()  # used only to make sure the fixed choices we invent do not overlap
    parties = []
    for j in range(1, draw(st.integers(0, 12)) + 1):
        start = draw(st.integers(0, 20))
        party = PartySpec(
            j,
            draw(st.integers(1, 12)),
            start,
            start + draw(st.integers(1, 8)),
            draw(st.booleans()),
            draw(st.integers(0, 2)),
            draw(st.sampled_from([None, "main", "window"])),
            None,
        )
        options = [c for c in candidate_choices(tables, party) if floor.is_free(party, c)]
        if options and draw(st.booleans()):
            choice = options[draw(st.integers(0, len(options) - 1))]
            party = PartySpec(**{**party.__dict__, "fixed_tables": choice})
            floor.place(party, choice)
        parties.append(party)
    return tables, parties


def assert_rules_hold(
    tables: list[TableSpec], parties: list[PartySpec], assignment: Assignment
) -> None:
    by_table = {t.id: t for t in tables}
    used: dict[tuple[int, int], int] = {}
    for p in parties:
        if p.fixed_tables is not None:
            assert assignment[p.id] == tuple(sorted(p.fixed_tables)), "a fixed party moved"
        if p.id not in assignment:
            continue
        chosen = [by_table[t] for t in assignment[p.id]]
        assert sum(t.max_party for t in chosen) >= p.size, "undersized table"
        for t in chosen:
            for slot in range(p.start_slot, p.end_slot):
                assert (t.id, slot) not in used, "two parties on one table at once"
                used[(t.id, slot)] = p.id
    assert check_hard(tables, parties, assignment) == []


@settings(max_examples=150, deadline=None)
@given(service(), st.integers(0, 1000))
def test_service_plan_never_breaks_a_hard_rule(
    case: tuple[list[TableSpec], list[PartySpec]], seed: int
) -> None:
    tables, parties = case
    plan = assign_service(tables, parties, seed=seed, max_iterations=200)
    assert_rules_hold(tables, parties, dict(plan.assignments))
    assert sorted(plan.unseated) == sorted(p.id for p in parties if p.id not in plan.assignments)


@settings(max_examples=150, deadline=None)
@given(service())
def test_recommendations_are_free_and_big_enough(
    case: tuple[list[TableSpec], list[PartySpec]],
) -> None:
    tables, parties = case
    plan = assign_service(tables, parties, seed=0, max_iterations=50)
    floor = Floor()
    for p in parties:
        if p.id in plan.assignments:
            floor.place(p, plan.assignments[p.id])
    newcomer = PartySpec(999, 4, 5, 9, False, 0, "window", None)
    for choice in recommend_table(tables, floor.busy(), newcomer, top=5):
        assert floor.is_free(newcomer, choice.table_ids)
        assert sum(t.max_party for t in tables if t.id in choice.table_ids) >= newcomer.size


@settings(max_examples=150, deadline=None)
@given(service(), st.integers(1, 10))
def test_walkin_answer_is_feasible_and_leaves_the_plan_alone(
    case: tuple[list[TableSpec], list[PartySpec]], size: int
) -> None:
    tables, parties = case
    plan = assign_service(tables, parties, seed=0, max_iterations=50)
    before = dict(plan.assignments)
    walkin = PartySpec(999, size, 6, 10, False, 0, None, None)
    answer = whatif_walkin(tables, parties, plan, walkin)
    assert dict(plan.assignments) == before
    if answer.table_ids is None:
        return
    after = dict(before)
    for move in answer.displaced:
        after[move.party_id] = move.to_tables
    after[walkin.id] = answer.table_ids
    assert_rules_hold(tables, parties + [walkin], after)
