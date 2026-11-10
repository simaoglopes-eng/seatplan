"""Greedy construction: a good feasible plan in one pass.

Idea: seat the hardest guests first (they have the fewest good options), and put
each guest on the free seat that adds the most points right now. Annealing
improves this plan afterwards.
"""

import random
from collections import Counter

from app.optimiser.events_model import Assignment, EventProblem, GuestSpec, seat_allows
from app.optimiser.events_score import ScoreContext, make_context, placement_gain


def greedy(problem: EventProblem, seed: int) -> Assignment:
    """Contract entry point: fixed guests first, then everyone else."""
    rng = random.Random(seed)
    context = make_context(problem)
    return complete_greedily(context, dict(problem.fixed), rng)


def complete_greedily(context: ScoreContext, start: Assignment, rng: random.Random) -> Assignment:
    """Seat every guest missing from `start`.

    Replan reuses this to fill only the gaps around kept seats. Guests already
    seated keep their seat, unless moving one of them (never a fixed one) to an
    empty seat is the only way to seat someone (see make_room). A guest with no
    feasible seat even then is left out (reported as unseated, never forced).
    """
    assignment = dict(start)
    for guest in placement_order(context.problem, assignment, rng):
        seat_id = best_seat(context, assignment, guest, rng)
        if seat_id is None:
            seat_id = make_room(context, assignment, guest)
        if seat_id is not None:
            assignment[guest.id] = seat_id
    return assignment


def placement_order(
    problem: EventProblem, assignment: Assignment, rng: random.Random
) -> list[GuestSpec]:
    """Most constrained first: reserved tag, then accessibility, then big groups."""
    waiting = sorted(
        (guest for guest in problem.guests if guest.id not in assignment),
        key=lambda guest: guest.id,
    )
    # Shuffle first, then a STABLE sort: guests with equal priority end up in a
    # seeded random order, and the same seed always gives the same order.
    rng.shuffle(waiting)
    group_sizes = Counter(guest.group_id for guest in problem.guests if guest.group_id is not None)

    def priority(guest: GuestSpec) -> tuple[bool, bool, int, int]:
        size = group_sizes[guest.group_id] if guest.group_id is not None else 1
        # The group id keeps members of one group next to each other in the
        # queue, so the second member can already sit beside the first.
        group_key = guest.group_id if guest.group_id is not None else -1
        return (
            guest.reserved_tag is None,
            not guest.needs_accessible,
            -size,
            group_key,
        )

    return sorted(waiting, key=priority)


def best_seat(
    context: ScoreContext, assignment: Assignment, guest: GuestSpec, rng: random.Random
) -> int | None:
    candidates = free_allowed_seats(context, assignment, guest)
    if guest.reserved_tag is not None:
        # A reserved seat can only ever hold a tagged guest, so a tagged guest
        # on a general seat wastes capacity. Prefer their own reserved seats.
        own_seats = [s for s in candidates if context.seats[s].reserved_tag == guest.reserved_tag]
        if own_seats:
            candidates = own_seats
    if not guest.needs_accessible:
        # Accessible seats are scarce and someone placed later may need one, so
        # a guest without that need only takes one when nothing else is free.
        ordinary = [s for s in candidates if not context.seats[s].accessible]
        if ordinary:
            candidates = ordinary
    if not candidates:
        return None
    gains = {
        seat_id: placement_gain(context, assignment, guest.id, seat_id) for seat_id in candidates
    }
    best_gain = max(gains.values())
    best = [seat_id for seat_id in candidates if gains[seat_id] == best_gain]
    return rng.choice(best)


def free_allowed_seats(
    context: ScoreContext, assignment: Assignment, guest: GuestSpec
) -> list[int]:
    """Free seats this guest may take, sorted so random tie-breaks repeat."""
    taken = set(assignment.values())
    return [
        seat.id
        for seat in sorted(context.problem.seats, key=lambda seat: seat.id)
        if seat.id not in taken and seat_allows(seat, guest)
    ]


def make_room(context: ScoreContext, assignment: Assignment, guest: GuestSpec) -> int | None:
    """Free a seat for `guest` by moving one other (non-fixed) guest to an empty seat.

    Returns the freed seat id, or None when no single move helps. This catches
    the case greedy and annealing cannot repair on their own: annealing only
    moves guests who already have a seat, so an unseated guest is never retried.
    Seats are tried in id order, so the same input always gives the same result.
    """
    owner_of = {seat_id: guest_id for guest_id, seat_id in assignment.items()}
    for seat in sorted(context.problem.seats, key=lambda seat: seat.id):
        other_id = owner_of.get(seat.id)
        if other_id is None or other_id in context.problem.fixed:
            continue
        if not seat_allows(seat, guest):
            continue
        empty = free_allowed_seats(context, assignment, context.guests[other_id])
        if empty:
            assignment[other_id] = empty[0]
            return seat.id
    return None
