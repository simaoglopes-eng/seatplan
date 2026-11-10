"""Seat recommendations for one attendee, with reasons in plain language.

Privacy rule: the reasons only talk about people the guest listed THEMSELVES
in `knows`, plus their own group. If someone else listed this guest, that pair
still counts in the gain (the objective treats "knows" as mutual), but it is
never named or counted in a reason, because that would reveal who listed whom.
"""

from app.optimiser.events_greedy import free_allowed_seats
from app.optimiser.events_model import (
    Assignment,
    EventProblem,
    GuestSpec,
    Recommendation,
    are_adjacent,
)
from app.optimiser.events_score import ScoreContext, make_context, placement_gain


def recommend(
    problem: EventProblem, current: Assignment, guest_id: int, top: int = 5
) -> list[Recommendation]:
    """Best free feasible seats for this guest, highest gain first.

    The guest's own current seat (if any) counts as free for them, since they
    could simply keep it. Ties are broken by seat id so the list is stable.
    """
    context = make_context(problem)
    guest = context.guests[guest_id]
    others = {g: s for g, s in current.items() if g != guest_id}
    options = []
    for seat_id in free_allowed_seats(context, others, guest):
        gain = placement_gain(context, others, guest_id, seat_id)
        options.append((-gain, seat_id))
    options.sort()
    return [
        build_recommendation(context, others, guest, seat_id, -negative_gain)
        for negative_gain, seat_id in options[:top]
    ]


def build_recommendation(
    context: ScoreContext,
    others: Assignment,
    guest: GuestSpec,
    seat_id: int,
    gain: float,
) -> Recommendation:
    adjacent_known, table_known = known_people_near(context, others, guest, seat_id)
    adjacent_group, table_group = group_members_near(context, others, guest, seat_id)
    reasons: list[str] = []
    if adjacent_known:
        reasons.append(f"Next to {people(len(adjacent_known))} you know")
    if table_known:
        reasons.append(f"Same table as {people(len(table_known))} you know")
    if adjacent_group:
        reasons.append("Next to someone from your group")
    elif table_group:
        reasons.append("Same table as your group")
    seat = context.seats[seat_id]
    if seat.accessible:
        reasons.append("Accessible seat")
    if seat.reserved_tag is not None:
        reasons.append(f"Reserved for {seat.reserved_tag} guests like you")
    known_nearby = tuple(sorted(adjacent_known + table_known))
    return Recommendation(seat_id, gain, tuple(reasons), known_nearby)


def known_people_near(
    context: ScoreContext, others: Assignment, guest: GuestSpec, seat_id: int
) -> tuple[list[int], list[int]]:
    """(next to the seat, elsewhere at the same table), from guest.knows only."""
    adjacent: list[int] = []
    same_table: list[int] = []
    for known_id in sorted(guest.knows):
        where = classify(context, others, seat_id, known_id)
        if where == "adjacent":
            adjacent.append(known_id)
        elif where == "table":
            same_table.append(known_id)
    return adjacent, same_table


def group_members_near(
    context: ScoreContext, others: Assignment, guest: GuestSpec, seat_id: int
) -> tuple[int, int]:
    """How many of the guest's own group sit next to / at the table of this seat."""
    adjacent = 0
    same_table = 0
    if guest.group_id is None:
        return adjacent, same_table
    for other in context.problem.guests:
        if other.id == guest.id or other.group_id != guest.group_id:
            continue
        where = classify(context, others, seat_id, other.id)
        if where == "adjacent":
            adjacent += 1
        elif where == "table":
            same_table += 1
    return adjacent, same_table


def classify(context: ScoreContext, others: Assignment, seat_id: int, other_id: int) -> str:
    """'adjacent', 'table' (same table, not adjacent) or 'away' for another guest."""
    other_seat = others.get(other_id)
    if other_seat is None:
        return "away"
    if are_adjacent(context.problem, seat_id, other_seat):
        return "adjacent"
    if context.seats[other_seat].table_id == context.seats[seat_id].table_id:
        return "table"
    return "away"


def people(count: int) -> str:
    return "1 person" if count == 1 else f"{count} people"
