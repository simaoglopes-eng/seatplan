"""Data shapes for the events seating optimiser.

Everything here is a plain frozen dataclass so that the routers can build a
problem from database rows and the optimiser can never change it by accident.
No database and no FastAPI imports live in this package (contract, section 6).
"""

from collections.abc import Mapping
from dataclasses import dataclass

# guest id -> seat id. A guest missing from the dict is not seated.
Assignment = dict[int, int]


@dataclass(frozen=True)
class SeatSpec:
    id: int
    table_id: int
    x: float
    y: float
    accessible: bool
    blocked: bool
    reserved_tag: str | None


@dataclass(frozen=True)
class GuestSpec:
    id: int
    group_id: int | None
    keep_adjacent: bool
    needs_accessible: bool
    reserved_tag: str | None
    knows: frozenset[int]


@dataclass(frozen=True)
class Weights:
    friend_adjacent: float = 10
    friend_same_table: float = 4
    group_adjacent: float = 15
    group_same_table: float = 6
    change_penalty: float = 8


@dataclass(frozen=True)
class EventProblem:
    seats: tuple[SeatSpec, ...]
    guests: tuple[GuestSpec, ...]
    neighbours: Mapping[int, frozenset[int]]  # seat id -> adjacent seat ids
    fixed: Mapping[int, int]  # guest id -> seat id; human choices, never moved
    weights: Weights


@dataclass(frozen=True)
class ScoreBreakdown:
    """The objective split into its terms, so the UI can explain a plan.

    Every field is already in points (count times weight). `changes` is zero or
    negative: it is the replan penalty for guests who moved.
    """

    total: float
    friend_adjacent: float
    friend_same_table: float
    group_adjacent: float
    group_same_table: float
    changes: float


@dataclass(frozen=True)
class SolveResult:
    assignment: Assignment
    score: ScoreBreakdown
    iterations: int
    seed: int
    unseated: tuple[int, ...]  # guests the search could not place
    moved: tuple[int, ...] = ()  # replan only: guests whose seat changed


@dataclass(frozen=True)
class Recommendation:
    seat_id: int
    gain: float
    reasons: tuple[str, ...]
    # Ids of people from the guest's OWN "knows" list who sit next to or at the
    # same table as this seat. Ids only: the API layer adds names.
    known_nearby: tuple[int, ...]


@dataclass(frozen=True)
class ExactResult:
    assignment: Assignment
    score: ScoreBreakdown
    seated: int
    engine: str  # "cp-sat" or "branch-and-bound"
    proven_optimal: bool
    seconds: float


def seats_by_id(problem: EventProblem) -> dict[int, SeatSpec]:
    return {seat.id: seat for seat in problem.seats}


def guests_by_id(problem: EventProblem) -> dict[int, GuestSpec]:
    return {guest.id: guest for guest in problem.guests}


def seat_allows(seat: SeatSpec, guest: GuestSpec) -> bool:
    """True when the per-seat hard rules let this guest sit on this seat.

    "One guest per seat" and "fixed pairs" depend on the whole assignment, so
    they are checked elsewhere (check_hard and the search moves).
    """
    if seat.blocked:
        return False
    if seat.reserved_tag is not None and seat.reserved_tag != guest.reserved_tag:
        return False
    # An accessible seat suits everyone; any other seat only suits guests
    # who do not need one.
    return seat.accessible or not guest.needs_accessible


def are_adjacent(problem: EventProblem, seat_a: int, seat_b: int) -> bool:
    # Checked in both directions so a half-filled neighbour map still works.
    if seat_b in problem.neighbours.get(seat_a, frozenset()):
        return True
    return seat_a in problem.neighbours.get(seat_b, frozenset())


def check_hard(problem: EventProblem, assignment: Assignment) -> list[str]:
    """List every broken hard rule in plain English. Empty list = feasible.

    A guest who is simply not seated is not a violation: running out of seats
    is reported as "unseated" by the solvers, never forced.
    """
    seats = seats_by_id(problem)
    guests = guests_by_id(problem)
    problems: list[str] = []
    seat_owner: dict[int, int] = {}
    for guest_id, seat_id in sorted(assignment.items()):
        guest = guests.get(guest_id)
        seat = seats.get(seat_id)
        if guest is None:
            problems.append(f"Guest {guest_id} is not part of this event.")
            continue
        if seat is None:
            problems.append(f"Seat {seat_id} (guest {guest_id}) does not exist.")
            continue
        if seat_id in seat_owner:
            problems.append(
                f"Seat {seat_id} is given to both guest {seat_owner[seat_id]} and guest {guest_id}."
            )
        seat_owner[seat_id] = guest_id
        problems.extend(_seat_rule_problems(seat, guest))
    for guest_id, seat_id in sorted(problem.fixed.items()):
        if assignment.get(guest_id) != seat_id:
            problems.append(f"Guest {guest_id} chose seat {seat_id} and must stay there.")
    return problems


def _seat_rule_problems(seat: SeatSpec, guest: GuestSpec) -> list[str]:
    # Same three rules as seat_allows, but each one explained separately.
    found: list[str] = []
    if seat.blocked:
        found.append(f"Seat {seat.id} is blocked but guest {guest.id} sits on it.")
    if seat.reserved_tag is not None and seat.reserved_tag != guest.reserved_tag:
        found.append(
            f"Seat {seat.id} is reserved for '{seat.reserved_tag}' guests; "
            f"guest {guest.id} does not have that tag."
        )
    if guest.needs_accessible and not seat.accessible:
        found.append(f"Guest {guest.id} needs an accessible seat; seat {seat.id} is not.")
    return found
