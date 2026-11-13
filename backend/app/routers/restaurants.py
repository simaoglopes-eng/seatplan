"""Public diner endpoints (/r/{venue_public_id}): restaurant, times, map, hold, book.

The routes only check the request and call restaurant_service, which holds
the logic. Every route is rate limited per client address, because anyone on
the internet can call them.
"""

# The module, not its classes: request fields are themselves called "date" and
# "time", and a field may not share its name with its own type.
import datetime as dt
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Query, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app import db
from app.core.errors import ApiError, SeatTaken
from app.core.text import PlainText
from app.restaurant_service import (
    ambience_view,
    chosen_seat,
    diner_flow,
    holding,
    map_view,
    occupancy,
    schedule,
)
from app.restaurant_service.alternatives import conflict_response
from app.restaurant_service.availability import (
    MAX_ONLINE_PARTY,
    PartyNeeds,
    check_party_size,
    clean_prefs,
    day_summary,
    max_party,
)
from app.restaurant_service.booking_caps import check_booking_caps
from app.restaurant_service.booking_rows import describe
from app.restaurant_service.changes import record_change
from app.restaurant_service.clock import time_of_slot
from app.restaurant_service.emails import manage_link
from app.restaurant_service.schedule_edit import read_schedule
from app.restaurant_service.venue_access import load_restaurant
from app.security import client_ip, hash_token, rate_limit

router = APIRouter(tags=["restaurants"])

# Requests per minute per client address. Reads are cheap, writes less so.
# Holds are also capped by how many a client has live (see holding.py), so
# HOLD_LIMIT only has to leave room for a diner clicking through tables.
# Bookings are also capped per email and per address per day (booking_caps.py).
READ_LIMIT = 120
HOLD_LIMIT = 20
BOOK_LIMIT = 30
# The schema bound only; the real per-restaurant limit is checked by
# check_party_size and shown as max_party.
MAX_PARTY = MAX_ONLINE_PARTY

ZoneKind = Literal["window", "terrace", "bar", "quiet", "general", "vip", "accessible"]
Party = Annotated[int, Query(ge=1, le=MAX_PARTY)]
HighChairs = Annotated[int, Query(ge=0, le=6)]


class Strict(BaseModel):
    # Unknown fields are rejected (contract section 7).
    model_config = ConfigDict(extra="forbid")


class HoldIn(Strict):
    date: dt.date
    time: dt.time
    party: int = Field(ge=1, le=MAX_PARTY)
    # Contract: table_id. table_ids lets a diner take a recommended combination.
    table_id: int | None = None
    table_ids: list[int] | None = Field(default=None, min_length=1, max_length=3)
    needs_accessible: bool = False
    high_chairs: int = Field(default=0, ge=0, le=6)
    zone: ZoneKind | None = None
    # Ambience wishes for "Choose for me" (spec 8.3): sun, shade, view, quiet,
    # away_from_wc. Checked by clean_prefs (known keys, not sun with shade).
    prefs: list[str] = Field(default_factory=list, max_length=10)


class BookingIn(Strict):
    hold_id: str = Field(min_length=10, max_length=100)
    name: PlainText = Field(min_length=1, max_length=120)
    email: EmailStr
    phone: PlainText | None = Field(default=None, max_length=40)
    notes: PlainText = Field(default="", max_length=500)
    party: int = Field(ge=1, le=MAX_PARTY)
    needs_accessible: bool = False
    high_chairs: int = Field(default=0, ge=0, le=6)
    prefs: list[str] = Field(default_factory=list, max_length=10)  # kept for the staff
    # The chair the diner would like (spec 9.4): indicative, the whole table is booked.
    seat_id: int | None = Field(default=None, ge=1)


def _limit(session: db.SessionDep, request: Request, name: str, limit: int) -> None:
    rate_limit(session, f"r-{name}:{client_ip(request)}", limit=limit, window_s=60)


@router.get("/r/{venue_public_id}")
def restaurant(venue_public_id: str, request: Request, session: db.SessionDep) -> dict[str, Any]:
    """Name, floor plan and opening hours: everything the booking page draws first."""
    _limit(session, request, "read", READ_LIMIT)
    venue = load_restaurant(session, venue_public_id)
    return {
        "public_id": venue.public_id,
        "name": venue.name,
        "timezone": venue.timezone,
        # The biggest party a table (or joined tables) can take and the covers
        # cap allows; the booking form offers no more, bigger groups call.
        "max_party": max_party(session, venue),
        "width": venue.width,
        "height": venue.height,
        "zones": map_view.zones_payload(session, venue),
        "schedule": read_schedule(session, venue, upcoming_only=True),
    }


@router.get("/r/{venue_public_id}/slots")
def slots(
    venue_public_id: str,
    request: Request,
    session: db.SessionDep,
    date: dt.date,
    party: Party,
    accessible: bool = False,
    high_chairs: HighChairs = 0,
) -> dict[str, Any]:
    _limit(session, request, "read", READ_LIMIT)
    venue = load_restaurant(session, venue_public_id)
    check_party_size(session, venue, party)
    return day_summary(session, venue, date, PartyNeeds(party, accessible, high_chairs))


@router.get("/r/{venue_public_id}/map")
def table_map(
    venue_public_id: str,
    request: Request,
    session: db.SessionDep,
    date: dt.date,
    time: dt.time,
    party: Party,
    accessible: bool = False,
    high_chairs: HighChairs = 0,
    zone: ZoneKind | None = None,
    prefs: Annotated[str, Query(max_length=80)] = "",
) -> dict[str, Any]:
    """`prefs` is a comma list of wishes, e.g. `sun,view` (spec 8.3)."""
    _limit(session, request, "read", READ_LIMIT)
    venue = load_restaurant(session, venue_public_id)
    check_party_size(session, venue, party)
    schedule.check_bookable(session, venue, date, time)
    wishes = clean_prefs([key for key in prefs.split(",") if key])
    needs = PartyNeeds(party, accessible, high_chairs, zone, wishes)
    return map_view.build_map(session, venue, date, time, needs)


@router.get("/r/{venue_public_id}/ambience")
def ambience(
    venue_public_id: str,
    request: Request,
    session: db.SessionDep,
    date: dt.date,
    time: dt.time,
    party: Party,
    moment: dt.time | None = None,
) -> dict[str, Any]:
    """The light of every room and table, for the diner's time cursor (spec 7.6).

    `time` is when the stay starts (the sentences describe the whole stay);
    `moment` is where the cursor is and moves only the sun patches and the
    night veil. Maths only: ids, polygons, light names and short sentences.
    """
    _limit(session, request, "read", READ_LIMIT)
    venue = load_restaurant(session, venue_public_id)
    check_party_size(session, venue, party)
    schedule.check_bookable(session, venue, date, time)
    return ambience_view.ambience_payload(session, venue, date, time, party=party, moment=moment)


@router.get("/r/{venue_public_id}/seats")
def table_seats(
    venue_public_id: str, request: Request, session: db.SessionDep, table_ids: str
) -> dict[str, Any]:
    """The chairs of up to three tables, for the optional "where would you like
    to sit?" step (spec 9.4). `table_ids` is a comma list of table ids."""
    _limit(session, request, "read", READ_LIMIT)
    venue = load_restaurant(session, venue_public_id)
    try:
        ids = [int(part) for part in table_ids.split(",") if part.strip()]
    except ValueError:
        raise ApiError(
            422, "validation", "table_ids must be numbers separated by commas."
        ) from None
    return chosen_seat.table_seats(session, venue, ids)


@router.post("/r/{venue_public_id}/hold", status_code=201, response_model=None)
def hold(
    venue_public_id: str, body: HoldIn, request: Request, session: db.SessionDep
) -> dict[str, Any] | JSONResponse:
    """Hold a table for 5 minutes. Without a table, the optimiser picks one."""
    _limit(session, request, "hold", HOLD_LIMIT)
    venue = load_restaurant(session, venue_public_id)
    check_party_size(session, venue, body.party)
    wishes = clean_prefs(body.prefs)
    needs = PartyNeeds(body.party, body.needs_accessible, body.high_chairs, body.zone, wishes)
    wanted = body.table_ids or ([body.table_id] if body.table_id is not None else None)
    asked = diner_flow.HoldRequest(
        day=body.date,
        at=body.time,
        needs=needs,
        table_ids=tuple(wanted) if wanted else None,
        client=holding.client_key(client_ip(request)),
    )
    try:
        result = diner_flow.take_table_hold(session, venue, asked)
    except SeatTaken as taken:
        return conflict_response(session, venue, body.date, body.time, needs, taken.message)
    labels = {t.id: t.label for t in occupancy.venue_tables(session, venue)}
    return {
        "hold_id": result.hold_id,
        "table": {
            "table_ids": list(result.table_ids),
            "labels": [labels[table_id] for table_id in result.table_ids],
        },
        "table_choice": result.table_choice,
        "expires_at": result.expires_at,
    }


@router.delete("/r/{venue_public_id}/hold/{hold_id}", status_code=204)
def release_hold(
    venue_public_id: str, hold_id: str, request: Request, session: db.SessionDep
) -> Response:
    """Give a held table back at once (the diner went back or chose another),
    instead of letting it block other diners for the rest of the 5 minutes."""
    _limit(session, request, "hold", HOLD_LIMIT)
    venue = load_restaurant(session, venue_public_id)
    day = holding.release_held_tables(session, venue, hold_id)
    record_change(
        session,
        venue,
        [day],
        actor="diner",
        action="table.release",
        entity="hold",
        entity_id=hash_token(hold_id)[:12],
    )
    session.commit()
    return Response(status_code=204)


@router.post("/r/{venue_public_id}/bookings", status_code=201, response_model=None)
def book(
    venue_public_id: str, body: BookingIn, request: Request, session: db.SessionDep
) -> dict[str, Any] | JSONResponse:
    """Turn a hold into a confirmed booking and queue the confirmation email.

    429 `rate_limited` when the booking caps say no: 4 upcoming bookings per
    mailbox, 10 attempts per client address per UTC day (booking_caps.py).
    """
    _limit(session, request, "book", BOOK_LIMIT)
    venue = load_restaurant(session, venue_public_id)
    held = holding.read_hold(session, venue, body.hold_id)
    # After read_hold, so a dead or made-up hold_id never counts against the
    # daily cap; before confirm_booking, because the cap commits its count.
    check_booking_caps(session, venue, str(body.email), client_ip(request))
    needs = PartyNeeds(
        body.party, body.needs_accessible, body.high_chairs, prefs=clean_prefs(body.prefs)
    )
    contact = diner_flow.Contact(body.name, str(body.email), body.phone, body.notes)
    try:
        booking, token = diner_flow.confirm_booking(
            session, venue, held, needs, contact, seat_id=body.seat_id
        )
    except SeatTaken as taken:
        at = time_of_slot(held.window[0])
        return conflict_response(session, venue, held.day, at, needs, taken.message)
    return {
        "booking": describe(session, venue, booking, with_phrase=True),
        "manage_token": token,
        "manage_path": f"/b/{token}",
        "manage_link": manage_link(token),
    }
