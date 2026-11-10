"""The exact solvers against a brute force written independently in this file."""

from itertools import combinations

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.optimiser import restaurant_exact
from app.optimiser.restaurant_assign import assign_service
from app.optimiser.restaurant_exact import (
    assign_exact,
    solve_with_branch_and_bound,
    solve_with_cp_sat,
)
from app.optimiser.restaurant_model import PartySpec, TableSpec, check_hard

needs_ortools = pytest.mark.skipif(
    restaurant_exact.cp_model is None, reason="OR-tools not installed"
)


# ---------------------------------------------------------------- independent brute force
# Deliberately does not use candidate_choices or choice_problem from the model:
# the rules are written again from the contract so a bug there would show here.


def _fits(group: tuple[TableSpec, ...], p: PartySpec) -> bool:
    seats = sum(t.max_party for t in group)
    if len(group) == 1 and not (group[0].min_party <= p.size <= group[0].max_party):
        return False
    if len(group) > 1:
        names = {t.combine_group for t in group}
        if names == {None} or len(names) > 1 or p.size > seats:
            return False
        if p.size <= seats - min(t.max_party for t in group):
            return False
    if p.needs_accessible and not all(t.accessible for t in group):
        return False
    return p.high_chairs == 0 or any(t.high_chair_ok for t in group)


def _value(group: tuple[TableSpec, ...], p: PartySpec) -> tuple[int, int, int]:
    zone = 1 if p.zone_pref is not None and all(t.zone == p.zone_pref for t in group) else 0
    return (p.size, -(sum(t.max_party for t in group) - p.size), zone)


def brute_force(tables: list[TableSpec], parties: list[PartySpec]) -> tuple[int, int, int]:
    """Try every option for every party; return the best (covers, -waste, zones)."""
    groups = [g for k in (1, 2, 3) for g in combinations(tables, k)]
    best = None

    def visit(i: int, used: set[tuple[int, int]], total: tuple[int, int, int]) -> None:
        nonlocal best
        if i == len(parties):
            best = total if best is None or total > best else best
            return
        p = parties[i]
        if p.fixed_tables is None:
            visit(i + 1, used, total)  # this party stays unseated
        for group in groups:
            ids = sorted(t.id for t in group)
            if p.fixed_tables is not None and ids != sorted(p.fixed_tables):
                continue
            cells = {(t.id, s) for t in group for s in range(p.start_slot, p.end_slot)}
            if _fits(group, p) and not cells & used:
                gain = _value(group, p)
                visit(
                    i + 1,
                    used | cells,
                    (total[0] + gain[0], total[1] + gain[1], total[2] + gain[2]),
                )

    visit(0, set(), (0, 0, 0))
    return best


# ---------------------------------------------------------------- tiny random instances


@st.composite
def tiny_service(draw: st.DrawFn) -> tuple[list[TableSpec], list[PartySpec]]:
    zones = st.sampled_from(["main", "window"])
    tables = [
        TableSpec(
            i,
            1,
            draw(st.sampled_from([2, 4, 6])),
            draw(zones),
            draw(st.booleans()),
            draw(st.booleans()),
            draw(st.sampled_from([None, "A"])),
        )
        for i in range(1, draw(st.integers(1, 4)) + 1)
    ]
    parties = []
    for j in range(1, draw(st.integers(0, 5)) + 1):
        start = draw(st.integers(0, 6))
        parties.append(
            PartySpec(
                j,
                draw(st.integers(1, 10)),
                start,
                start + draw(st.integers(1, 4)),
                draw(st.booleans()),
                draw(st.integers(0, 1)),
                draw(st.sampled_from([None, "main", "window"])),
                None,
            )
        )
    return tables, parties


@settings(max_examples=60, deadline=None)
@given(tiny_service())
def test_branch_and_bound_equals_brute_force(
    service: tuple[list[TableSpec], list[PartySpec]],
) -> None:
    tables, parties = service
    plan = solve_with_branch_and_bound(tables, parties, time_limit_s=30)
    assert plan.proven_optimal
    assert check_hard(tables, parties, dict(plan.assignments)) == []
    assert plan.score.key() == brute_force(tables, parties)


@needs_ortools
@settings(max_examples=60, deadline=None)
@given(tiny_service())
def test_cp_sat_equals_brute_force(
    service: tuple[list[TableSpec], list[PartySpec]],
) -> None:
    tables, parties = service
    plan = solve_with_cp_sat(tables, parties, time_limit_s=30)
    assert plan.proven_optimal
    assert check_hard(tables, parties, dict(plan.assignments)) == []
    assert plan.score.key() == brute_force(tables, parties)


@settings(max_examples=60, deadline=None)
@given(tiny_service(), st.integers(0, 3))
def test_heuristic_never_beats_exact(
    service: tuple[list[TableSpec], list[PartySpec]], seed: int
) -> None:
    tables, parties = service
    heuristic = assign_service(tables, parties, seed=seed, max_iterations=300)
    exact = solve_with_branch_and_bound(tables, parties, time_limit_s=30)
    assert heuristic.score.key() <= exact.score.key()


# ---------------------------------------------------------------- hand-made cases


def _six_tables_eight_parties() -> tuple[list[TableSpec], list[PartySpec]]:
    tables = [
        TableSpec(
            i,
            1,
            size,
            "window" if i % 2 else "main",
            i != 3,
            True,
            "A" if i <= 3 else None,
        )
        for i, size in enumerate([2, 2, 4, 4, 6, 8], 1)
    ]
    parties = [
        PartySpec(
            j,
            (j * 3) % 8 + 1,
            (j * 2) % 6,
            (j * 2) % 6 + 5,
            j == 4,
            0,
            "window" if j % 3 == 0 else None,
            (5,) if j == 1 else None,
        )
        for j in range(1, 9)
    ]
    return tables, parties


def test_both_exact_methods_agree_and_keep_the_fixed_party() -> None:
    tables, parties = _six_tables_eight_parties()
    bnb = solve_with_branch_and_bound(tables, parties, time_limit_s=30)
    assert bnb.proven_optimal and bnb.method == "branch-and-bound"
    assert bnb.assignments[1] == (5,)
    if restaurant_exact.cp_model is not None:
        cp = solve_with_cp_sat(tables, parties, time_limit_s=30)
        assert cp.proven_optimal and cp.method == "cp-sat"
        assert cp.score.key() == bnb.score.key()
        assert cp.assignments[1] == (5,)


def test_branch_and_bound_out_of_time_says_so_and_keeps_fixed_party() -> None:
    tables, parties = _six_tables_eight_parties()
    plan = solve_with_branch_and_bound(tables, parties, time_limit_s=0)
    assert not plan.proven_optimal
    assert check_hard(tables, parties, dict(plan.assignments)) == []


def test_assign_exact_prefers_cp_sat_when_available() -> None:
    tables, parties = _six_tables_eight_parties()
    expected = "cp-sat" if restaurant_exact.cp_model is not None else "branch-and-bound"
    assert assign_exact(tables, parties, time_limit_s=30).method == expected


def test_assign_exact_falls_back_to_branch_and_bound(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(restaurant_exact, "cp_model", None)
    tables, parties = _six_tables_eight_parties()
    assert assign_exact(tables, parties, time_limit_s=30).method == "branch-and-bound"
