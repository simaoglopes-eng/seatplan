"""Staff floor, walk-ins, dashboard and schedule (/staff/{venue_public_id}).

Every route needs a logged-in session (`user: CurrentUser`). Staff accounts may
work on every restaurant; an organiser only on their own.

The two /optimise routes put the restaurant optimiser to work on a whole
service: re-plan the tables of auto-placed bookings (preview first, apply on
a second call), and compare the heuristic with the proven optimum.
"""

# The module, not its classes: request fields are themselves called "date" and
# "time", and a field may not share its name with its own type.
import datetime as dt
from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from app import db
from app.core.errors import ApiError
from app.core.text import PlainText
from app.restaurant_service import service_plan, staff_floor
from app.restaurant_service.availability import PartyNeeds
from app.restaurant_service.booking_rows import describe
from app.restaurant_service.changes import record_change
from app.restaurant_service.clock import now_local, slot_of, time_of_slot
from app.restaurant_service.dashboard import dashboard as build_dashboard
from app.restaurant_service.schedule_edit import (
    BlackoutRow,
    PeriodRow,
    TurnRow,
    read_schedule,
    replace_schedule,
)
from app.restaurant_service.venue_access import load_for_staff
from app.restaurant_service.whatif import walkin_whatif
from app.security import CurrentUser

router = APIRouter(tags=["staff"])

Status = Literal["confirmed", "seated", "finishing", "completed", "no_show", "cancelled"]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class WalkInIn(Strict):
    party_size: int = Field(ge=1, le=30)
    name: PlainText = Field(default="Walk-in", min_length=1, max_length=120)
    date: dt.date | None = None
    time: dt.time | None = None
    needs_accessible: bool = False
    high_chairs: int = Field(default=0, ge=0, le=6)
    table_ids: list[int] | None = Field(default=None, min_length=1, max_length=3)


class StatusIn(Strict):
    status: Status


class MoveIn(Strict):
    table_ids: list[int] = Field(min_length=1, max_length=3)


class WhatIfIn(Strict):
    party_size: int = Field(ge=1, le=30)
    time: dt.time
    date: dt.date | None = None
    needs_accessible: bool = False
    high_chairs: int = Field(default=0, ge=0, le=6)


class PeriodIn(Strict):
    name: PlainText = Field(min_length=1, max_length=40)
    weekday: int = Field(ge=0, le=6)
    start_time: dt.time
    end_time: dt.time
    slot_minutes: int = Field(default=15, ge=15, le=120)
    max_covers_per_slot: int = Field(ge=1, le=1000)


class TurnIn(Strict):
    max_party: int = Field(ge=1, le=100)
    minutes: int = Field(ge=15, le=600)


class BlackoutIn(Strict):
    date: dt.date
    reason: PlainText = Field(default="", max_length=200)


class ScheduleIn(Strict):
    service_periods: list[PeriodIn] = Field(max_length=100)
    turn_times: list[TurnIn] = Field(max_length=30)
    blackout_dates: list[BlackoutIn] = Field(default_factory=list, max_length=400)


class OptimiseServiceIn(Strict):
    date: dt.date
    service: PlainText = Field(min_length=1, max_length=40)  # "Dinner"
    seed: int = Field(default=0, ge=0, le=1_000_000)
    # False: only show the plan. True: write it, but only the plan with this id.
    apply: bool = False
    plan_id: str | None = Field(default=None, min_length=16, max_length=16)


class ExactCheckIn(Strict):
    date: dt.date
    service: PlainText = Field(min_length=1, max_length=40)
    max_parties: int = Field(default=service_plan.DEFAULT_EXACT_PARTIES, ge=1, le=12)


def _now_slot_time(venue_now: dt.datetime) -> dt.time:
    """The start of the current 15-minute slot: a walk-in at 19:38 starts at 19:30."""
    return time_of_slot(slot_of(venue_now.time()))


@router.get("/staff/{venue_public_id}/floor")
def floor(
    venue_public_id: str,
    user: CurrentUser,
    session: db.SessionDep,
    date: dt.date | None = None,
    time: dt.time | None = None,
) -> dict[str, Any]:
    venue = load_for_staff(session, venue_public_id, user)
    now = now_local(venue)
    return staff_floor.floor(session, venue, date or now.date(), time or now.time())


@router.post("/staff/{venue_public_id}/walkins", status_code=201)
def walk_in(
    venue_public_id: str, body: WalkInIn, user: CurrentUser, session: db.SessionDep
) -> dict[str, Any]:
    """Seat a walk-in now. Without table_ids the optimiser picks the table."""
    venue = load_for_staff(session, venue_public_id, user)
    now = now_local(venue)
    walkin = staff_floor.WalkIn(
        day=body.date or now.date(),
        at=body.time or _now_slot_time(now),
        needs=PartyNeeds(body.party_size, body.needs_accessible, body.high_chairs),
        name=body.name,
        table_ids=tuple(body.table_ids) if body.table_ids else None,
    )
    booking = staff_floor.seat_walkin(session, venue, walkin, user)
    return describe(session, venue, booking)


@router.post("/staff/{venue_public_id}/bookings/{booking_id}/status")
def change_status(
    venue_public_id: str, booking_id: str, body: StatusIn, user: CurrentUser, session: db.SessionDep
) -> dict[str, Any]:
    venue = load_for_staff(session, venue_public_id, user)
    booking = staff_floor.load_booking(session, venue, booking_id)
    staff_floor.set_status(session, venue, booking, body.status, user)
    return describe(session, venue, booking)


@router.post("/staff/{venue_public_id}/bookings/{booking_id}/move")
def move(
    venue_public_id: str, booking_id: str, body: MoveIn, user: CurrentUser, session: db.SessionDep
) -> dict[str, Any]:
    """Move a booking to other tables; several ids combine tables for a big party."""
    venue = load_for_staff(session, venue_public_id, user)
    booking = staff_floor.load_booking(session, venue, booking_id)
    staff_floor.move_booking(session, venue, booking, tuple(body.table_ids), user)
    return describe(session, venue, booking)


@router.post("/staff/{venue_public_id}/whatif")
def whatif(
    venue_public_id: str, body: WhatIfIn, user: CurrentUser, session: db.SessionDep
) -> dict[str, Any]:
    """Where would this walk-in go, and who would move? Nothing is changed."""
    venue = load_for_staff(session, venue_public_id, user)
    needs = PartyNeeds(body.party_size, body.needs_accessible, body.high_chairs)
    day = body.date or now_local(venue).date()
    return walkin_whatif(session, venue, day, body.time, needs)


@router.post("/staff/{venue_public_id}/optimise/service")
def optimise_service(
    venue_public_id: str, body: OptimiseServiceIn, user: CurrentUser, session: db.SessionDep
) -> dict[str, Any]:
    """Re-plan the tables of auto-placed bookings. Preview first, apply on a second call.

    Diners' own choices and seated parties never move. Applying needs the
    plan_id of the preview: if the floor changed since, the plan differs and
    staff are asked to look again instead of applying moves they never saw.
    """
    venue = load_for_staff(session, venue_public_id, user)
    if body.apply and body.plan_id is None:
        raise ApiError(422, "validation", "Preview the plan first, then apply it with its plan_id.")
    proposal = service_plan.propose(session, venue, body.date, body.service, body.seed)
    if not body.apply:
        return service_plan.describe_proposal(session, venue, body.date, proposal, False)
    if proposal.plan_id != body.plan_id:
        raise ApiError(
            409, "conflict", "The floor changed since the preview. Please preview again."
        )
    answer = service_plan.describe_proposal(session, venue, body.date, proposal, True)
    service_plan.apply_proposal(session, venue, body.date, proposal, user)
    return answer


@router.post("/staff/{venue_public_id}/optimise/exact-check")
def optimise_exact_check(
    venue_public_id: str, body: ExactCheckIn, user: CurrentUser, session: db.SessionDep
) -> dict[str, Any]:
    """How close is the heuristic to the proven optimum on (a slice of) this service?"""
    venue = load_for_staff(session, venue_public_id, user)
    return service_plan.exact_check(session, venue, body.date, body.service, body.max_parties)


@router.get("/staff/{venue_public_id}/dashboard")
def dashboard(
    venue_public_id: str, user: CurrentUser, session: db.SessionDep, date: dt.date | None = None
) -> dict[str, Any]:
    venue = load_for_staff(session, venue_public_id, user)
    return build_dashboard(session, venue, date or now_local(venue).date())


@router.get("/staff/{venue_public_id}/schedule")
def get_schedule(venue_public_id: str, user: CurrentUser, session: db.SessionDep) -> dict[str, Any]:
    venue = load_for_staff(session, venue_public_id, user)
    return read_schedule(session, venue)


@router.put("/staff/{venue_public_id}/schedule")
def put_schedule(
    venue_public_id: str, body: ScheduleIn, user: CurrentUser, session: db.SessionDep
) -> dict[str, Any]:
    venue = load_for_staff(session, venue_public_id, user)
    replace_schedule(
        session,
        venue,
        [PeriodRow(**period.model_dump()) for period in body.service_periods],
        [TurnRow(**turn.model_dump()) for turn in body.turn_times],
        [BlackoutRow(**blackout.model_dump()) for blackout in body.blackout_dates],
    )
    # The schedule is not tied to one date, so there is no live scope to bump.
    record_change(
        session,
        venue,
        [],
        actor=user.email,
        action="schedule.update",
        entity="venue",
        entity_id=venue.public_id,
        detail={"periods": len(body.service_periods), "turn_times": len(body.turn_times)},
    )
    session.commit()
    return read_schedule(session, venue)
