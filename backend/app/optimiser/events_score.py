"""The objective: how good is a seating plan?

Only PAIRS of guests matter. A pair earns points when the two people know each
other or share a group, and they sit next to each other or at the same table.
We list those pairs once (a "Relation") and every scoring function walks that
list, so the full score, the greedy gain and the annealing delta all use the
same rule and cannot disagree.
"""

from dataclasses import dataclass

from app.optimiser.events_model import (
    Assignment,
    EventProblem,
    GuestSpec,
    ScoreBreakdown,
    SeatSpec,
    Weights,
    are_adjacent,
    guests_by_id,
    seats_by_id,
)


@dataclass(frozen=True)
class Relation:
    """A pair of guests the objective cares about, stored once (guest_a < guest_b)."""

    guest_a: int
    guest_b: int
    acquainted: bool  # true if EITHER guest listed the other: we treat it as mutual
    same_group: bool
    keep_adjacent: bool  # the group asked to sit side by side


@dataclass(frozen=True)
class PairPoints:
    friend_adjacent: float
    friend_same_table: float
    group_adjacent: float
    group_same_table: float

    def total(self) -> float:
        return (
            self.friend_adjacent
            + self.friend_same_table
            + self.group_adjacent
            + self.group_same_table
        )


@dataclass(frozen=True)
class ScoreContext:
    """Lookups built once per problem so the search loops stay fast."""

    problem: EventProblem
    seats: dict[int, SeatSpec]
    guests: dict[int, GuestSpec]
    relations: tuple[Relation, ...]
    relations_of: dict[int, tuple[Relation, ...]]


def build_relations(problem: EventProblem) -> tuple[Relation, ...]:
    guests = sorted(problem.guests, key=lambda guest: guest.id)
    relations: list[Relation] = []
    for index, first in enumerate(guests):
        for second in guests[index + 1 :]:
            acquainted = second.id in first.knows or first.id in second.knows
            same_group = first.group_id is not None and first.group_id == second.group_id
            if not acquainted and not same_group:
                continue
            keep_adjacent = same_group and first.keep_adjacent and second.keep_adjacent
            relations.append(Relation(first.id, second.id, acquainted, same_group, keep_adjacent))
    return tuple(relations)


def make_context(problem: EventProblem) -> ScoreContext:
    relations = build_relations(problem)
    grouped: dict[int, list[Relation]] = {guest.id: [] for guest in problem.guests}
    for relation in relations:
        grouped[relation.guest_a].append(relation)
        grouped[relation.guest_b].append(relation)
    relations_of = {guest_id: tuple(items) for guest_id, items in grouped.items()}
    return ScoreContext(
        problem, seats_by_id(problem), guests_by_id(problem), relations, relations_of
    )


def pair_points(context: ScoreContext, relation: Relation, seat_a: int, seat_b: int) -> PairPoints:
    """Points one pair earns when its two guests sit on seat_a and seat_b."""
    weights = context.problem.weights
    adjacent = are_adjacent(context.problem, seat_a, seat_b)
    same_table = context.seats[seat_a].table_id == context.seats[seat_b].table_id
    # The terms are independent on purpose: two friends side by side at one
    # table earn both "adjacent" and "same table" points.
    return PairPoints(
        friend_adjacent=weights.friend_adjacent if relation.acquainted and adjacent else 0,
        friend_same_table=weights.friend_same_table if relation.acquainted and same_table else 0,
        group_adjacent=weights.group_adjacent if relation.keep_adjacent and adjacent else 0,
        group_same_table=weights.group_same_table if relation.same_group and same_table else 0,
    )


def adjacent_points(weights: Weights, relation: Relation) -> float:
    """Points a pair earns for sitting side by side."""
    points = 0.0
    if relation.acquainted:
        points += weights.friend_adjacent
    if relation.keep_adjacent:
        points += weights.group_adjacent
    return points


def table_points(weights: Weights, relation: Relation) -> float:
    """Points a pair earns for sitting at the same table."""
    points = 0.0
    if relation.acquainted:
        points += weights.friend_same_table
    if relation.same_group:
        points += weights.group_same_table
    return points


def best_pair_value(context: ScoreContext, relation: Relation) -> float:
    """The most a pair could ever earn (used as an optimistic bound)."""
    weights = context.problem.weights
    return adjacent_points(weights, relation) + table_points(weights, relation)


def other_guest(relation: Relation, guest_id: int) -> int:
    return relation.guest_b if relation.guest_a == guest_id else relation.guest_a


def moved_guests(problem: EventProblem, assignment: Assignment, previous: Assignment) -> list[int]:
    """Guests who had a seat in `previous` and now sit elsewhere or nowhere."""
    still_invited = {guest.id for guest in problem.guests}
    moved = []
    for guest_id, old_seat in sorted(previous.items()):
        if guest_id in still_invited and assignment.get(guest_id) != old_seat:
            moved.append(guest_id)
    return moved


def score(
    problem: EventProblem,
    assignment: Assignment,
    previous: Assignment | None = None,
) -> ScoreBreakdown:
    """Full rescore from scratch. Slow but obviously correct: the reference."""
    return score_with_context(make_context(problem), assignment, previous)


def score_with_context(
    context: ScoreContext,
    assignment: Assignment,
    previous: Assignment | None = None,
) -> ScoreBreakdown:
    sums = [0.0, 0.0, 0.0, 0.0]
    for relation in context.relations:
        if relation.guest_a not in assignment or relation.guest_b not in assignment:
            continue
        points = pair_points(
            context,
            relation,
            assignment[relation.guest_a],
            assignment[relation.guest_b],
        )
        sums[0] += points.friend_adjacent
        sums[1] += points.friend_same_table
        sums[2] += points.group_adjacent
        sums[3] += points.group_same_table
    changes = 0.0
    if previous is not None:
        moved = moved_guests(context.problem, assignment, previous)
        changes = -context.problem.weights.change_penalty * len(moved)
    return ScoreBreakdown(
        total=sum(sums) + changes,
        friend_adjacent=sums[0],
        friend_same_table=sums[1],
        group_adjacent=sums[2],
        group_same_table=sums[3],
        changes=changes,
    )


def placement_gain(
    context: ScoreContext, assignment: Assignment, guest_id: int, seat_id: int
) -> float:
    """Pair points the guest would add by sitting on seat_id, given who is seated.

    The guest must not be in `assignment` yet.
    """
    gain = 0.0
    for relation in context.relations_of.get(guest_id, ()):
        partner = other_guest(relation, guest_id)
        if partner in assignment:
            gain += pair_points(context, relation, seat_id, assignment[partner]).total()
    return gain


def touching_value(context: ScoreContext, assignment: Assignment, guest_ids: list[int]) -> float:
    """Pair points of every pair that involves at least one of guest_ids.

    Annealing calls this before and after a move: the difference is the exact
    change in the total, because pairs that do not touch a moved guest are
    unchanged. A pair between two moved guests is counted once, not twice.
    """
    counted: set[tuple[int, int]] = set()
    value = 0.0
    for guest_id in guest_ids:
        for relation in context.relations_of.get(guest_id, ()):
            key = (relation.guest_a, relation.guest_b)
            if key in counted:
                continue
            counted.add(key)
            if relation.guest_a in assignment and relation.guest_b in assignment:
                seat_a = assignment[relation.guest_a]
                seat_b = assignment[relation.guest_b]
                value += pair_points(context, relation, seat_a, seat_b).total()
    return value
