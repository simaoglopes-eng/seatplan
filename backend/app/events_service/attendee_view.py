"""What an attendee sees: their page, the people list and their own details.

Two doors lead here with the same Guest row: the personal link
(routers/attendee.py, /a/{token}) and a signed-in guest account
(routers/guest_events.py, /guest/events/{eid}). Keeping the logic in one
place means both doors always show exactly the same thing.

What leaves this file about OTHER people is limited to privacy-filtered names
and seat states.
"""

from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core import audit
from app.core.errors import ApiError
from app.core.privacy import display_name
from app.events_service.access import (
    deadline_passed,
    event_scope,
    is_active,
    load_venue,
    require_before_deadline,
)
from app.events_service.problem import current_rows, event_guests
from app.events_service.seating import drop_assignment, lock_event
from app.events_service.seatmap import attendee_map, holder_key, known_ids
from app.models import Acquaintance, Event, Guest, Hold, utc_now


def event_of(session: Session, guest: Guest) -> Event:
    event = session.get(Event, guest.event_id)
    if event is None:
        raise ApiError(404, "not_found", "Event not found.")
    return event


def event_summary(event: Event) -> dict[str, Any]:
    """The event as an attendee or a visitor sees it (no public id)."""
    return {
        "name": event.name,
        "starts_at": event.starts_at,
        "ends_at": event.ends_at,
        "privacy_mode": event.privacy_mode,
        "change_deadline": event.change_deadline,
        "deadline_passed": deadline_passed(event),
        "live_scope": event_scope(event),
    }


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


def me_dict(session: Session, event: Event, me: Guest) -> dict[str, Any]:
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


def page(session: Session, me: Guest) -> dict[str, Any]:
    """The whole attendee page (AttendeeView in the frontend)."""
    event = event_of(session, me)
    venue = load_venue(session, event)
    return {
        "venue": {"name": venue.name},
        "event": event_summary(event),
        "me": me_dict(session, event, me),
        "map": attendee_map(session, event, venue, me),
        "people": people(session, event, me),
    }


# ---------------------------------------------------------------- the attendee's own changes


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


def set_rsvp(session: Session, me: Guest, answer: str, token: str | None) -> dict[str, Any]:
    """Coming or not. "no" gives the seat back. Commits.

    `token` is the personal link's token when the guest came that way, so the
    "seat released" email can link back; None for a guest account.
    """
    # Imported here: share.py imports this module for event_summary.
    from app.events_service.share import room_to_come_back

    event = event_of(session, me)
    require_before_deadline(event)
    lock_event(session, event)  # before any other write, see seating.py
    # Counted after the lock: someone may have taken the place meanwhile.
    if answer == "yes" and me.rsvp == "no" and not room_to_come_back(session, event, me):
        raise ApiError(409, "event_full", "This event is full. Every place has a guest.")
    me.rsvp = answer
    if answer == "no":
        # Not coming: give the seat back so someone else can have it.
        drop_assignment(session, event, me, actor=f"guest:{me.id}", token=token)
    _record(session, me, "guest.rsvp", {"rsvp": answer})
    session.commit()
    return {"rsvp": me.rsvp}


def set_knows(session: Session, me: Guest, guest_ids: list[int]) -> dict[str, Any]:
    """Replace the list of people this attendee knows (same event only). Commits."""
    event = event_of(session, me)
    wanted = set(guest_ids) - {me.id}
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


def set_privacy(session: Session, me: Guest, wants_anonymous: bool) -> dict[str, Any]:
    """Show me as "Guest" to the others, or not. Commits."""
    event = event_of(session, me)
    lock_event(session, event)
    me.wants_anonymous = wants_anonymous
    _record(session, me, "guest.privacy", {"wants_anonymous": wants_anonymous})
    session.commit()
    return {
        "wants_anonymous": me.wants_anonymous,
        "shown_to_others_as": display_name(me.name, event.privacy_mode, me.wants_anonymous),
    }
