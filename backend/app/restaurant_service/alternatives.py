"""What to offer when the wanted table or time is gone: the 409 answer.

The contract's error shape is {"error": {"code", "message"}}. We keep that
shape and add one extra key inside it, "alternatives", so a client that only
reads code and message still works.
"""

from datetime import date, time
from typing import Any

from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.models import Venue
from app.optimiser.restaurant_assign import recommend_table
from app.restaurant_service import occupancy, schedule
from app.restaurant_service.availability import PartyNeeds, slot_statuses, table_specs_for
from app.restaurant_service.clock import hhmm

HOW_MANY = 3


def _minutes(text: str) -> int:
    hours, minutes = text.split(":")
    return int(hours) * 60 + int(minutes)


def nearest_times(
    session: Session, venue: Venue, day: date, at: time, needs: PartyNeeds
) -> list[str]:
    """Bookable times on the same date, closest to the wanted time first."""
    wanted = at.hour * 60 + at.minute
    open_times = [
        slot["time"]
        for slot in slot_statuses(session, venue, day, needs)
        if slot["status"] != "full" and slot["time"] != hhmm(at)
    ]
    open_times.sort(key=lambda text: (abs(_minutes(text) - wanted), text))
    return open_times[:HOW_MANY]


def free_tables(
    session: Session, venue: Venue, day: date, at: time, needs: PartyNeeds
) -> list[dict[str, Any]]:
    """Other tables (or combinations) still free at the wanted time."""
    window = schedule.window_for(at, schedule.turn_minutes(session, venue, needs.size))
    busy = occupancy.merge(
        occupancy.booked_slots(session, venue, day), occupancy.held_slots(session, venue, day)
    )
    labels = {table.id: table.label for table in occupancy.venue_tables(session, venue)}
    specs = table_specs_for(session, venue, needs, day, at)
    choices = recommend_table(specs, busy, needs.spec(window), HOW_MANY)
    return [
        {
            "table_ids": list(choice.table_ids),
            "labels": [labels[table_id] for table_id in choice.table_ids],
        }
        for choice in choices
    ]


def conflict_response(
    session: Session, venue: Venue, day: date, at: time, needs: PartyNeeds, message: str
) -> JSONResponse:
    """HTTP 409 seat_taken with the nearest free times and the free tables."""
    # Start from a clean transaction: the failed write was rolled back already.
    session.rollback()
    alternatives = {
        "times": nearest_times(session, venue, day, at, needs),
        "tables": free_tables(session, venue, day, at, needs),
    }
    body = {"error": {"code": "seat_taken", "message": message, "alternatives": alternatives}}
    return JSONResponse(body, status_code=409)
