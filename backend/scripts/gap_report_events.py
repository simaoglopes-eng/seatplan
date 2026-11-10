"""Measure how far the events heuristic is from the proven optimum.

Builds seeded random small events, runs solve() (greedy + annealing) and
solve_exact(), and prints a Markdown table. Same seeds = same table, apart
from the timing columns, which depend on the machine.

Run from the backend folder:
    python -m scripts.gap_report_events
"""

import random
import time

from app.optimiser.events_anneal import solve
from app.optimiser.events_exact import solve_exact
from app.optimiser.events_model import EventProblem, GuestSpec, SeatSpec, Weights

# (number of guests, number of tables, seats per table) for each instance.
SIZES = [(6, 2, 4), (7, 2, 4), (8, 2, 5), (8, 3, 4), (9, 2, 5), (10, 3, 4), (10, 2, 6)]
SEEDS_PER_SIZE = 3


def random_problem(seed: int, guests: int, tables: int, per_table: int) -> EventProblem:
    """A small event with round tables, a few groups, friendships and one choice."""
    rng = random.Random(seed)
    seats, neighbours = round_tables(tables, per_table)
    seats[0] = SeatSpec(seats[0].id, seats[0].table_id, 0.0, 0.0, True, False, None)
    guest_list = []
    for guest_id in range(1, guests + 1):
        group = rng.choice([None, None, 1, 2])
        knows = frozenset(
            other for other in range(1, guests + 1) if other != guest_id and rng.random() < 0.2
        )
        needs_accessible = guest_id == 1  # exactly one accessible seat and one guest needing it
        guest_list.append(GuestSpec(guest_id, group, group == 1, needs_accessible, None, knows))
    fixed = {guests: seats[-1].id}  # the last guest already picked the last seat
    return EventProblem(tuple(seats), tuple(guest_list), neighbours, fixed, Weights())


def round_tables(tables: int, per_table: int) -> tuple[list[SeatSpec], dict[int, frozenset[int]]]:
    """Seats around round tables: each seat touches the one on its left and right."""
    seats: list[SeatSpec] = []
    neighbours: dict[int, frozenset[int]] = {}
    for table in range(tables):
        ids = [table * per_table + place + 1 for place in range(per_table)]
        for place, seat_id in enumerate(ids):
            seats.append(
                SeatSpec(seat_id, table + 1, float(place), float(table), False, False, None)
            )
            left = ids[place - 1]
            right = ids[(place + 1) % per_table]
            neighbours[seat_id] = frozenset({left, right} - {seat_id})
    return seats, neighbours


def report_row(seed: int, guests: int, tables: int, per_table: int) -> str:
    problem = random_problem(seed, guests, tables, per_table)
    started = time.monotonic()
    heuristic = solve(problem, seed=seed, max_iterations=20000)
    heuristic_seconds = time.monotonic() - started
    exact = solve_exact(problem, time_limit_s=60.0)
    # Run the pure-Python engine too, to show both exact engines agree.
    backup = solve_exact(problem, time_limit_s=60.0, engine="branch-and-bound")
    best = exact.score.total
    gap = 0.0 if best == 0 else 100 * (best - heuristic.score.total) / best
    seated = f"{len(heuristic.assignment)}/{exact.seated}"
    proven = "yes" if exact.proven_optimal and backup.proven_optimal else "no"
    return (
        f"| {guests} | {tables} x {per_table} | {seed} | {seated} | {heuristic.score.total:g} "
        f"| {best:g} | {backup.score.total:g} | {gap:.1f} | {heuristic_seconds:.2f} "
        f"| {exact.seconds:.2f} ({exact.engine}) | {backup.seconds:.2f} | {proven} |"
    )


def main() -> None:
    print(
        "| Guests | Tables x seats | Seed | Seated heur/opt | Heuristic score | Optimal score "
        "| B&B score | Gap % | Heuristic s | Exact s (engine) | B&B s | Proven |"
    )
    print("|---|---|---|---|---|---|---|---|---|---|---|---|")
    for guests, tables, per_table in SIZES:
        for seed in range(SEEDS_PER_SIZE):
            print(report_row(seed, guests, tables, per_table))


if __name__ == "__main__":
    main()
