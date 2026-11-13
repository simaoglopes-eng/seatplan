"""Manage-or-cancel links (/b/{manage_token}) and the waitlist.

The manage token is the only key to a booking: whoever has the link from the
confirmation email may view, change or cancel. We store only its SHA-256
hash, so a wrong token and a missing booking both give the same 404.
"""

# The module, not its classes: request fields are themselves called "date" and
# "time", and a field may not share its name with its own type.
import datetime as dt
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app import db
from app.core.errors import ApiError, SeatTaken
from app.core.text import PlainText
from app.models import Venue
from app.restaurant_service import booking_rows, manage_flow, waitlist
from app.restaurant_service.alternatives import conflict_response
from app.restaurant_service.availability import MAX_ONLINE_PARTY, check_party_size, max_party
from app.restaurant_service.changes import record_change
from app.restaurant_service.clock import hhmm, is_past, venue_zone
from app.restaurant_service.venue_access import load_published
from app.security import client_ip, rate_limit

router = APIRouter(tags=["bookings"])

# Per client address per minute. Low enough to make guessing tokens hopeless.
MANAGE_LIMIT = 30
WAITLIST_LIMIT = 10


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ChangeIn(Strict):
    date: dt.date | None = None
    time: dt.time | None = None
    party_size: int | None = Field(default=None, ge=1, le=MAX_ONLINE_PARTY)
    # The chair wished for (spec 9.4); null takes the wish away. Sent on its own.
    seat_id: int | None = Field(default=None, ge=1)


class WaitlistIn(Strict):
    date: dt.date
    time: dt.time
    party: int = Field(ge=1, le=MAX_ONLINE_PARTY)
    name: PlainText = Field(min_length=1, max_length=120)
    email: EmailStr


def _limit(session: db.SessionDep, request: Request, name: str, limit: int) -> None:
    rate_limit(session, f"b-{name}:{client_ip(request)}", limit=limit, window_s=60)


def _venue_of(session: db.SessionDep, venue_id: int) -> Venue:
    venue = session.get(Venue, venue_id)
    if venue is None:
        raise ApiError(404, "not_found", "Booking not found.")
    return venue


@router.get("/b/{manage_token}")
def view_booking(manage_token: str, request: Request, session: db.SessionDep) -> dict[str, Any]:
    _limit(session, request, "manage", MANAGE_LIMIT)
    booking = booking_rows.load_by_token(session, manage_token)
    venue = _venue_of(session, booking.venue_id)
    detail = booking_rows.describe(session, venue, booking, with_phrase=True)
    local_start = booking.start_at.astimezone(venue_zone(venue)).time()
    detail["can_change"] = booking.status == "confirmed" and not is_past(
        venue, booking.date, local_start
    )
    # The change form offers party sizes up to this, so every choice can fit.
    detail["max_party"] = max_party(session, venue)
    return detail


@router.patch("/b/{manage_token}", response_model=None)
def change_booking(
    manage_token: str, body: ChangeIn, request: Request, session: db.SessionDep
) -> dict[str, Any] | JSONResponse:
    """New time, date or party size. The table fit is worked out again."""
    _limit(session, request, "manage", MANAGE_LIMIT)
    booking = booking_rows.load_by_token(session, manage_token)
    venue = _venue_of(session, booking.venue_id)
    if "seat_id" in body.model_fields_set:
        if body.date or body.time or body.party_size:
            raise ApiError(422, "validation", "Change the seat on its own, not with the time.")
        manage_flow.change_seat(session, venue, booking, body.seat_id)
        return booking_rows.describe(session, venue, booking, with_phrase=True)
    if body.party_size is not None:
        check_party_size(session, venue, body.party_size)
    local_start = booking.start_at.astimezone(venue_zone(venue)).time()
    change = manage_flow.Change(
        day=body.date or booking.date,
        at=body.time or local_start,
        party_size=body.party_size or booking.party_size,
    )
    try:
        manage_flow.change_booking(session, venue, booking, change, manage_token)
    except SeatTaken as taken:
        needs = manage_flow.needs_of(booking, change.party_size)
        return conflict_response(session, venue, change.day, change.at, needs, taken.message)
    return booking_rows.describe(session, venue, booking)


@router.delete("/b/{manage_token}")
def cancel_booking(manage_token: str, request: Request, session: db.SessionDep) -> dict[str, Any]:
    _limit(session, request, "manage", MANAGE_LIMIT)
    booking = booking_rows.load_by_token(session, manage_token)
    venue = _venue_of(session, booking.venue_id)
    if booking.status != "confirmed":
        raise ApiError(409, "conflict", "This booking can no longer be cancelled.")
    manage_flow.cancel_booking(session, venue, booking, actor="diner", token=manage_token)
    session.commit()
    return booking_rows.describe(session, venue, booking)


@router.post("/r/{venue_public_id}/waitlist", status_code=201)
def join_waitlist(
    venue_public_id: str, body: WaitlistIn, request: Request, session: db.SessionDep
) -> dict[str, Any]:
    """Join the waitlist. Answers with the place in line and an estimated wait."""
    _limit(session, request, "waitlist", WAITLIST_LIMIT)
    venue = load_published(session, venue_public_id)
    check_party_size(session, venue, body.party)
    if is_past(venue, body.date, body.time):
        raise ApiError(422, "validation", "This time has already passed.")
    entry = waitlist.join(
        session, venue, body.date, body.time, body.party, body.name, str(body.email)
    )
    position = waitlist.position_of(session, entry)
    record_change(
        session,
        venue,
        [body.date],
        actor="diner",
        action="waitlist.join",
        entity="waitlist",
        entity_id=str(entry.id),
        detail={"party": body.party},
    )
    session.commit()
    return {
        "date": body.date.isoformat(),
        "time": hhmm(body.time),
        "position": position,
        "estimated_wait_minutes": waitlist.estimate_wait(session, venue, body.party, position),
    }
