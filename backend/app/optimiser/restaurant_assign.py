"""Heuristic restaurant optimiser: recommend a table, plan a service, answer walk-ins.

Method in one sentence: a seeded greedy pass (largest parties first, best-fit
table) followed by a local search that keeps any change that does not make the
plan worse. The objective is the lexicographic key in ScoreBreakdown.key():
most covers seated, then fewest wasted seats, then most zone wishes met.

Determinism: all randomness comes from one random.Random(seed), and the
iteration budget is what stops the search. The wall-clock limit is only a
safety net, set high enough that it never fires on demo-sized services.
"""

from __future__ import annotations

import random
import time
from collections.abc import Callable
from dataclasses import dataclass

from app.optimiser.restaurant_model import (
    Displacement,
    Floor,
    PartySpec,
    ServicePlan,
    TableChoice,
    TableSpec,
    WalkinAnswer,
    candidate_choices,
    capacity,
    party_name,
    place_fixed,
    prefs_met,
    score_plan,
    table_name,
    zone_met,
)

DEFAULT_ITERATIONS = 5000
# Ends well before the 30 s Vercel limit (vercel.json), with room for the
# exact check that may run after it in the same request.
SAFETY_TIME_LIMIT_S = 15.0
# A wish may win over up to this many spare seats, never more (spec 8.2): a
# couple who wants sun gets a sunny table for four, not the table for eight.
WISH_WASTE_MARGIN = 2

WISH_MET = {
    "sun": "Sunny, as you asked",
    "shade": "In the shade, as you asked",
    "view": "Has a view, as you asked",
    "quiet": "Quiet corner, as you asked",
    "away_from_wc": "Away from the toilets, as you asked",
}
WISH_NOT_HERE = {
    "sun": "Not in the sun",
    "shade": "Not in the shade",
    "view": "No view from this table",
    "quiet": "Not a quiet spot",
    "away_from_wc": "Within 5 m of the toilets",
}
WISH_NOWHERE = {
    "sun": "No sunny table is free at {time}",
    "shade": "No shaded table is free at {time}",
    "view": "No table with a view is free at {time}",
    "quiet": "No quiet table is free at {time}",
    "away_from_wc": "No table away from the toilets is free at {time}",
}


def tables_text(choice: tuple[int, ...], tables_by_id: dict[int, TableSpec]) -> str:
    """ "table T5" or "tables T5 + T6": diners read this, so we use labels, not ids."""
    names = [table_name(tables_by_id[table_id]) for table_id in choice]
    if len(names) == 1:
        return f"table {names[0]}"
    return "tables " + " + ".join(names)


# ---------------------------------------------------------------- recommend


def _free_in_busy(choice: tuple[int, ...], busy: dict[int, set[int]], party: PartySpec) -> bool:
    return all(
        slot not in busy.get(table_id, set()) for table_id in choice for slot in party.slots()
    )


def _slot_time(slot: int) -> str:
    """Slot 52 -> "13:00": the same 15-minute grid as restaurant_service.clock."""
    hours, minutes = divmod(slot * 15, 60)
    return f"{hours % 24:02d}:{minutes:02d}"


def _wish_reasons(
    party: PartySpec, chosen: list[TableSpec], met_somewhere: frozenset[str]
) -> list[str]:
    met = prefs_met(chosen, party)
    reasons = []
    for wish in sorted(party.prefs):
        if wish in met:
            reasons.append(WISH_MET.get(wish, f"{wish} as you asked"))
        elif wish in met_somewhere:
            reasons.append(WISH_NOT_HERE.get(wish, f"Not {wish}"))
        else:
            template = WISH_NOWHERE.get(wish, "No table like that is free at {time}")
            reasons.append(template.format(time=_slot_time(party.start_slot)))
    return reasons


def _explain(
    choice: tuple[int, ...],
    party: PartySpec,
    by_id: dict[int, TableSpec],
    largest_free: int,
    met_somewhere: frozenset[str] = frozenset(),
) -> TableChoice:
    chosen = [by_id[table_id] for table_id in choice]
    seats = capacity(chosen)
    waste = seats - party.size
    reasons: list[str] = []
    if len(choice) > 1:
        reasons.append(f"Joins {tables_text(choice, by_id)} for a party of {party.size}")
    reasons.append(f"Exact fit for {party.size}" if waste == 0 else f"Seats {seats}, {waste} spare")
    if largest_free > seats:
        reasons.append(f"Keeps the table for {largest_free} free for a larger party")
    if party.needs_accessible:
        reasons.append("Accessible table as needed")
    if party.high_chairs > 0:
        reasons.append(f"Room for {party.high_chairs} high chair(s)")
    met = zone_met(chosen, party)
    if party.zone_pref is not None:
        zone = party.zone_pref.capitalize()
        reasons.append(
            f"{zone} zone as requested" if met else f"Outside the {party.zone_pref} zone"
        )
    reasons.extend(_wish_reasons(party, chosen, met_somewhere))
    return TableChoice(table_ids=choice, waste=waste, zone_met=met, reasons=tuple(reasons))


def recommend_table(
    tables: list[TableSpec], busy: dict[int, set[int]], party: PartySpec, top: int = 3
) -> list[TableChoice]:
    """Rank the free tables for one party: least waste first, then zone wish.

    Hard needs (size, accessibility, high chairs) are already filtered out by
    candidate_choices. Combined tables are offered only when no single table
    fits, because joining tables is extra work for the staff. Ambience wishes
    (party.prefs) reorder only the choices that waste at most
    WISH_WASTE_MARGIN seats; beyond that, fewer spare seats still wins.
    """
    by_id = {table.id: table for table in tables}
    free = [
        choice for choice in candidate_choices(tables, party) if _free_in_busy(choice, busy, party)
    ]
    singles = [choice for choice in free if len(choice) == 1]
    shortlist = singles if singles else free
    met_somewhere: frozenset[str] = frozenset()
    if party.prefs:

        def wish_order(choice: tuple[int, ...]) -> tuple[int, int]:
            chosen = [by_id[table_id] for table_id in choice]
            spare = capacity(chosen) - party.size
            return (0 if spare <= WISH_WASTE_MARGIN else 1, -len(prefs_met(chosen, party)))

        # A stable sort keeps the old order (waste, zone, fewer tables, ids)
        # inside each group, so wishes only ever break ties.
        shortlist = sorted(shortlist, key=wish_order)
        met_somewhere = frozenset().union(
            *(prefs_met([by_id[t] for t in choice], party) for choice in shortlist)
        )
    # Used for the "protects a bigger table" reason: the biggest free table that would also fit.
    largest_free = max((by_id[choice[0]].max_party for choice in singles), default=0)
    return [
        _explain(choice, party, by_id, largest_free, met_somewhere) for choice in shortlist[:top]
    ]


# ---------------------------------------------------------------- service plan


@dataclass(frozen=True)
class _Problem:
    """Everything the search looks up repeatedly, computed once."""

    tables: list[TableSpec]
    parties: list[PartySpec]
    party: dict[int, PartySpec]
    candidates: dict[int, list[tuple[int, ...]]]
    movable: list[int]

    @staticmethod
    def build(tables: list[TableSpec], parties: list[PartySpec]) -> _Problem:
        return _Problem(
            tables=tables,
            parties=parties,
            party={party.id: party for party in parties},
            candidates={party.id: candidate_choices(tables, party) for party in parties},
            movable=sorted(party.id for party in parties if party.fixed_tables is None),
        )


def _first_free(
    floor: Floor, party: PartySpec, options: list[tuple[int, ...]]
) -> tuple[int, ...] | None:
    for choice in options:
        if floor.is_free(party, choice):
            return choice
    return None


def _seat_in_order(problem: _Problem, floor: Floor, order: list[PartySpec]) -> None:
    """Best fit: give each unseated party, in this order, its first free choice."""
    for party in order:
        if party.id in floor.placed:
            continue
        choice = _first_free(floor, party, problem.candidates[party.id])
        if choice is not None:
            floor.place(party, choice)


def _greedy(problem: _Problem, rng: random.Random) -> Floor:
    floor = place_fixed(problem.tables, problem.parties)
    order = [problem.party[pid] for pid in problem.movable]
    # Shuffle first, then a stable sort by size: big parties go first, and the
    # seed only decides the order among parties of the same size.
    rng.shuffle(order)
    order.sort(key=lambda party: -party.size)
    _seat_in_order(problem, floor, order)
    return floor


def _try_move(problem: _Problem, floor: Floor, rng: random.Random) -> Floor | None:
    """Move one seated party to another table choice that is free."""
    seated = [pid for pid in problem.movable if pid in floor.placed]
    if not seated:
        return None
    party = problem.party[rng.choice(seated)]
    choice = rng.choice(problem.candidates[party.id])
    if not floor.is_free(party, choice):
        return None
    trial = floor.copy()
    trial.remove(party.id)
    trial.place(party, choice)
    return trial


def _try_swap(problem: _Problem, floor: Floor, rng: random.Random) -> Floor | None:
    """Exchange the tables of two seated parties, if each fits the other's tables."""
    seated = [pid for pid in problem.movable if pid in floor.placed]
    if len(seated) < 2:
        return None
    first_id, second_id = rng.sample(seated, 2)
    first, second = problem.party[first_id], problem.party[second_id]
    first_choice, second_choice = floor.placed[first_id][1], floor.placed[second_id][1]
    if (
        second_choice not in problem.candidates[first_id]
        or first_choice not in problem.candidates[second_id]
    ):
        return None
    trial = floor.copy()
    trial.remove(first_id)
    trial.remove(second_id)
    if not trial.is_free(first, second_choice):
        return None
    trial.place(first, second_choice)
    if not trial.is_free(second, first_choice):
        return None
    trial.place(second, first_choice)
    return trial


def _push(
    problem: _Problem, floor: Floor, party: PartySpec, choice: tuple[int, ...]
) -> Floor | None:
    """Put the party on `choice`, pushing aside the non-fixed parties in the way.

    Afterwards every unseated party (the pushed ones included) gets a best-fit
    table if one is free, biggest first. The search keeps the result only if the
    score does not drop, for example when one party of 8 makes room for two
    parties of 6.
    """
    blockers = floor.blockers(party, choice)
    if any(problem.party[pid].fixed_tables is not None for pid in blockers):
        return None
    trial = floor.copy()
    for pid in blockers:
        trial.remove(pid)
    if party.id in trial.placed:
        trial.remove(party.id)
    trial.place(party, choice)
    unseated = [problem.party[pid] for pid in problem.movable if pid not in trial.placed]
    unseated.sort(key=lambda other: (-other.size, other.id))
    _seat_in_order(problem, trial, unseated)
    return trial


def _try_seat_unseated(problem: _Problem, floor: Floor, rng: random.Random) -> Floor | None:
    """Seat a waiting party on a random choice, relocating whoever is in the way."""
    waiting = [pid for pid in problem.movable if pid not in floor.placed]
    if not waiting:
        return None
    party = problem.party[rng.choice(waiting)]
    if not problem.candidates[party.id]:
        return None
    return _push(problem, floor, party, rng.choice(problem.candidates[party.id]))


def _try_push_seated(problem: _Problem, floor: Floor, rng: random.Random) -> Floor | None:
    """Like a move, but the target tables may be taken: their users are relocated."""
    seated = [pid for pid in problem.movable if pid in floor.placed]
    if not seated:
        return None
    party = problem.party[rng.choice(seated)]
    return _push(problem, floor, party, rng.choice(problem.candidates[party.id]))


_MOVES: tuple[Callable[[_Problem, Floor, random.Random], Floor | None], ...] = (
    _try_move,
    _try_swap,
    _try_seat_unseated,
    _try_push_seated,
)


def _key(problem: _Problem, floor: Floor) -> tuple[int, int, int, int]:
    # ranking_key = key() + wishes met: wishes only break ties between plans.
    return score_plan(problem.tables, problem.parties, floor.assignment()).ranking_key()


def _local_search(
    problem: _Problem,
    floor: Floor,
    rng: random.Random,
    max_iterations: int,
    time_limit_s: float,
) -> tuple[Floor, int]:
    """Try random moves; keep a move when the plan is not worse.

    Accepting equal moves lets the search walk across plans with the same score,
    which is often needed to free the right table for a waiting party. Because a
    worse plan is never accepted, the final plan is also the best one seen.
    """
    current = _key(problem, floor)
    deadline = time.monotonic() + time_limit_s
    done = 0
    while done < max_iterations and time.monotonic() < deadline:
        done += 1
        trial = rng.choice(_MOVES)(problem, floor, rng)
        if trial is None:
            continue
        trial_key = _key(problem, trial)
        if trial_key >= current:
            floor, current = trial, trial_key
    return floor, done


def _plan_from_floor(problem: _Problem, floor: Floor, iterations: int) -> ServicePlan:
    assignment = floor.assignment()
    unseated = tuple(sorted(party.id for party in problem.parties if party.id not in assignment))
    return ServicePlan(
        assignments=assignment,
        unseated=unseated,
        score=score_plan(problem.tables, problem.parties, assignment),
        iterations=iterations,
    )


def assign_service(
    tables: list[TableSpec],
    parties: list[PartySpec],
    seed: int = 0,
    max_iterations: int = DEFAULT_ITERATIONS,
    time_limit_s: float = SAFETY_TIME_LIMIT_S,
) -> ServicePlan:
    """Assign every party of one service to tables. Fixed parties never move."""
    problem = _Problem.build(tables, sorted(parties, key=lambda party: party.id))
    rng = random.Random(seed)
    floor = _greedy(problem, rng)
    floor, iterations = _local_search(problem, floor, rng, max_iterations, time_limit_s)
    return _plan_from_floor(problem, floor, iterations)


# ---------------------------------------------------------------- walk-in


def _floor_from_plan(parties: list[PartySpec], plan: ServicePlan) -> Floor:
    by_id = {party.id: party for party in parties}
    floor = Floor()
    for party_id, choice in plan.assignments.items():
        floor.place(by_id[party_id], choice)
    return floor


def _relocate_blockers(
    tables: list[TableSpec],
    by_id: dict[int, PartySpec],
    floor: Floor,
    walkin: PartySpec,
    choice: tuple[int, ...],
) -> list[Displacement] | None:
    """Seat the walk-in on `choice` and move whoever is in the way, or return None."""
    blockers = sorted(floor.blockers(walkin, choice), key=lambda pid: (-by_id[pid].size, pid))
    if any(by_id[pid].fixed_tables is not None for pid in blockers):
        return None
    trial = floor.copy()
    for pid in blockers:
        trial.remove(pid)
    trial.place(walkin, choice)
    moves: list[Displacement] = []
    for pid in blockers:
        new_choice = _first_free(trial, by_id[pid], candidate_choices(tables, by_id[pid]))
        if new_choice is None:
            return None
        trial.place(by_id[pid], new_choice)
        moves.append(
            Displacement(party_id=pid, from_tables=floor.placed[pid][1], to_tables=new_choice)
        )
    return moves


def _cheapest_displacement(
    tables: list[TableSpec], parties: list[PartySpec], floor: Floor, walkin: PartySpec
) -> WalkinAnswer:
    by_id = {party.id: party for party in parties}
    best: tuple[tuple[int, int], tuple[int, ...], list[Displacement]] | None = None
    for choice in candidate_choices(tables, walkin):
        moves = _relocate_blockers(tables, by_id, floor, walkin, choice)
        if moves is None:
            continue
        # Cheapest = fewest parties disturbed, then fewest guests disturbed.
        cost = (len(moves), sum(by_id[move.party_id].size for move in moves))
        if best is None or cost < best[0]:
            best = (cost, choice, moves)
    if best is None:
        return WalkinAnswer(
            None,
            (),
            (f"No table can take a party of {walkin.size} now, even by moving bookings",),
        )
    _, choice, moves = best
    table_by_id = {table.id: table for table in tables}
    where = tables_text(choice, table_by_id)
    reasons = [f"Nothing is free for {walkin.size}; {where} works if bookings move"]
    reasons.extend(
        f"Move {party_name(by_id[m.party_id])} from {tables_text(m.from_tables, table_by_id)}"
        f" to {tables_text(m.to_tables, table_by_id)}"
        for m in moves
    )
    return WalkinAnswer(choice, tuple(moves), tuple(reasons))


def whatif_walkin(
    tables: list[TableSpec],
    parties: list[PartySpec],
    plan: ServicePlan,
    walkin: PartySpec,
) -> WalkinAnswer:
    """Best table for a walk-in, or the cheapest set of moves to make room.

    The plan is never changed: we work on a copy and only describe the moves.
    """
    floor = _floor_from_plan(parties, plan)
    best = recommend_table(tables, floor.busy(), walkin, top=1)
    if best:
        return WalkinAnswer(best[0].table_ids, (), best[0].reasons)
    return _cheapest_displacement(tables, parties, floor, walkin)
