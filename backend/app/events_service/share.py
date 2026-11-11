"""An event's shared link (/j/<token>): the token, places left, the visitor's map, joining.

The organiser switches the link on and passes it around. Anyone who opens it
is a visitor: they see the event and the live map, nothing they could act on.
To take a place they need a guest account (events_service/accounts.py), and
join() below is the one step that puts an account on the guest list.

The token is not stored. It is worked out from SECRET_KEY, the event's public
id and a version number (docs/guest-accounts.md, D2), so the organiser can
see it again at any time. Only its SHA-256 hash is kept, to find the event.
"Make a new link" adds 1 to the version, which changes the token.
"""

import base64
import hashlib
import hmac
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core import audit
from app.core.errors import ApiError
from app.core.privacy import display_name
from app.events_service.access import (
    MAX_TOKEN_LENGTH,
    deadline_passed,
    load_venue,
)
from app.events_service.attendee_view import event_summary
from app.events_service.problem import active_guests, current_rows, event_guests, venue_seats
from app.events_service.seating import lock_event
from app.events_service.seatmap import live_holds, map_frame, seat_base
from app.models import Event, Guest, GuestAccount, Seat, Venue
from app.security import hash_token, new_token, rate_limit, tokens_match

LINK_NOT_VALID = (
    "This link does not work. It may have been replaced by a new one. "
    "Ask the organiser for the current link."
)
LINK_CLOSED = "The organiser is not taking new guests through this link at the moment."
REMOVED = "The organiser removed you from this event. Ask them if you think this is a mistake."
# New guest rows through one event's link (docs/guest-accounts.md, 8.1).
JOINS_PER_HOUR = 30
MEMBER_STATUSES = ("joined", "linked", "already_member")

# ---------------------------------------------------------------- the token


def derive_token(event: Event) -> str:
    """HMAC-SHA256(SECRET_KEY, "share-link:<public id>:<version>"), url-safe, 43 characters."""
    key = get_settings().secret_key.encode("utf-8")
    message = f"share-link:{event.public_id}:{event.share_version}".encode()
    digest = hmac.new(key, message, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def needs_new_link(event: Event) -> bool:
    """True when the stored hash no longer matches: SECRET_KEY changed since."""
    if event.share_token_hash is None:
        return False
    return not tokens_match(event.share_token_hash, hash_token(derive_token(event)))


def share_path(event: Event) -> str | None:
    """ "/j/<token>", or None when the link was never made or must be made again."""
    if event.share_token_hash is None or needs_new_link(event):
        return None
    return f"/j/{derive_token(event)}"


def switch_on(event: Event) -> None:
    """Turn the link on. The first time, this stores the hash of version 0."""
    event.share_enabled = True
    if event.share_token_hash is None:
        event.share_token_hash = hash_token(derive_token(event))


def regenerate(event: Event) -> None:
    """A new token: the old link stops working at once. Joined guests keep their rows."""
    event.share_version += 1
    event.share_token_hash = hash_token(derive_token(event))


def load_shared_event(session: Session, token: str) -> Event:
    """The event behind a shared link: 404 when wrong or replaced, 403 when switched off.

    A replaced link cannot be told apart from a wrong one, because only the
    newest hash is stored. A link made before SECRET_KEY changed still finds
    its event by hash, so we also check it is the token we would make today.
    """
    if not token or len(token) > MAX_TOKEN_LENGTH:
        raise ApiError(404, "not_found", LINK_NOT_VALID)
    event = session.scalars(
        select(Event).where(Event.share_token_hash == hash_token(token))
    ).first()
    if event is None or not tokens_match(token, derive_token(event)):
        raise ApiError(404, "not_found", LINK_NOT_VALID)
    if not event.share_enabled:
        raise ApiError(403, "link_closed", LINK_CLOSED)
    return event


# ---------------------------------------------------------------- places left


def _open_seats(session: Session, event: Event) -> tuple[int, int]:
    """(seats not blocked, of those the ones reserved for a tag)."""
    seats = session.scalars(
        select(Seat).where((Seat.venue_id == event.venue_id) & Seat.is_blocked.is_(False))
    ).all()
    return len(seats), sum(1 for seat in seats if seat.reserved_tag is not None)


def place_counts(session: Session, event: Event) -> dict[str, int]:
    """capacity (seats not blocked), guests (active) and joined (active, by the link)."""
    capacity, _reserved = _open_seats(session, event)
    coming = active_guests(session, event)
    return {
        "capacity": capacity,
        "guests": len(coming),
        "joined": sum(1 for guest in coming if guest.source == "self_registered"),
    }


def _seats_for_newcomers(session: Session, event: Event) -> int:
    """Seats someone joining with the link could still sit on.

    A newcomer has no tag, so seats reserved for a tag are not theirs. Every
    active guest without a tag needs one of the other seats; guests with a
    tag sit on the reserved seats first and only spill over when there are
    more of them than reserved seats.
    """
    capacity, reserved = _open_seats(session, event)
    coming = active_guests(session, event)
    tagged = sum(1 for guest in coming if guest.reserved_tag is not None)
    untagged = len(coming) - tagged
    spill_over = max(0, tagged - reserved)
    return (capacity - reserved) - untagged - spill_over


def places_left(session: Session, event: Event) -> int:
    """How many more people may join: never more guests than seats they can
    use, and never more than the cap.

    Invited guests who have not answered yet still count, so their places
    are kept for them.
    """
    counts = place_counts(session, event)
    left = min(counts["capacity"] - counts["guests"], _seats_for_newcomers(session, event))
    if event.share_cap is not None:
        left = min(left, event.share_cap - counts["joined"])
    return max(0, left)


def room_to_come_back(session: Session, event: Event, guest: Guest) -> bool:
    """May this guest change "no" back to "yes" without breaking the rules?

    While they said no they did not count, and someone may have joined with
    the link in their place. Coming back must not make more guests than
    seats once the link has brought people in, nor go past the cap.
    Call after lock_event, so the counts are fresh.
    """
    counts = place_counts(session, event)
    link_used = counts["joined"] > 0 or guest.source == "self_registered"
    if link_used and counts["guests"] >= counts["capacity"]:
        return False
    if guest.source == "self_registered" and event.share_cap is not None:
        return counts["joined"] < event.share_cap
    return True


def join_state(session: Session, event: Event) -> dict[str, Any]:
    """The visitor's "can I join?" panel: open, places left, and why not."""
    left = places_left(session, event)
    reason = None
    if deadline_passed(event):
        reason = "deadline_passed"
    elif left == 0:
        reason = "full"
    is_open = event.share_enabled and reason is None
    return {"open": is_open, "places_left": left if is_open else 0, "reason": reason}


def share_settings(session: Session, event: Event) -> dict[str, Any]:
    """ShareSettings for the organiser (docs/guest-accounts.md, 6.3)."""
    return {
        "enabled": event.share_enabled,
        "link": share_path(event),
        "needs_new_link": needs_new_link(event),
        "cap": event.share_cap,
        **place_counts(session, event),
        "places_left": places_left(session, event),
    }


# ---------------------------------------------------------------- what a visitor sees


def _visitor_state(seat: Seat, taken: bool, held: bool) -> str:
    """A visitor has no tag, so a reserved seat is simply not available to them."""
    if taken:
        return "taken"
    if seat.is_blocked or seat.reserved_tag is not None:
        return "blocked"
    return "held" if held else "free"


def visitor_map(session: Session, event: Event, venue: Venue) -> dict[str, Any]:
    """The seat map with four states and privacy-filtered names. No ids of people."""
    owner_of = {row.seat_id: row.guest_id for row in current_rows(session, event).values()}
    guests = {guest.id: guest for guest in event_guests(session, event)}
    holds = live_holds(session, event)
    seats = []
    for seat in venue_seats(session, venue.id):
        owner = guests.get(owner_of[seat.id]) if seat.id in owner_of else None
        occupant = None
        if owner is not None:
            occupant = display_name(owner.name, event.privacy_mode, owner.wants_anonymous)
        state = _visitor_state(seat, owner is not None, seat.id in holds)
        seats.append({**seat_base(seat), "state": state, "occupant": occupant})
    return {**map_frame(session, venue), "seats": seats}


def visitor_view(session: Session, event: Event) -> dict[str, Any]:
    venue = load_venue(session, event)
    return {
        "event": event_summary(event),
        "venue": {"name": venue.name},
        "map": visitor_map(session, event, venue),
        "join": join_state(session, event),
    }


# ---------------------------------------------------------------- joining


def _member_row(session: Session, event: Event, account_id: int | None) -> Guest | None:
    if account_id is None:
        return None
    query = select(Guest).where(
        (Guest.event_id == event.id)
        & (Guest.account_id == account_id)
        & Guest.token_revoked_at.is_(None)
    )
    return session.scalars(query).first()


def _invited_row(session: Session, event: Event, email: str) -> Guest | None:
    """A not-erased guest row with no account and this address, ignoring case.

    Compared in Python, because SQLite's lower() only knows A to Z.
    """
    query = select(Guest).where(
        (Guest.event_id == event.id)
        & Guest.account_id.is_(None)
        & Guest.token_revoked_at.is_(None)
        & Guest.email.is_not(None)
    )
    return next(
        (row for row in session.scalars(query) if (row.email or "").strip().lower() == email),
        None,
    )


def invited_anywhere(session: Session, email: str) -> bool:
    """Is this address on any organiser's guest list, not yet linked to an account?"""
    query = select(Guest.id).where(
        (func.lower(Guest.email) == email)
        & Guest.account_id.is_(None)
        & Guest.token_revoked_at.is_(None)
    )
    return session.scalars(query).first() is not None


def _was_removed(session: Session, event: Event, account_id: int | None) -> bool:
    """Did the organiser remove this account's row from the event (guests.erase_guest)?"""
    if account_id is None:
        return False
    query = select(Guest.id).where(
        (Guest.event_id == event.id)
        & (Guest.account_id == account_id)
        & Guest.token_revoked_at.is_not(None)
    )
    return session.scalars(query).first() is not None


def _status_without_new_row(
    session: Session, event: Event, account: GuestAccount | None, email: str
) -> tuple[str | None, Guest | None]:
    """What join() answers when no new row is needed, else (None, None).

    `account` is None while the account is not made yet (sign-up).
    """
    account_id = account.id if account is not None else None
    if not event.share_enabled:
        return "link_closed", None
    if deadline_passed(event):
        return "deadline_passed", None
    if _member_row(session, event, account_id) is not None:
        return "already_member", None
    if _was_removed(session, event, account_id):
        return "removed", None
    # Only an address proven through the inbox may take over an invitation.
    proven = account.email_proven if account is not None else True
    invited = _invited_row(session, event, email) if proven else None
    if invited is not None:
        return "linked", invited
    return None, None


def count_new_join(
    session: Session, event: Event, email: str, account: GuestAccount | None
) -> None:
    """Count a new guest row against the event's hourly limit, or 429. Commits.

    Called before the caller's first write (rate_limit commits). Joins that
    add no row (already a member, linking an invitation) are not counted.
    """
    status, _ = _status_without_new_row(session, event, account, email)
    if status is None:
        rate_limit(session, f"share-join:{event.id}", JOINS_PER_HOUR, 3600)


def _add_self_registered(
    session: Session, event: Event, account: GuestAccount, needs_accessible: bool
) -> Guest:
    guest = Guest(
        event_id=event.id,
        name=account.name,
        email=account.email,
        # A hash of a token nobody is given: this guest has no personal link
        # until the organiser presses "New link" for them.
        token_hash=hash_token(new_token()),
        source="self_registered",
        account_id=account.id,
        rsvp="yes",
        needs_accessible=needs_accessible,
    )
    session.add(guest)
    session.flush()
    audit.record(
        session,
        actor=f"account:{account.id}",
        action="guest.self_register",
        entity="guest",
        entity_id=str(guest.id),
    )
    return guest


def join(
    session: Session, event: Event, account: GuestAccount, needs_accessible: bool = False
) -> dict[str, Any]:
    """Put the account on the event's guest list, if allowed. No commit.

    The event lock comes first, then every check is made again on fresh
    data: two people joining for the last place wait for each other at the
    lock, and the second one counts the first one's new row.
    """
    lock_event(session, event)
    session.refresh(event)  # the switch or the cap may have changed meanwhile
    status, invited = _status_without_new_row(session, event, account, account.email)
    if status == "linked" and invited is not None:
        # Linking is safe: this account's address was proven by an emailed code.
        invited.account_id = account.id
        audit.record(
            session,
            actor=f"account:{account.id}",
            action="guest.link_account",
            entity="guest",
            entity_id=str(invited.id),
        )
    elif status is None:
        if places_left(session, event) == 0:
            status = "event_full"
        else:
            _add_self_registered(session, event, account, needs_accessible)
            status = "joined"
    event_id = event.public_id if status in MEMBER_STATUSES else None
    return {"status": status, "event_id": event_id}
