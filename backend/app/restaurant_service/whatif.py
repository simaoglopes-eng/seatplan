"""What-if for a walk-in: where would this party go, and who would have to move?

We describe tonight as the optimiser sees it (one PartySpec per active booking,
the current tables as the plan) and call whatif_walkin. Nothing is written:
the answer is advice for the staff member, who then decides.

A booking is fixed (never moved) when the diner chose the table themselves,
or when the party is already sitting there.
"""

from datetime import date, time
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models import Booking, Venue
from app.optimiser.restaurant_assign import whatif_walkin
from app.optimiser.restaurant_model import PartySpec, ServicePlan, score_plan
from app.restaurant_service import booking_rows, occupancy, schedule
from app.restaurant_service.availability import PartyNeeds, table_specs_for
from app.restaurant_service.clock import booking_window


def _party_of(venue: Venue, booking: Booking, tables: tuple[int, ...]) -> PartySpec:
    start, end = booking_window(venue, booking)
    fixed = booking.table_choice == "chosen" or booking.status in ("seated", "finishing")
    return PartySpec(
        id=booking.id,
        size=booking.party_size,
        start_slot=start,
        end_slot=end,
        needs_accessible=booking.needs_accessible,
        high_chairs=booking.high_chairs,
        zone_pref=None,
        fixed_tables=tables if fixed else None,
        # The reasons staff read name the party, never its database id.
        label=booking.name,
    )


def tonight(
    session: Session, venue: Venue, day: date
) -> tuple[list[PartySpec], dict[int, tuple[int, ...]], dict[int, Booking]]:
    """Parties, their current tables, and the bookings by id."""
    parties: list[PartySpec] = []
    plan: dict[int, tuple[int, ...]] = {}
    by_id: dict[int, Booking] = {}
    for booking in occupancy.active_bookings(session, venue, day):
        tables = occupancy.tables_of(session, booking)
        if not tables:
            continue
        parties.append(_party_of(venue, booking, tables))
        plan[booking.id] = tables
        by_id[booking.id] = booking
    return parties, plan, by_id


def walkin_whatif(
    session: Session, venue: Venue, day: date, at: time, needs: PartyNeeds
) -> dict[str, Any]:
    """POST /staff/{vid}/whatif: best table for the walk-in and what it displaces."""
    specs = table_specs_for(session, venue)
    parties, assignments, by_id = tonight(session, venue, day)
    plan = ServicePlan(
        assignments=assignments,
        unseated=(),
        score=score_plan(specs, parties, assignments),
        iterations=0,
    )
    window = schedule.window_for(at, schedule.turn_minutes(session, venue, needs.size))
    try:
        answer = whatif_walkin(specs, parties, plan, needs.spec(window))
    except ValueError as problem:
        # The optimiser refuses a fixed party that already breaks a rule, for
        # example when the layout changed under a seated booking. Staff get a
        # clear 409 instead of a server error.
        raise ApiError(
            409, "conflict", f"The planner cannot use tonight's plan: {problem}"
        ) from None
    table_ids = answer.table_ids or ()
    displaced = [
        {
            "booking_id": by_id[move.party_id].public_id,
            "name": by_id[move.party_id].name,
            "party_size": by_id[move.party_id].party_size,
            "from_tables": booking_rows.table_labels(session, move.from_tables),
            "to_tables": booking_rows.table_labels(session, move.to_tables),
        }
        for move in answer.displaced
    ]
    return {
        "possible": answer.table_ids is not None,
        "table_ids": list(table_ids),
        "tables": booking_rows.table_labels(session, table_ids),
        "displaced": displaced,
        "reasons": list(answer.reasons),
    }
