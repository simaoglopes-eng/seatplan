"""Data types and hard rules for the restaurant optimiser.

Everything here is pure Python: no database, no web framework. The router turns
database rows into these dataclasses, and every algorithm in restaurant_assign.py
and restaurant_exact.py uses the rules below, so there is exactly one place that
decides what "a table fits a party" means.

Time is counted in 15-minute slot indexes within one day. A party occupies the
half-open range [start_slot, end_slot): a party from slot 8 to slot 12 frees the
table exactly when the next party may start at slot 12.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from itertools import combinations

# A combination of tables larger than this is not something a waiter can set up
# quickly, and limiting it keeps the number of candidate choices small.
MAX_COMBINED_TABLES = 3

# party id -> the table ids it sits at (sorted, one or more tables)
Assignment = dict[int, tuple[int, ...]]


@dataclass(frozen=True)
class TableSpec:
    id: int
    min_party: int
    max_party: int
    zone: str
    accessible: bool
    high_chair_ok: bool
    combine_group: str | None
    # What people call the table ("T5"). Only used in reasons; empty means "use the id".
    label: str = ""
    # Ambience facts for this service time, from ambience.table ("sun", "shade",
    # "view", "quiet", "away_from_wc"). Empty means "nothing known".
    features: frozenset[str] = frozenset()


@dataclass(frozen=True)
class PartySpec:
    id: int
    size: int
    start_slot: int
    end_slot: int
    needs_accessible: bool
    high_chairs: int
    zone_pref: str | None
    fixed_tables: tuple[int, ...] | None
    # Who the party is ("Ana Costa"). Only used in reasons; empty means "use the id".
    label: str = ""
    # Ambience wishes (spec 8.1), the same words as TableSpec.features. Wishes
    # only break ties; they never outrank a hard rule, a guest or a seat.
    prefs: frozenset[str] = frozenset()

    def slots(self) -> range:
        return range(self.start_slot, self.end_slot)


@dataclass(frozen=True)
class TableChoice:
    """One recommendation: a single table or a combination of tables."""

    table_ids: tuple[int, ...]
    waste: int
    zone_met: bool
    reasons: tuple[str, ...]


@dataclass(frozen=True)
class ScoreBreakdown:
    covers_seated: int
    covers_total: int
    parties_seated: int
    parties_unseated: int
    wasted_seats: int
    zone_prefs_met: int
    zone_prefs_wanted: int
    prefs_met: int = 0
    prefs_wanted: int = 0

    def key(self) -> tuple[int, int, int]:
        """Lexicographic objective: bigger is better, compare tuples left to right.

        Covers come first, then fewer wasted seats (hence the minus sign), then
        zone preferences. Python compares tuples element by element, which is
        exactly a strict priority order.
        """
        return (self.covers_seated, -self.wasted_seats, self.zone_prefs_met)

    def ranking_key(self) -> tuple[int, int, int, int]:
        """key() plus ambience wishes met, as the very last tie-breaker.

        key() stays the contract's three-part objective (the exact check, the
        staff "is it better?" test and the gap report compare it); the
        heuristic search ranks plans with this longer key, so among plans with
        the same key() it keeps the one that meets more wishes.
        """
        return (*self.key(), self.prefs_met)


@dataclass(frozen=True)
class ServicePlan:
    assignments: Mapping[int, tuple[int, ...]]
    unseated: tuple[int, ...]
    score: ScoreBreakdown
    iterations: int


@dataclass(frozen=True)
class Displacement:
    party_id: int
    from_tables: tuple[int, ...]
    to_tables: tuple[int, ...]


@dataclass(frozen=True)
class WalkinAnswer:
    table_ids: tuple[int, ...] | None
    displaced: tuple[Displacement, ...]
    reasons: tuple[str, ...]


@dataclass(frozen=True)
class ExactPlan:
    assignments: Mapping[int, tuple[int, ...]]
    unseated: tuple[int, ...]
    score: ScoreBreakdown
    proven_optimal: bool
    method: str
    seconds: float


def table_name(table: TableSpec) -> str:
    """What staff and diners call a table: its label, or its id when it has none."""
    return table.label or str(table.id)


def party_name(party: PartySpec) -> str:
    """ "Ana Costa (party of 4)": reasons name people, never database ids."""
    if party.label:
        return f"{party.label} (party of {party.size})"
    return f"party {party.id}"


def capacity(tables: list[TableSpec]) -> int:
    return sum(table.max_party for table in tables)


def zone_met(tables: list[TableSpec], party: PartySpec) -> bool:
    if party.zone_pref is None:
        return False
    return all(table.zone == party.zone_pref for table in tables)


def prefs_met(tables: list[TableSpec], party: PartySpec) -> frozenset[str]:
    """The party's wishes these tables meet; joined tables must all meet a wish."""
    return frozenset(
        wish for wish in party.prefs if tables and all(wish in t.features for t in tables)
    )


def _size_problem(tables: list[TableSpec], party: PartySpec) -> str | None:
    if len(tables) == 1:
        table = tables[0]
        if party.size > table.max_party:
            return f"table {table_name(table)} seats at most {table.max_party}"
        if party.size < table.min_party:
            return f"table {table_name(table)} needs at least {table.min_party}"
        return None
    groups = {table.combine_group for table in tables}
    if len(groups) != 1 or None in groups:
        return "these tables cannot be combined"
    if len(tables) > MAX_COMBINED_TABLES:
        return f"at most {MAX_COMBINED_TABLES} tables can be combined"
    if party.size > capacity(tables):
        return f"combined tables seat at most {capacity(tables)}"
    # Every table in a combination must be needed, otherwise one table would
    # be blocked for nothing.
    smallest = min(table.max_party for table in tables)
    if party.size <= capacity(tables) - smallest:
        return "a smaller combination would already fit"
    return None


def choice_problem(tables: list[TableSpec], party: PartySpec) -> str | None:
    """Return why these tables cannot host the party, or None if they can.

    This ignores time: whether the tables are free is the Floor's job.
    """
    if not tables:
        return "no table chosen"
    if len({table.id for table in tables}) != len(tables):
        return "the same table is listed twice"
    size_problem = _size_problem(tables, party)
    if size_problem is not None:
        return size_problem
    if party.needs_accessible and not all(table.accessible for table in tables):
        return "party needs an accessible table"
    if party.high_chairs > 0 and not any(table.high_chair_ok for table in tables):
        return "party needs room for a high chair"
    return None


def _choice_order(
    tables: list[TableSpec], party: PartySpec
) -> tuple[int, int, int, tuple[int, ...]]:
    # Best fit first (least waste), then zone wish, then fewer tables, then ids
    # so that ties always break the same way.
    return (
        capacity(tables) - party.size,
        0 if zone_met(tables, party) else 1,
        len(tables),
        tuple(table.id for table in tables),
    )


def candidate_choices(tables: list[TableSpec], party: PartySpec) -> list[tuple[int, ...]]:
    """Every table or table combination that may host the party, best fit first.

    A party with fixed_tables has exactly one candidate: the diner's own choice.
    """
    if party.fixed_tables is not None:
        return [tuple(sorted(party.fixed_tables))]
    options = _every_option(tables)
    fitting = [option for option in options if choice_problem(option, party) is None]
    fitting.sort(key=lambda option: _choice_order(option, party))
    return [tuple(table.id for table in option) for option in fitting]


def _every_option(tables: list[TableSpec]) -> list[list[TableSpec]]:
    """Every single table and every combination of up to MAX_COMBINED_TABLES."""
    ordered = sorted(tables, key=lambda table: table.id)
    options: list[list[TableSpec]] = [[table] for table in ordered]
    for count in range(2, MAX_COMBINED_TABLES + 1):
        options.extend(list(combo) for combo in combinations(ordered, count))
    return options


def largest_party(tables: list[TableSpec]) -> int:
    """The biggest party any table, or allowed combination of tables, can seat.

    A combination counts only if the hard rules accept it when it is full, so
    tables that may not be joined never add up to a party size nobody can book.
    Returns 0 for a restaurant without tables.
    """
    best = 0
    for option in _every_option(tables):
        seats = capacity(option)
        full = PartySpec(0, seats, 0, 1, False, 0, None, None)
        if seats > best and choice_problem(option, full) is None:
            best = seats
    return best


@dataclass
class Floor:
    """Who uses which table in which slot. Mutable, so the search can try moves.

    owner[(table id, slot)] = party id. Because a key can only exist once, two
    parties can never hold the same table in the same slot.
    """

    owner: dict[tuple[int, int], int] = field(default_factory=dict)
    placed: dict[int, tuple[PartySpec, tuple[int, ...]]] = field(default_factory=dict)

    def blockers(self, party: PartySpec, choice: tuple[int, ...]) -> set[int]:
        """Ids of other parties that occupy any of these tables during the party's time."""
        found: set[int] = set()
        for table_id in choice:
            for slot in party.slots():
                other = self.owner.get((table_id, slot))
                if other is not None and other != party.id:
                    found.add(other)
        return found

    def is_free(self, party: PartySpec, choice: tuple[int, ...]) -> bool:
        # Same test as "no blockers", but it stops at the first clash. The
        # search calls this millions of times, so stopping early matters.
        for table_id in choice:
            for slot in party.slots():
                other = self.owner.get((table_id, slot))
                if other is not None and other != party.id:
                    return False
        return True

    def place(self, party: PartySpec, choice: tuple[int, ...]) -> None:
        if not self.is_free(party, choice):
            raise ValueError(f"party {party.id} overlaps another party on {choice}")
        for table_id in choice:
            for slot in party.slots():
                self.owner[(table_id, slot)] = party.id
        self.placed[party.id] = (party, choice)

    def remove(self, party_id: int) -> None:
        party, choice = self.placed.pop(party_id)
        for table_id in choice:
            for slot in party.slots():
                del self.owner[(table_id, slot)]

    def assignment(self) -> Assignment:
        return {party_id: choice for party_id, (_, choice) in self.placed.items()}

    def busy(self) -> dict[int, set[int]]:
        """Table id -> taken slot indexes, the format recommend_table expects."""
        result: dict[int, set[int]] = {}
        for table_id, slot in self.owner:
            result.setdefault(table_id, set()).add(slot)
        return result

    def copy(self) -> Floor:
        return Floor(dict(self.owner), dict(self.placed))


def place_fixed(tables: list[TableSpec], parties: list[PartySpec]) -> Floor:
    """Start a floor with every fixed party on its own tables.

    A fixed choice that breaks a hard rule is a data error made before the
    optimiser ran (the booking endpoint should have refused it), so we stop with
    a clear message instead of silently seating someone elsewhere.
    """
    by_id = {table.id: table for table in tables}
    floor = Floor()
    for party in parties:
        if party.fixed_tables is None:
            continue
        missing = [table_id for table_id in party.fixed_tables if table_id not in by_id]
        if missing:
            raise ValueError(f"{party_name(party)} is fixed to unknown tables {missing}")
        chosen = [by_id[table_id] for table_id in party.fixed_tables]
        problem = choice_problem(chosen, party)
        if problem is not None:
            raise ValueError(f"fixed choice is invalid for {party_name(party)}: {problem}")
        floor.place(party, tuple(sorted(party.fixed_tables)))
    return floor


def score_plan(
    tables: list[TableSpec], parties: list[PartySpec], assignment: Assignment
) -> ScoreBreakdown:
    by_id = {table.id: table for table in tables}
    seated = [party for party in parties if party.id in assignment]
    waste = 0
    zone_hits = 0
    wish_hits = 0
    for party in seated:
        chosen = [by_id[table_id] for table_id in assignment[party.id]]
        waste += capacity(chosen) - party.size
        zone_hits += 1 if zone_met(chosen, party) else 0
        wish_hits += len(prefs_met(chosen, party))
    return ScoreBreakdown(
        covers_seated=sum(party.size for party in seated),
        covers_total=sum(party.size for party in parties),
        parties_seated=len(seated),
        parties_unseated=len(parties) - len(seated),
        wasted_seats=waste,
        zone_prefs_met=zone_hits,
        zone_prefs_wanted=sum(1 for party in parties if party.zone_pref is not None),
        prefs_met=wish_hits,
        prefs_wanted=sum(len(party.prefs) for party in parties),
    )


def _overlap_problems(parties: list[PartySpec], assignment: Assignment) -> list[str]:
    problems: list[str] = []
    seen: dict[tuple[int, int], int] = {}
    for party in parties:
        for table_id in assignment.get(party.id, ()):
            for slot in party.slots():
                other = seen.get((table_id, slot))
                if other is not None:
                    problems.append(
                        f"parties {other} and {party.id} share table {table_id} at slot {slot}"
                    )
                seen[(table_id, slot)] = party.id
    return problems


def check_hard(
    tables: list[TableSpec], parties: list[PartySpec], assignment: Assignment
) -> list[str]:
    """List every broken hard rule. An empty list means the plan is feasible."""
    by_id = {table.id: table for table in tables}
    party_ids = {party.id for party in parties}
    problems = [f"unknown party {pid}" for pid in assignment if pid not in party_ids]
    for party in parties:
        choice = assignment.get(party.id)
        if party.fixed_tables is not None and choice != tuple(sorted(party.fixed_tables)):
            problems.append(f"fixed party {party.id} was moved")
        if choice is None:
            continue
        if any(table_id not in by_id for table_id in choice):
            problems.append(f"party {party.id} is on an unknown table")
            continue
        problem = choice_problem([by_id[table_id] for table_id in choice], party)
        if problem is not None:
            problems.append(f"party {party.id}: {problem}")
    problems.extend(_overlap_problems(parties, assignment))
    return problems
