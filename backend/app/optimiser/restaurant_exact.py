"""Exact restaurant optimiser for small services (about 6 tables, 8 parties).

It answers one question for the report: how far is the fast heuristic from the
true optimum? Two methods give the same optimal score:

- CP-SAT from OR-tools, when the package can be imported;
- a pure-Python branch and bound, so the check also runs where OR-tools cannot
  be installed (for example a small serverless function).

Both use the same candidate table choices and the same hard rules as the
heuristic (restaurant_model.py), so "optimal" means optimal for the same problem.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

from app.optimiser.restaurant_model import (
    Assignment,
    ExactPlan,
    Floor,
    PartySpec,
    TableSpec,
    candidate_choices,
    capacity,
    place_fixed,
    score_plan,
    zone_met,
)

try:
    from ortools.sat.python import cp_model
except ImportError:  # OR-tools is an optional extra: fall back to branch and bound.
    cp_model = None


def _waste(by_id: dict[int, TableSpec], choice: tuple[int, ...], party: PartySpec) -> int:
    return capacity([by_id[table_id] for table_id in choice]) - party.size


def _zone(by_id: dict[int, TableSpec], choice: tuple[int, ...], party: PartySpec) -> int:
    return 1 if zone_met([by_id[table_id] for table_id in choice], party) else 0


def _plan(
    tables: list[TableSpec],
    parties: list[PartySpec],
    assignment: Assignment,
    proven: bool,
    method: str,
    started: float,
) -> ExactPlan:
    unseated = tuple(sorted(party.id for party in parties if party.id not in assignment))
    return ExactPlan(
        assignments=assignment,
        unseated=unseated,
        score=score_plan(tables, parties, assignment),
        proven_optimal=proven,
        method=method,
        seconds=time.monotonic() - started,
    )


# ---------------------------------------------------------------- branch and bound


@dataclass
class _Search:
    by_id: dict[int, TableSpec]
    order: list[PartySpec]
    candidates: dict[int, list[tuple[int, ...]]]
    deadline: float
    # Optimistic totals for parties order[i:], used as the bound.
    rest_covers: list[int] = field(default_factory=list)
    rest_min_waste: list[int] = field(default_factory=list)
    rest_zone: list[int] = field(default_factory=list)
    best_key: tuple[int, int, int] | None = None
    best: Assignment = field(default_factory=dict)
    timed_out: bool = False

    def prepare_bounds(self) -> None:
        self.rest_covers = [0] * (len(self.order) + 1)
        self.rest_min_waste = [0] * (len(self.order) + 1)
        self.rest_zone = [0] * (len(self.order) + 1)
        for i in range(len(self.order) - 1, -1, -1):
            party = self.order[i]
            options = self.candidates[party.id]
            seatable = 1 if options else 0
            self.rest_covers[i] = self.rest_covers[i + 1] + seatable * party.size
            wastes = [_waste(self.by_id, choice, party) for choice in options]
            self.rest_min_waste[i] = self.rest_min_waste[i + 1] + min(wastes, default=0)
            zones = [_zone(self.by_id, choice, party) for choice in options]
            self.rest_zone[i] = self.rest_zone[i + 1] + max(zones, default=0)


def _branch(search: _Search, i: int, floor: Floor, key: tuple[int, int, int]) -> None:
    """Depth-first search over parties; key = (covers, -waste, zones) so far."""
    if time.monotonic() > search.deadline:
        search.timed_out = True
        return
    if i == len(search.order):
        if search.best_key is None or key > search.best_key:
            search.best_key, search.best = key, floor.assignment()
        return
    # Optimistic bound: every remaining seatable party seated with its least
    # waste and its zone wish. If even that cannot beat the best, stop here.
    bound = (
        key[0] + search.rest_covers[i],
        key[1] - search.rest_min_waste[i],
        key[2] + search.rest_zone[i],
    )
    if search.best_key is not None and bound <= search.best_key:
        return
    party = search.order[i]
    for choice in search.candidates[party.id]:
        if not floor.is_free(party, choice):
            continue
        floor.place(party, choice)
        gain = (
            party.size,
            -_waste(search.by_id, choice, party),
            _zone(search.by_id, choice, party),
        )
        _branch(search, i + 1, floor, (key[0] + gain[0], key[1] + gain[1], key[2] + gain[2]))
        floor.remove(party.id)
    _branch(search, i + 1, floor, key)  # the branch where this party stays unseated


def solve_with_branch_and_bound(
    tables: list[TableSpec], parties: list[PartySpec], time_limit_s: float
) -> ExactPlan:
    started = time.monotonic()
    floor = place_fixed(tables, parties)
    fixed_score = score_plan(
        tables, [p for p in parties if p.fixed_tables is not None], floor.assignment()
    )
    movable = [party for party in parties if party.fixed_tables is None]
    # Big parties first: their choices matter most, so good plans are found early
    # and the bound starts pruning sooner.
    movable.sort(key=lambda party: (-party.size, party.id))
    search = _Search(
        by_id={table.id: table for table in tables},
        order=movable,
        candidates={party.id: candidate_choices(tables, party) for party in movable},
        deadline=started + time_limit_s,
    )
    search.prepare_bounds()
    # If time runs out before the first full plan, we still return the fixed
    # parties on their own tables, never a plan that drops them.
    search.best = floor.assignment()
    _branch(search, 0, floor, fixed_score.key())
    return _plan(tables, parties, search.best, not search.timed_out, "branch-and-bound", started)


# ---------------------------------------------------------------- CP-SAT


def _objective_weights(
    by_id: dict[int, TableSpec],
    parties: list[PartySpec],
    candidates: dict[int, list[tuple[int, ...]]],
) -> tuple[int, int]:
    """Weights that turn the three-level priority into one number.

    A zone wish is worth 1. One wasted seat costs more than all zone wishes
    together, and one cover is worth more than all possible waste together, so
    the single weighted sum ranks plans exactly like the lexicographic key.
    """
    waste_weight = len(parties) + 1
    max_waste = sum(
        max((_waste(by_id, c, p) for c in candidates[p.id]), default=0) for p in parties
    )
    cover_weight = waste_weight * (max_waste + 1)
    return cover_weight, waste_weight


def solve_with_cp_sat(
    tables: list[TableSpec], parties: list[PartySpec], time_limit_s: float
) -> ExactPlan:
    if cp_model is None:
        raise RuntimeError("OR-tools is not installed")
    started = time.monotonic()
    place_fixed(tables, parties)  # same validation of fixed choices as everywhere else
    by_id = {table.id: table for table in tables}
    candidates = {party.id: candidate_choices(tables, party) for party in parties}
    cover_w, waste_w = _objective_weights(by_id, parties, candidates)
    model = cp_model.CpModel()
    # picks[(party id, choice)] is a yes/no variable: "this party sits at these tables".
    picks: dict[tuple[int, tuple[int, ...]], object] = {}
    users: dict[tuple[int, int], list[object]] = {}
    objective_terms: list[object] = []
    for party in parties:
        for choice in candidates[party.id]:
            var = model.NewBoolVar(f"party{party.id}_tables{choice}")
            picks[(party.id, choice)] = var
            value = (
                cover_w * party.size
                - waste_w * _waste(by_id, choice, party)
                + _zone(by_id, choice, party)
            )
            objective_terms.append(value * var)
            for table_id in choice:
                for slot in party.slots():
                    users.setdefault((table_id, slot), []).append(var)
        party_vars = [picks[(party.id, choice)] for choice in candidates[party.id]]
        if party.fixed_tables is not None:
            model.Add(sum(party_vars) == 1)
        else:
            model.Add(sum(party_vars) <= 1)
    # A table hosts at most one party in each slot.
    for same_table_and_slot in users.values():
        model.AddAtMostOne(same_table_and_slot)
    model.Maximize(sum(objective_terms))
    return _run_cp_sat(model, picks, tables, parties, time_limit_s, started)


def _run_cp_sat(
    model: object,
    picks: dict[tuple[int, tuple[int, ...]], object],
    tables: list[TableSpec],
    parties: list[PartySpec],
    time_limit_s: float,
    started: float,
) -> ExactPlan:
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_s
    # One worker and a fixed seed make CP-SAT give the same answer on every run.
    solver.parameters.num_workers = 1
    solver.parameters.random_seed = 0
    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        # Fixed choices were already checked by place_fixed, so the only way to
        # get here is a time limit too short to find even a first plan.
        raise TimeoutError("CP-SAT found no plan within the time limit")
    assignment = {pid: choice for (pid, choice), var in picks.items() if solver.Value(var)}
    return _plan(tables, parties, assignment, status == cp_model.OPTIMAL, "cp-sat", started)


def assign_exact(
    tables: list[TableSpec], parties: list[PartySpec], time_limit_s: float = 10.0
) -> ExactPlan:
    """Proven optimum on small services. proven_optimal is False if time ran out."""
    if cp_model is not None:
        return solve_with_cp_sat(tables, parties, time_limit_s)
    return solve_with_branch_and_bound(tables, parties, time_limit_s)
