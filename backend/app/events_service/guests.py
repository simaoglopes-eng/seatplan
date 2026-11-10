"""The organiser's guest list: add, change, erase, and send a fresh link.

Erasing a guest (GDPR "right to erasure") keeps an empty row so ids in old
plan snapshots still point somewhere, but every piece of personal data is
overwritten and the personal link stops working for good.
"""

from typing import Any

from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from app.core import audit
from app.core.errors import ApiError
from app.events_service.access import attendee_link
from app.events_service.mailer import forget_guest_emails
from app.events_service.problem import current_rows, event_guests
from app.events_service.schemas import GuestIn
from app.events_service.seating import drop_assignment, lock_event
from app.models import Acquaintance, Event, Guest, GuestGroup, Organiser, utc_now
from app.security import hash_token, new_token

ERASED_NAME = "Deleted guest"


def group_names(session: Session, event: Event) -> dict[int, str]:
    groups = session.scalars(select(GuestGroup).where(GuestGroup.event_id == event.id))
    return {group.id: group.name for group in groups}


def guest_dict(guest: Guest, group: str | None, seat_id: int | None) -> dict[str, Any]:
    """Everything the ORGANISER may see about a guest. Never the token or its hash."""
    return {
        "id": guest.id,
        "name": guest.name,
        "email": guest.email,
        "group": group,
        "rsvp": guest.rsvp,
        "wants_anonymous": guest.wants_anonymous,
        "needs_accessible": guest.needs_accessible,
        "dietary_note": guest.dietary_note,
        "reserved_tag": guest.reserved_tag,
        "seat_id": seat_id,
    }


def list_guests(session: Session, event: Event) -> list[dict[str, Any]]:
    groups = group_names(session, event)
    rows = current_rows(session, event)
    return [
        guest_dict(
            guest,
            groups.get(guest.group_id) if guest.group_id else None,
            rows[guest.id].seat_id if guest.id in rows else None,
        )
        for guest in event_guests(session, event)
        if guest.token_revoked_at is None
    ]


def group_id_for(
    session: Session, event: Event, name: str | None, keep_adjacent: bool
) -> int | None:
    """The id of the event's group with this name, creating the group if needed."""
    if not name:
        return None
    query = select(GuestGroup).where((GuestGroup.event_id == event.id) & (GuestGroup.name == name))
    group = session.scalars(query).first()
    if group is None:
        group = GuestGroup(event_id=event.id, name=name, keep_adjacent=keep_adjacent)
        session.add(group)
        session.flush()
    return group.id


def email_in_use(session: Session, event: Event, email: str, except_id: int | None = None) -> bool:
    query = select(Guest.id).where((Guest.event_id == event.id) & (Guest.email == email))
    return any(found != except_id for found in session.scalars(query))


def add_guest(session: Session, event: Event, body: GuestIn) -> tuple[Guest, str]:
    """Add one guest. Returns the guest and their raw link token.

    The raw token is shown once; we only keep its hash, so a lost link is
    replaced with "new link", never looked up.
    """
    if body.email and email_in_use(session, event, body.email):
        raise ApiError(409, "conflict", f"{body.email} is already on the guest list.")
    token = new_token()
    guest = Guest(
        event_id=event.id,
        name=body.name.strip(),
        email=body.email,
        token_hash=hash_token(token),
        group_id=group_id_for(session, event, body.group, body.keep_adjacent),
        wants_anonymous=body.wants_anonymous,
        needs_accessible=body.needs_accessible,
        dietary_note=body.dietary_note,
        reserved_tag=body.reserved_tag,
    )
    session.add(guest)
    session.flush()
    return guest, token


def update_guest(
    session: Session, event: Event, guest: Guest, changes: dict[str, Any], user: Organiser
) -> None:
    """Apply only the fields the organiser sent. Answering "no" frees the seat."""
    if changes.get("email") and email_in_use(session, event, changes["email"], guest.id):
        raise ApiError(409, "conflict", f"{changes['email']} is already on the guest list.")
    lock_event(session, event)  # before any other write, see seating.py
    if "group" in changes:
        guest.group_id = group_id_for(session, event, changes.pop("group"), False)
    for name, value in changes.items():
        setattr(guest, name, value)
    if guest.rsvp == "no":
        drop_assignment(session, event, guest, actor=user.email)
    audit.record(
        session,
        actor=user.email,
        action="guest.update",
        entity="guest",
        entity_id=str(guest.id),
        detail={"fields": sorted(changes)},
    )


def erase_guest(session: Session, event: Event, guest: Guest, user: Organiser) -> None:
    """GDPR delete: free the seat, forget who knows whom, overwrite personal data.

    The address goes first, so freeing the seat cannot queue a "your seat was
    released" email to someone who asked to be forgotten. Their earlier emails
    in the outbox are wiped too.
    """
    lock_event(session, event)  # before any other write, see seating.py
    guest.email = None
    drop_assignment(session, event, guest, actor=user.email)
    forget_guest_emails(session, event, guest.id)
    session.execute(
        delete(Acquaintance).where(
            or_(Acquaintance.guest_id == guest.id, Acquaintance.knows_guest_id == guest.id)
        )
    )
    guest.name = ERASED_NAME
    guest.dietary_note = None
    guest.needs_accessible = False
    guest.reserved_tag = None
    guest.wants_anonymous = True
    guest.group_id = None
    guest.rsvp = "no"
    # A random hash nobody holds the token for: the old link can never match.
    guest.token_hash = hash_token(new_token())
    guest.token_revoked_at = utc_now()
    # The audit row names only the id: writing the name here would undo the erasure.
    audit.record(
        session, actor=user.email, action="guest.erase", entity="guest", entity_id=str(guest.id)
    )


def new_link(session: Session, event: Event, guest: Guest, user: Organiser) -> dict[str, str]:
    """Replace the guest's token. The old link stops working at once."""
    token = new_token()
    guest.token_hash = hash_token(token)
    audit.record(
        session, actor=user.email, action="guest.new_link", entity="guest", entity_id=str(guest.id)
    )
    return {"token": token, "link": attendee_link(token)}
