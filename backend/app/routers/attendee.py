"""Personal-link endpoints for attendees (/a/{token}), contract section 5.

The token in the URL is the attendee's only key. Every route first counts the
request against a per-address rate limit (so links cannot be guessed by
brute force), then finds the guest by the token's hash. What leaves this file
about OTHER people is limited to privacy-filtered names and seat states.
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app import db
from app.core import audit
from app.core.errors import ApiError
from app.core.privacy import display_name
from app.events_service.access import (
    deadline_passed,
    event_scope,
    is_active,
    load_guest,
    load_venue,
    require_before_deadline,
)
from app.events_service.problem import current_rows, event_guests
from app.events_service.recommend import recommendations
from app.events_service.schemas import KnowsIn, PrivacyIn, RsvpIn, SeatChoice
from app.events_service.seating import (
    confirm_seat,
    drop_assignment,
    hold_seat,
    lock_event,
    release_seat,
)
from app.events_service.seatmap import attendee_map, holder_key, known_ids
from app.models import Acquaintance, Event, Guest, Hold, utc_now
from app.security import client_ip, rate_limit

router = APIRouter(tags=["attendee"])

# Generous for a person clicking around, tiny for someone guessing tokens.
REQUESTS_PER_MINUTE = 120
MAX_SEARCH_LENGTH = 60


def attendee(token: str, request: Request, session: db.SessionDep) -> Guest:
    """Dependency: rate limit first (it also covers wrong tokens), then the guest."""
    rate_limit(session, f"attendee:{client_ip(request)}", REQUESTS_PER_MINUTE, 60)
    return load_guest(session, token)


Attendee = Annotated[Guest, Depends(attendee)]


def _event_of(session: Session, guest: Guest) -> Event:
    event = session.get(Event, guest.event_id)
    if event is None:
        raise ApiError(404, "not_found", "Event not found.")
    return event


def _record(session: Session, guest: Guest, action: str, detail: dict[str, Any]) -> None:
    """Audit one attendee change. The live bump already happened in lock_event."""
    audit.record(
        session,
        actor=f"guest:{guest.id}",
        action=action,
        entity="guest",
        entity_id=str(guest.id),
        detail=detail,
    )


def people(session: Session, event: Event, me: Guest, search: str = "") -> list[dict[str, Any]]:
    """Other guests of THIS event: id, privacy-filtered name, seat, known by me.

    The search looks only at the name we are allowed to show, so searching a
    surname can never reveal someone whose surname is hidden.
    """
    rows = current_rows(session, event)
    knows = known_ids(session, me)
    found = []
    for other in event_guests(session, event):
        if other.id == me.id or not is_active(other):
            continue
        name = display_name(other.name, event.privacy_mode, other.wants_anonymous)
        if search and search.lower() not in name.lower():
            continue
        seat_id = rows[other.id].seat_id if other.id in rows else None
        found.append({"id": other.id, "name": name, "seat_id": seat_id, "known": other.id in knows})
    return found


def _me(session: Session, event: Event, me: Guest) -> dict[str, Any]:
    """The attendee's own details. Only their own; never anyone else's."""
    row = current_rows(session, event).get(me.id)
    # This guest's live hold, if any (one at a time, see seating.hold_seat).
    hold = session.scalars(
        select(Hold).where(
            (Hold.scope == event_scope(event))
            & (Hold.holder_key == holder_key(me))
            & (Hold.expires_at > utc_now())
        )
    ).first()
    return {
        "id": me.id,
        "name": me.name,
        "shown_to_others_as": display_name(me.name, event.privacy_mode, me.wants_anonymous),
        "rsvp": me.rsvp,
        "wants_anonymous": me.wants_anonymous,
        "needs_accessible": me.needs_accessible,
        "seat_id": row.seat_id if row else None,
        "held_seat_id": hold.resource_id if hold else None,
        # The end of the hold, so the page can show the countdown again after a reload.
        "held_until": hold.expires_at if hold else None,
        "knows": sorted(known_ids(session, me)),
    }


@router.get("/a/{token}")
def get_page(me: Attendee, session: db.SessionDep) -> dict[str, Any]:
    event = _event_of(session, me)
    venue = load_venue(session, event)
    return {
        "venue": {"name": venue.name},
        "event": {
            "name": event.name,
            "starts_at": event.starts_at,
            "ends_at": event.ends_at,
            "privacy_mode": event.privacy_mode,
            "change_deadline": event.change_deadline,
            "deadline_passed": deadline_passed(event),
            "live_scope": event_scope(event),
        },
        "me": _me(session, event, me),
        "map": attendee_map(session, event, venue, me),
        "people": people(session, event, me),
    }


@router.get("/a/{token}/people")
def search_people(
    me: Attendee,
    session: db.SessionDep,
    q: Annotated[str, Query(max_length=MAX_SEARCH_LENGTH)] = "",
) -> list[dict[str, Any]]:
    return people(session, _event_of(session, me), me, q.strip())


@router.post("/a/{token}/rsvp")
def set_rsvp(body: RsvpIn, token: str, me: Attendee, session: db.SessionDep) -> dict[str, Any]:
    event = _event_of(session, me)
    require_before_deadline(event)
    lock_event(session, event)  # before any other write, see seating.py
    me.rsvp = body.rsvp
    if body.rsvp == "no":
        # Not coming: give the seat back so someone else can have it.
        drop_assignment(session, event, me, actor=f"guest:{me.id}", token=token)
    _record(session, me, "guest.rsvp", {"rsvp": body.rsvp})
    session.commit()
    return {"rsvp": me.rsvp}


@router.post("/a/{token}/knows")
def set_knows(body: KnowsIn, me: Attendee, session: db.SessionDep) -> dict[str, Any]:
    """Replace the list of people this attendee knows (same event only)."""
    event = _event_of(session, me)
    wanted = set(body.guest_ids) - {me.id}
    query = select(Guest).where(Guest.id.in_(wanted) & (Guest.event_id == event.id))
    valid = {guest.id for guest in session.scalars(query) if is_active(guest)}
    if valid != wanted:
        raise ApiError(422, "validation", "Some of these people are not guests of this event.")
    lock_event(session, event)
    session.execute(delete(Acquaintance).where(Acquaintance.guest_id == me.id))
    session.add_all(Acquaintance(guest_id=me.id, knows_guest_id=other) for other in sorted(valid))
    _record(session, me, "guest.knows", {"count": len(valid)})
    session.commit()
    return {"knows": sorted(valid)}


@router.post("/a/{token}/privacy")
def set_privacy(body: PrivacyIn, me: Attendee, session: db.SessionDep) -> dict[str, Any]:
    event = _event_of(session, me)
    lock_event(session, event)
    me.wants_anonymous = body.wants_anonymous
    _record(session, me, "guest.privacy", {"wants_anonymous": body.wants_anonymous})
    session.commit()
    return {
        "wants_anonymous": me.wants_anonymous,
        "shown_to_others_as": display_name(me.name, event.privacy_mode, me.wants_anonymous),
    }


@router.get("/a/{token}/recommendations")
def get_recommendations(me: Attendee, session: db.SessionDep) -> list[dict[str, Any]]:
    return recommendations(session, _event_of(session, me), me)


@router.post("/a/{token}/hold")
def hold(body: SeatChoice, me: Attendee, session: db.SessionDep) -> dict[str, Any]:
    hold_row = hold_seat(session, _event_of(session, me), me, body.seat_id)
    return {"seat_id": hold_row.resource_id, "expires_at": hold_row.expires_at}


@router.post("/a/{token}/confirm")
def confirm(body: SeatChoice, token: str, me: Attendee, session: db.SessionDep) -> dict[str, Any]:
    # The token is passed on so the confirmation email links back to this page.
    row = confirm_seat(session, _event_of(session, me), me, body.seat_id, token)
    return {"seat_id": row.seat_id, "source": row.source}


@router.delete("/a/{token}/seat")
def release(token: str, me: Attendee, session: db.SessionDep) -> dict[str, Any]:
    release_seat(session, _event_of(session, me), me, token)
    return {"seat_id": None}
