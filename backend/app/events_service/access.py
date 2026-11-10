"""Finding the event or guest a request is about, and who may touch it.

Two doors lead in: the organiser's login (load_event) and the attendee's
personal link (load_guest). Both answer "not found" for anything the caller
may not see, so a wrong id and a forbidden id look exactly the same.
"""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models import Event, Guest, Organiser, Venue, utc_now
from app.security import hash_token

# Personal-link tokens are 43 characters; anything far longer is not ours and
# is refused before we spend time hashing it.
MAX_TOKEN_LENGTH = 128
LINK_NOT_VALID = "This link is not valid. Please ask the organiser for a new one."


def event_scope(event: Event) -> str:
    """The live-update scope every write to this event bumps."""
    return f"event-{event.public_id}"


def attendee_link(token: str) -> str:
    """The page an attendee opens (a frontend route, see docs/decisions-log.md)."""
    return f"/e/{token}"


def load_event(session: Session, public_id: str, user: Organiser) -> Event:
    """The event if this organiser owns it, else 404 (missing and forbidden look alike)."""
    event = session.scalars(select(Event).where(Event.public_id == public_id)).first()
    if event is None or event.organiser_id != user.id:
        raise ApiError(404, "not_found", "Event not found.")
    return event


def load_venue(session: Session, event: Event) -> Venue:
    venue = session.get(Venue, event.venue_id)
    if venue is None:
        raise ApiError(404, "not_found", "Venue not found.")
    return venue


def load_guest(session: Session, token: str) -> Guest:
    """The guest behind a personal link.

    We look the link up by its SHA-256 hash, so the database never holds the
    link itself. A wrong token, an old token replaced by a new link, and a
    revoked token all give the very same 404, so nobody can learn which links
    once existed.
    """
    if not token or len(token) > MAX_TOKEN_LENGTH:
        raise ApiError(404, "not_found", LINK_NOT_VALID)
    guest = session.scalars(select(Guest).where(Guest.token_hash == hash_token(token))).first()
    if guest is None or guest.token_revoked_at is not None:
        raise ApiError(404, "not_found", LINK_NOT_VALID)
    return guest


def load_event_guest(session: Session, event: Event, guest_id: int) -> Guest:
    """A guest of this event, for the organiser. Erased guests count as gone."""
    guest = session.get(Guest, guest_id)
    if guest is None or guest.event_id != event.id or guest.token_revoked_at is not None:
        raise ApiError(404, "not_found", "Guest not found.")
    return guest


def is_active(guest: Guest) -> bool:
    """Still coming: not erased and not answered "no"."""
    return guest.token_revoked_at is None and guest.rsvp != "no"


def deadline_passed(event: Event, now: datetime | None = None) -> bool:
    if event.change_deadline is None:
        return False
    return (now or utc_now()) > event.change_deadline


def require_before_deadline(event: Event) -> None:
    """Attendees may only change their seat or answer until the change deadline."""
    if deadline_passed(event):
        raise ApiError(
            409,
            "deadline_passed",
            "The deadline for changes has passed. Please contact the organiser.",
        )
