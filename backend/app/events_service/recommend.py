"""Seat recommendations for one attendee.

Everyone else's confirmed seat is "fixed" (we may not move other people), and
seats someone else is holding are treated as blocked for this question. The
optimiser returns ids only; names are added here, and only for people the
attendee marked as known themselves, always through core/privacy.py.

Privacy: the planner treats "knows" as mutual, but here we first forget that
OTHER guests listed this attendee. Otherwise the seats next to whoever listed
them would rise to the top and give that person away. For the same reason we
return a rank and a coarse label, never the raw gain number.
"""

from dataclasses import replace
from typing import Any

from sqlalchemy.orm import Session

from app.core.privacy import display_name
from app.events_service.problem import active_guests, build_problem, current_rows, venue_seats
from app.events_service.seatmap import holder_key, known_ids, live_holds
from app.models import Event, Guest, Seat, VenueTable
from app.optimiser.events_model import EventProblem, Recommendation
from app.optimiser.events_recommend import recommend

TOP = 5


def recommendations(session: Session, event: Event, me: Guest) -> list[dict[str, Any]]:
    guests = active_guests(session, event)
    if me.id not in {guest.id for guest in guests}:
        guests.append(me)  # someone who answered "no" may still look around
    rows = current_rows(session, event)
    others = {g: row.seat_id for g, row in rows.items() if g != me.id}
    held_by_others = frozenset(
        seat_id
        for seat_id, holder in live_holds(session, event).items()
        if holder != holder_key(me)
    )
    seats = venue_seats(session, event.venue_id)
    guest_ids = {guest.id for guest in guests}
    fixed = {g: s for g, s in others.items() if g in guest_ids}
    problem = build_problem(session, seats, guests, fixed, extra_blocked=held_by_others)
    problem = only_my_own_list(problem, me.id)
    picks = recommend(problem, fixed, me.id, top=TOP)
    strong = problem.weights.friend_adjacent
    return [
        {**_describe(session, event, me, seats, pick), "rank": rank, "match": match(pick, strong)}
        for rank, pick in enumerate(picks, start=1)
    ]


def only_my_own_list(problem: EventProblem, me_id: int) -> EventProblem:
    """The same problem, minus every other guest's "I know them" mark on me."""
    guests = tuple(replace(guest, knows=guest.knows - {me_id}) for guest in problem.guests)
    return replace(problem, guests=guests)


def match(pick: Recommendation, strong: float) -> str:
    """A coarse label instead of the gain: "strong", "some" or "none".

    "strong" means at least as good as sitting next to one person you know.
    """
    if pick.gain >= strong:
        return "strong"
    return "some" if pick.gain > 0 else "none"


def _describe(
    session: Session, event: Event, me: Guest, seats: list[Seat], pick: Recommendation
) -> dict[str, Any]:
    seat = next(seat for seat in seats if seat.id == pick.seat_id)
    table = session.get(VenueTable, seat.table_id)
    mine = known_ids(session, me)
    known = []
    for guest_id in pick.known_nearby:
        other = session.get(Guest, guest_id)
        # known_nearby already comes from my own list; the check is a second lock.
        if other is not None and guest_id in mine:
            name = display_name(other.name, event.privacy_mode, other.wants_anonymous)
            known.append({"guest_id": guest_id, "name": name})
    return {
        "seat_id": seat.id,
        "seat_label": seat.label,
        "table_label": table.label if table else None,
        "reasons": list(pick.reasons),
        "known_nearby": known,
    }
