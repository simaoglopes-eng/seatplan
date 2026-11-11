"""The shared link of an event (/j/{token}), docs/guest-accounts.md section 6.2.

Anyone with the link is a visitor: they may look at the event and its live
map, never hold or confirm a seat (there is no such route here). To take a
place they create a guest account (register, then /guest/verify), or, when
they already have one, sign in and call join.
"""

from typing import Any

from fastapi import APIRouter, Request

from app import db
from app.core.errors import ApiError
from app.events_service import accounts, share
from app.events_service.schemas import EmptyIn, RegisterIn
from app.security import CurrentGuestAccount, client_ip, rate_limit

router = APIRouter(tags=["visitor"])

# A whole room may share one network address (one Wi-Fi), and every open
# page refreshes the map when it changes, so this limit is generous.
VIEWS_PER_MINUTE = 600
JOIN_CALLS_PER_MINUTE = 30
# join status -> (HTTP status, error code, message)
_ERRORS = {
    "event_full": (409, "event_full", "This event is full. Every place has a guest."),
    "deadline_passed": (409, "deadline_passed", "Seat choices for this event have closed."),
    "link_closed": (403, "link_closed", share.LINK_CLOSED),
    "removed": (403, "forbidden", share.REMOVED),
}


def _refuse(status: str) -> None:
    """Turn a join status that is not a success into the matching error."""
    if status in _ERRORS:
        http_status, code, message = _ERRORS[status]
        raise ApiError(http_status, code, message)


@router.get("/j/{token}")
def visitor_page(token: str, request: Request, session: db.SessionDep) -> dict[str, Any]:
    rate_limit(session, f"share-view:{client_ip(request)}", VIEWS_PER_MINUTE, 60)
    return share.visitor_view(session, share.load_shared_event(session, token))


@router.post("/j/{token}/register", status_code=202)
def register(
    token: str, body: RegisterIn, request: Request, session: db.SessionDep
) -> dict[str, Any]:
    """Email a code (or an "you already have an account" note). Same answer either way.

    A full event does not refuse here: an invited guest may still make an
    account to reach their invitation, and refusing only the others would
    tell strangers who is on the guest list. The join step decides.
    """
    email = accounts.normalise_email(body.email)
    if not body.name.strip():
        raise ApiError(422, "validation", "name: Type your name.")
    accounts.check_new_password(body.password, email)
    # The link and the deadline first (reads only), so requests with a wrong
    # link cannot use up anyone's code limits.
    event = share.load_shared_event(session, token)
    if share.join_state(session, event)["reason"] == "deadline_passed":
        _refuse("deadline_passed")
    accounts.count_code_send(session, request, email, "register")
    accounts.count_app_send(session)
    form = accounts.SignUp(body.name.strip(), email, body.password, body.needs_accessible)
    show_code = accounts.may_show_code(session, email)
    key, code, signup_id = accounts.start_sign_up(session, event, form, show_code)
    accounts.send_at_once(session, key)
    return accounts.code_sent(email, code, signup_id)


@router.post("/j/{token}/join")
def join_event(
    token: str,
    account: CurrentGuestAccount,
    request: Request,
    session: db.SessionDep,
    body: EmptyIn | None = None,
) -> dict[str, Any]:
    """A signed-in account holder joins the event of this link."""
    rate_limit(session, f"share-join-call:{client_ip(request)}", JOIN_CALLS_PER_MINUTE, 60)
    event = share.load_shared_event(session, token)
    share.count_new_join(session, event, account.email, account)
    result = share.join(session, event, account)
    session.commit()
    _refuse(result["status"])
    return result
