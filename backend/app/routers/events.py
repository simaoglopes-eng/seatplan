"""Organiser endpoints for the events vertical (/events), contract section 5.

Each route: check the login and the body, call one helper from
app/events_service, bump the live scope, write the audit log, commit once.
"""

from typing import Annotated, Any

from fastapi import APIRouter, Body, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import db
from app.core import audit, live
from app.core.errors import ApiError
from app.core.holds import commit_or_seat_taken
from app.events_service import chart, csv_io, exact_check, guests, optimise, plans
from app.events_service.access import (
    attendee_link,
    deadline_passed,
    event_scope,
    load_event,
    load_event_guest,
    load_venue,
)
from app.events_service.problem import active_guests, current_rows
from app.events_service.schemas import (
    EventIn,
    EventPatch,
    ExactCheckIn,
    GuestIn,
    GuestPatch,
    OptimiseIn,
    SeatChoice,
    WhatIfIn,
)
from app.events_service.seating import (
    drop_assignment,
    flush_or_seat_taken,
    lock_event,
    queue_change_email,
    seat_for_guest,
)
from app.events_service.seatmap import organiser_map
from app.models import AuditLog, Event, Guest, Organiser, Seat, SeatAssignment, Venue
from app.security import CurrentOrganiser

router = APIRouter(tags=["events"])


def event_dict(event: Event) -> dict[str, Any]:
    return {
        "public_id": event.public_id,
        "name": event.name,
        "starts_at": event.starts_at,
        "ends_at": event.ends_at,
        "privacy_mode": event.privacy_mode,
        "change_deadline": event.change_deadline,
        "deadline_passed": deadline_passed(event),
        "live_scope": event_scope(event),
    }


def _changed(
    session: Session,
    event: Event,
    user: Organiser,
    action: str,
    entity_id: str,
    detail: dict[str, Any] | None = None,
) -> AuditLog:
    """Every organiser write ends the same way: bump the live scope and audit.

    Seat writes call lock_event first (see seating.py); bumping again here
    never waits, because this transaction already holds that row.
    """
    live.bump(session, event_scope(event))
    return audit.record(
        session,
        actor=user.email,
        action=action,
        entity="event",
        entity_id=entity_id,
        detail=detail,
    )


# ---------------------------------------------------------------- events


@router.post("/events", status_code=201)
def create_event(body: EventIn, user: CurrentOrganiser, session: db.SessionDep) -> dict[str, Any]:
    venue = session.scalars(select(Venue).where(Venue.public_id == body.venue_id)).first()
    if venue is None or venue.organiser_id != user.id or venue.kind != "event":
        raise ApiError(404, "not_found", "Event venue not found.")
    if body.ends_at <= body.starts_at:
        raise ApiError(422, "validation", "The event must end after it starts.")
    event = Event(venue_id=venue.id, organiser_id=user.id, **body.model_dump(exclude={"venue_id"}))
    session.add(event)
    session.flush()
    _changed(session, event, user, "event.create", event.public_id)
    session.commit()
    return event_dict(event)


@router.get("/events")
def list_events(user: CurrentOrganiser, session: db.SessionDep) -> list[dict[str, Any]]:
    query = select(Event).where(Event.organiser_id == user.id).order_by(Event.starts_at)
    return [event_dict(event) for event in session.scalars(query)]


@router.get("/events/{eid}")
def get_event(eid: str, user: CurrentOrganiser, session: db.SessionDep) -> dict[str, Any]:
    """Full map with real names, plus who has not chosen a seat themselves."""
    event = load_event(session, eid, user)
    venue = load_venue(session, event)
    rows = current_rows(session, event)
    coming = active_guests(session, event)
    not_chosen = [
        {"guest_id": g.id, "name": g.name, "has_seat": g.id in rows}
        for g in coming
        if g.id not in rows or rows[g.id].source != "self"
    ]
    return {
        "event": event_dict(event),
        "venue": {"public_id": venue.public_id, "name": venue.name},
        "map": organiser_map(session, event, venue),
        "not_chosen": not_chosen,
        "counts": {
            "guests": len(coming),
            "seated": len(rows),
            "chosen_by_self": sum(1 for row in rows.values() if row.source == "self"),
        },
    }


@router.patch("/events/{eid}")
def patch_event(
    eid: str, body: EventPatch, user: CurrentOrganiser, session: db.SessionDep
) -> dict[str, Any]:
    event = load_event(session, eid, user)
    changes = body.model_dump(exclude_unset=True)
    for name, value in changes.items():
        if value is None and name != "change_deadline":
            raise ApiError(422, "validation", f"{name} cannot be empty.")
        setattr(event, name, value)
    if event.ends_at <= event.starts_at:
        raise ApiError(422, "validation", "The event must end after it starts.")
    _changed(session, event, user, "event.update", event.public_id, {"fields": sorted(changes)})
    session.commit()
    return event_dict(event)


# ---------------------------------------------------------------- guests


@router.get("/events/{eid}/guests")
def list_guests(eid: str, user: CurrentOrganiser, session: db.SessionDep) -> list[dict[str, Any]]:
    return guests.list_guests(session, load_event(session, eid, user))


@router.post("/events/{eid}/guests", status_code=201)
def add_guest(
    eid: str, body: GuestIn, user: CurrentOrganiser, session: db.SessionDep
) -> dict[str, Any]:
    event = load_event(session, eid, user)
    guest, token = guests.add_guest(session, event, body)
    _changed(session, event, user, "guest.create", str(guest.id))
    session.commit()
    # The raw link is shown this once; only its hash is stored.
    return {**guests.guest_dict(guest, body.group, None), "link": attendee_link(token)}


@router.patch("/events/{eid}/guests/{gid}")
def patch_guest(
    eid: str, gid: int, body: GuestPatch, user: CurrentOrganiser, session: db.SessionDep
) -> dict[str, Any]:
    event = load_event(session, eid, user)
    guest = load_event_guest(session, event, gid)
    guests.update_guest(session, event, guest, body.model_dump(exclude_unset=True), user)
    session.commit()
    return next(item for item in guests.list_guests(session, event) if item["id"] == guest.id)


@router.delete("/events/{eid}/guests/{gid}")
def delete_guest(
    eid: str, gid: int, user: CurrentOrganiser, session: db.SessionDep
) -> dict[str, Any]:
    """GDPR erasure: personal data overwritten, seat freed, link revoked."""
    event = load_event(session, eid, user)
    guest = load_event_guest(session, event, gid)
    guests.erase_guest(session, event, guest, user)
    session.commit()
    return {"erased": True, "guest_id": gid}


@router.post("/events/{eid}/guests/{gid}/new-link")
def new_link(eid: str, gid: int, user: CurrentOrganiser, session: db.SessionDep) -> dict[str, str]:
    event = load_event(session, eid, user)
    guest = load_event_guest(session, event, gid)
    link = guests.new_link(session, event, guest, user)
    session.commit()
    return link


@router.post("/events/{eid}/guests/import")
def import_guests(
    eid: str,
    body: Annotated[bytes, Body(media_type="text/csv")],
    user: CurrentOrganiser,
    session: db.SessionDep,
) -> dict[str, Any]:
    """CSV upload sent as the raw request body (see docs/decisions-log.md).

    All or nothing: when any row is wrong nothing is imported and every bad
    line is listed.
    """
    event = load_event(session, eid, user)
    try:
        rows = csv_io.read_rows(csv_io.decode(body))
    except csv_io.ImportProblem as problem:
        raise ApiError(422, "validation", str(problem)) from None
    valid, errors = csv_io.validate_rows(session, event, rows)
    if errors:
        return {"imported": 0, "errors": errors, "guests": []}
    created = []
    for item in valid:
        guest, token = guests.add_guest(session, event, item)
        created.append({"id": guest.id, "name": guest.name, "link": attendee_link(token)})
    _changed(session, event, user, "guest.import", event.public_id, {"count": len(created)})
    session.commit()
    return {"imported": len(created), "errors": [], "guests": created}


@router.get("/events/{eid}/export.csv")
def export_guests(eid: str, user: CurrentOrganiser, session: db.SessionDep) -> Response:
    event = load_event(session, eid, user)
    return Response(
        content=csv_io.export_csv(session, event),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="guests.csv"'},
    )


@router.get("/events/{eid}/chart")
def get_chart(eid: str, user: CurrentOrganiser, session: db.SessionDep) -> dict[str, Any]:
    return chart.chart(session, load_event(session, eid, user))


# ---------------------------------------------------------------- organiser moves


def _place(session: Session, event: Event, guest: Guest, seat: Seat) -> int | None:
    """Put the guest on the seat as an organiser choice. Returns their old seat id."""
    row = current_rows(session, event).get(guest.id)
    old_seat_id = row.seat_id if row else None
    if row is None:
        row = SeatAssignment(
            event_id=event.id, guest_id=guest.id, seat_id=seat.id, source="organiser"
        )
        session.add(row)
    row.seat_id = seat.id
    row.source = "organiser"
    flush_or_seat_taken(session, seat)  # the UNIQUE constraint decides, as for attendees
    return old_seat_id


@router.put("/events/{eid}/assignments/{gid}")
def assign_seat(
    eid: str, gid: int, body: SeatChoice, user: CurrentOrganiser, session: db.SessionDep
) -> dict[str, Any]:
    """The organiser puts a guest on a seat. Hard rules still apply to them."""
    event = load_event(session, eid, user)
    guest = load_event_guest(session, event, gid)
    if guest.rsvp == "no":
        raise ApiError(409, "conflict", "This guest said they are not coming.")
    seat = seat_for_guest(session, event, guest, body.seat_id)
    lock_event(session, event)
    plans.ensure_baseline(session, event)
    old_seat_id = _place(session, event, guest, seat)
    detail = {"seat_id": seat.id, "old_seat_id": old_seat_id}
    entry = _changed(session, event, user, "seat.assign", str(guest.id), detail)
    plans.push_history(session, event, f"Moved guest {guest.id}")
    queue_change_email(session, event, guest, seat, old_seat_id, entry)
    commit_or_seat_taken(session)
    return {"guest_id": guest.id, "seat_id": seat.id, "source": "organiser"}


@router.delete("/events/{eid}/assignments/{gid}")
def unassign_seat(
    eid: str, gid: int, user: CurrentOrganiser, session: db.SessionDep
) -> dict[str, Any]:
    event = load_event(session, eid, user)
    guest = load_event_guest(session, event, gid)
    lock_event(session, event)
    plans.ensure_baseline(session, event)
    if not drop_assignment(session, event, guest, actor=user.email):
        raise ApiError(404, "not_found", "This guest has no seat.")
    plans.push_history(session, event, f"Took guest {guest.id} off their seat")
    session.commit()
    return {"guest_id": guest.id, "seat_id": None}


# ---------------------------------------------------------------- optimiser


@router.post("/events/{eid}/optimise/autofill")
def autofill(
    eid: str, body: OptimiseIn, user: CurrentOrganiser, session: db.SessionDep
) -> dict[str, Any]:
    """A proposal only: stored as a scenario, nothing on the map changes."""
    event = load_event(session, eid, user)
    scenario = optimise.autofill(session, event, body.seed, body.max_iterations)
    audit.record(
        session,
        actor=user.email,
        action="plan.autofill",
        entity="event",
        entity_id=event.public_id,
        detail={"scenario": scenario["id"]},
    )
    session.commit()
    return scenario


@router.post("/events/{eid}/optimise/replan")
def replan(
    eid: str, user: CurrentOrganiser, session: db.SessionDep, body: OptimiseIn | None = None
) -> dict[str, Any]:
    event = load_event(session, eid, user)
    options = body or OptimiseIn()
    scenario = optimise.replan_event(session, event, options.seed, options.max_iterations)
    audit.record(
        session,
        actor=user.email,
        action="plan.replan",
        entity="event",
        entity_id=event.public_id,
        detail={"scenario": scenario["id"]},
    )
    session.commit()
    return scenario


@router.get("/events/{eid}/scenarios")
def list_scenarios(
    eid: str, user: CurrentOrganiser, session: db.SessionDep
) -> list[dict[str, Any]]:
    event = load_event(session, eid, user)
    return [
        optimise.scenario_dict(snap) for snap in plans.snapshots(session, event, plans.SCENARIO)
    ]


@router.get("/events/{eid}/scenarios/compare")
def compare_scenarios(
    eid: str,
    a: Annotated[int, Query(ge=1)],
    b: Annotated[int, Query(ge=1)],
    user: CurrentOrganiser,
    session: db.SessionDep,
) -> dict[str, Any]:
    event = load_event(session, eid, user)
    return optimise.compare(
        plans.load_scenario(session, event, a), plans.load_scenario(session, event, b)
    )


@router.post("/events/{eid}/scenarios/{sid}/apply")
def apply_scenario(
    eid: str, sid: int, user: CurrentOrganiser, session: db.SessionDep
) -> dict[str, Any]:
    """Apply a scenario. Seats people chose in the meantime are kept and reported."""
    event = load_event(session, eid, user)
    scenario = plans.load_scenario(session, event, sid)
    lock_event(session, event)
    plans.ensure_baseline(session, event)
    result = plans.apply_plan(
        session, event, plans.state_of(scenario), protected={"self", "organiser"}
    )
    plans.push_history(session, event, f"Applied scenario {sid}")
    applied, conflicts = result["applied"], len(result["conflicts"])
    detail = {"scenario": sid, "applied": applied, "conflicts": conflicts}
    _changed(session, event, user, "plan.apply", event.public_id, detail)
    commit_or_seat_taken(session)
    return result


@router.post("/events/{eid}/whatif")
def what_if(
    eid: str, body: WhatIfIn, user: CurrentOrganiser, session: db.SessionDep
) -> dict[str, Any]:
    event = load_event(session, eid, user)
    return optimise.whatif(session, event, [(m.guest_id, m.seat_id) for m in body.moves])


@router.post("/events/{eid}/undo")
def undo(eid: str, user: CurrentOrganiser, session: db.SessionDep) -> dict[str, Any]:
    return _step(eid, user, session, -1)


@router.post("/events/{eid}/redo")
def redo(eid: str, user: CurrentOrganiser, session: db.SessionDep) -> dict[str, Any]:
    return _step(eid, user, session, +1)


def _step(eid: str, user: Organiser, session: Session, step: int) -> dict[str, Any]:
    event = load_event(session, eid, user)
    lock_event(session, event)
    result = plans.step_history(session, event, step)
    action = "plan.undo" if step < 0 else "plan.redo"
    _changed(session, event, user, action, event.public_id, {"seq": result["seq"]})
    commit_or_seat_taken(session)
    return result


@router.post("/events/{eid}/optimise/exact-check")
def run_exact_check(
    eid: str, user: CurrentOrganiser, session: db.SessionDep, body: ExactCheckIn | None = None
) -> dict[str, Any]:
    event = load_event(session, eid, user)
    table_ids = body.table_ids if body else None
    return exact_check.exact_check(session, event, table_ids)
