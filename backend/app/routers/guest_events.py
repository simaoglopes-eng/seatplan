"""A signed-in account holder's event page (/guest/events/{eid}/...), section 6.5.

These routes mirror the personal-link routes of routers/attendee.py exactly:
same bodies, same answers, same errors. Both call the same functions
(events_service/attendee_view.py and seating.py), so they cannot drift apart.
The only difference is the door: here a guest session plus a guest row of
that event owned by the account, there a secret token in the URL.
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select

from app import db
from app.core.errors import ApiError
from app.events_service import attendee_view
from app.events_service.attendee_view import event_of
from app.events_service.recommend import recommendations
from app.events_service.schemas import KnowsIn, PrivacyIn, RsvpIn, SeatChoice
from app.events_service.seating import confirm_seat, hold_seat, release_seat
from app.models import Event, Guest
from app.security import CurrentGuestAccount, client_ip, rate_limit

router = APIRouter(prefix="/guest/events/{eid}", tags=["guest accounts"])

REQUESTS_PER_MINUTE = 120
MAX_SEARCH_LENGTH = 60
NOT_A_GUEST = "You are not on the guest list of this event."


def load_account_guest(
    eid: str, account: CurrentGuestAccount, request: Request, session: db.SessionDep
) -> Guest:
    """Dependency: the account's not-erased guest row on event `eid`, or 404."""
    rate_limit(session, f"guest-events:{client_ip(request)}", REQUESTS_PER_MINUTE, 60)
    guest = session.scalars(
        select(Guest)
        .join(Event, Event.id == Guest.event_id)
        .where(
            (Event.public_id == eid)
            & (Guest.account_id == account.id)
            & Guest.token_revoked_at.is_(None)
        )
    ).first()
    if guest is None:
        raise ApiError(404, "not_found", NOT_A_GUEST)
    return guest


AccountGuest = Annotated[Guest, Depends(load_account_guest)]


@router.get("")
def get_page(me: AccountGuest, session: db.SessionDep) -> dict[str, Any]:
    return attendee_view.page(session, me)


@router.get("/people")
def search_people(
    me: AccountGuest,
    session: db.SessionDep,
    q: Annotated[str, Query(max_length=MAX_SEARCH_LENGTH)] = "",
) -> list[dict[str, Any]]:
    return attendee_view.people(session, event_of(session, me), me, q.strip())


@router.post("/rsvp")
def set_rsvp(body: RsvpIn, me: AccountGuest, session: db.SessionDep) -> dict[str, Any]:
    return attendee_view.set_rsvp(session, me, body.rsvp, None)


@router.post("/knows")
def set_knows(body: KnowsIn, me: AccountGuest, session: db.SessionDep) -> dict[str, Any]:
    return attendee_view.set_knows(session, me, body.guest_ids)


@router.post("/privacy")
def set_privacy(body: PrivacyIn, me: AccountGuest, session: db.SessionDep) -> dict[str, Any]:
    return attendee_view.set_privacy(session, me, body.wants_anonymous)


@router.get("/recommendations")
def get_recommendations(me: AccountGuest, session: db.SessionDep) -> list[dict[str, Any]]:
    return recommendations(session, event_of(session, me), me)


@router.post("/hold")
def hold(body: SeatChoice, me: AccountGuest, session: db.SessionDep) -> dict[str, Any]:
    hold_row = hold_seat(session, event_of(session, me), me, body.seat_id)
    return {"seat_id": hold_row.resource_id, "expires_at": hold_row.expires_at}


@router.post("/confirm")
def confirm(body: SeatChoice, me: AccountGuest, session: db.SessionDep) -> dict[str, Any]:
    # No token: the email links to the signed-in seat page (mailer.account_link).
    row = confirm_seat(session, event_of(session, me), me, body.seat_id, None)
    return {"seat_id": row.seat_id, "source": row.source}


@router.delete("/seat")
def release(me: AccountGuest, session: db.SessionDep) -> dict[str, Any]:
    release_seat(session, event_of(session, me), me, None)
    return {"seat_id": None}
