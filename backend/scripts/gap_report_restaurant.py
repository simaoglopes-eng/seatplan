"""Measure how far the restaurant heuristic is from the proven optimum.

Builds seeded random services, runs assign_service() (greedy + local search),
CP-SAT (when OR-tools is installed) and the pure-Python branch and bound, and
prints Markdown tables. Same seeds = same tables, apart from the timing
columns, which depend on the machine.

Run from the backend folder:
    python -m scripts.gap_report_restaurant
"""

import random
import time

from app.optimiser import restaurant_exact
from app.optimiser.restaurant_assign import assign_service
from app.optimiser.restaurant_exact import (
    solve_with_branch_and_bound,
    solve_with_cp_sat,
)
from app.optimiser.restaurant_model import (
    ExactPlan,
    PartySpec,
    TableSpec,
    candidate_choices,
)

# (number of tables, number of parties) for the small instances.
SMALL_SIZES = [(4, 6), (5, 7), (6, 8), (6, 10), (8, 12)]
# Demo-sized services: too big for branch and bound, CP-SAT only.
LARGE_SIZES = [(12, 30), (20, 60)]
SEEDS_PER_SIZE = 4
HEURISTIC_ITERATIONS = 5000
EXACT_TIME_LIMIT_S = 60.0

CAPACITIES = [2, 2, 4, 4, 6, 8]
ZONES = ["window", "main", "terrace"]
PARTY_SIZES = [2, 2, 2, 3, 4, 4, 5, 6, 7, 8]


def make_tables(count: int) -> list[TableSpec]:
    """A repeating floor: 2-tops and 4-tops can be joined, 6 and 8 cannot."""
    tables = []
    for i in range(count):
        size = CAPACITIES[i % len(CAPACITIES)]
        group = "A" if size <= 4 else None
        tables.append(
            TableSpec(i + 1, 1, size, ZONES[i % len(ZONES)], i % 3 != 0, i % 2 == 0, group)
        )
    return tables


def stay_slots(size: int) -> int:
    """Turn time in 15-minute slots: bigger parties stay longer."""
    if size <= 2:
        return 6
    if size <= 4:
        return 8
    return 10


def make_parties(rng: random.Random, tables: list[TableSpec], count: int) -> list[PartySpec]:
    parties = []
    for party_id in range(1, count + 1):
        size = rng.choice(PARTY_SIZES)
        start = rng.randint(0, 12)
        parties.append(
            PartySpec(
                party_id,
                size,
                start,
                start + stay_slots(size),
                rng.random() < 0.15,
                1 if rng.random() < 0.2 else 0,
                rng.choice([None, None, "window", "terrace"]),
                None,
            )
        )
    # The first party booked a specific table itself: it must never move.
    first = parties[0]
    options = candidate_choices(tables, first)
    if options:
        parties[0] = PartySpec(**{**first.__dict__, "fixed_tables": options[0]})
    return parties


def describe(plan_key: tuple[int, int, int]) -> str:
    covers, minus_waste, zones = plan_key
    return f"{covers} / {-minus_waste} / {zones}"


def gap_percent(heuristic_covers: int, best_covers: int) -> float:
    return 0.0 if best_covers == 0 else 100 * (best_covers - heuristic_covers) / best_covers


def exact_plans(
    tables: list[TableSpec], parties: list[PartySpec], with_bnb: bool
) -> list[ExactPlan]:
    plans = []
    if restaurant_exact.cp_model is not None:
        plans.append(solve_with_cp_sat(tables, parties, EXACT_TIME_LIMIT_S))
    if with_bnb:
        plans.append(solve_with_branch_and_bound(tables, parties, EXACT_TIME_LIMIT_S))
    return plans


def report_row(seed: int, table_count: int, party_count: int, with_bnb: bool) -> str:
    rng = random.Random(seed)
    tables = make_tables(table_count)
    parties = make_parties(rng, tables, party_count)
    started = time.monotonic()
    heuristic = assign_service(tables, parties, seed=seed, max_iterations=HEURISTIC_ITERATIONS)
    heuristic_seconds = time.monotonic() - started
    plans = exact_plans(tables, parties, with_bnb)
    best = max(plans, key=lambda plan: plan.score.key())
    agree = "yes" if len({plan.score.key() for plan in plans}) == 1 else "NO"
    proven = "yes" if all(plan.proven_optimal for plan in plans) else "no"
    timings = ", ".join(f"{plan.method} {plan.seconds:.2f}" for plan in plans)
    same = "yes" if heuristic.score.key() == best.score.key() else "no"
    gap = gap_percent(heuristic.score.covers_seated, best.score.covers_seated)
    return (
        f"| {table_count} | {party_count} | {seed} | {heuristic.score.covers_total} "
        f"| {describe(heuristic.score.key())} | {describe(best.score.key())} "
        f"| {gap:.1f} | {same} | {heuristic_seconds:.2f} | {timings} | {agree} | {proven} |"
    )


def print_table(title: str, sizes: list[tuple[int, int]], with_bnb: bool) -> None:
    print(f"\n{title}\n")
    print(
        "| Tables | Parties | Seed | Covers wanted | Heuristic covers / waste / zones "
        "| Optimal covers / waste / zones | Covers gap % | Heuristic optimal | Heuristic s "
        "| Exact s | Exact agree | Proven |"
    )
    print("|---|---|---|---|---|---|---|---|---|---|---|---|")
    for table_count, party_count in sizes:
        for seed in range(SEEDS_PER_SIZE):
            print(report_row(seed, table_count, party_count, with_bnb))


def main() -> None:
    print(f"OR-tools available: {restaurant_exact.cp_model is not None}")
    print_table("Small services (CP-SAT and branch and bound)", SMALL_SIZES, with_bnb=True)
    if restaurant_exact.cp_model is not None:
        print_table("Demo-sized services (CP-SAT only)", LARGE_SIZES, with_bnb=False)


if __name__ == "__main__":
    main()
