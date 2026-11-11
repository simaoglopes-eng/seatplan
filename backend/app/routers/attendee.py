"""Personal-link endpoints for attendees (/a/{token}), contract section 5.

The token in the URL is the attendee's only key. Every route first counts the
request against a per-address rate limit (so links cannot be guessed by
brute force), then finds the guest by the token's hash. The page itself is
built in events_service/attendee_view.py, shared with signed-in guest
accounts (routers/guest_events.py).
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request

from app import db
from app.events_service import attendee_view
from app.events_service.access import load_guest
from app.events_service.attendee_view import event_of
from app.events_service.recommend import recommendations
from app.events_service.schemas import KnowsIn, PrivacyIn, RsvpIn, SeatChoice
from app.events_service.seating import (
    confirm_seat,
    hold_seat,
    release_seat,
)
from app.models import Guest
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


@router.get("/a/{token}")
def get_page(me: Attendee, session: db.SessionDep) -> dict[str, Any]:
    return attendee_view.page(session, me)


@router.get("/a/{token}/people")
def search_people(
    me: Attendee,
    session: db.SessionDep,
    q: Annotated[str, Query(max_length=MAX_SEARCH_LENGTH)] = "",
) -> list[dict[str, Any]]:
    return attendee_view.people(session, event_of(session, me), me, q.strip())


@router.post("/a/{token}/rsvp")
def set_rsvp(body: RsvpIn, token: str, me: Attendee, session: db.SessionDep) -> dict[str, Any]:
    return attendee_view.set_rsvp(session, me, body.rsvp, token)


@router.post("/a/{token}/knows")
def set_knows(body: KnowsIn, me: Attendee, session: db.SessionDep) -> dict[str, Any]:
    """Replace the list of people this attendee knows (same event only)."""
    return attendee_view.set_knows(session, me, body.guest_ids)


@router.post("/a/{token}/privacy")
def set_privacy(body: PrivacyIn, me: Attendee, session: db.SessionDep) -> dict[str, Any]:
    return attendee_view.set_privacy(session, me, body.wants_anonymous)


@router.get("/a/{token}/recommendations")
def get_recommendations(me: Attendee, session: db.SessionDep) -> list[dict[str, Any]]:
    return recommendations(session, event_of(session, me), me)


@router.post("/a/{token}/hold")
def hold(body: SeatChoice, me: Attendee, session: db.SessionDep) -> dict[str, Any]:
    hold_row = hold_seat(session, event_of(session, me), me, body.seat_id)
    return {"seat_id": hold_row.resource_id, "expires_at": hold_row.expires_at}


@router.post("/a/{token}/confirm")
def confirm(body: SeatChoice, token: str, me: Attendee, session: db.SessionDep) -> dict[str, Any]:
    # The token is passed on so the confirmation email links back to this page.
    row = confirm_seat(session, event_of(session, me), me, body.seat_id, token)
    return {"seat_id": row.seat_id, "source": row.source}


@router.delete("/a/{token}/seat")
def release(token: str, me: Attendee, session: db.SessionDep) -> dict[str, Any]:
    release_seat(session, event_of(session, me), me, token)
    return {"seat_id": None}
