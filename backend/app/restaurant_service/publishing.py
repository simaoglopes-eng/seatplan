"""Publishing a restaurant (spec 5.3 step 6) and the facts shown on search cards.

`problems` is the server's own check, run again at every publish: the browser's
checklist is a convenience, never the source of truth. Each problem says what is
wrong and where to fix it. `compute_features` works out the four facts the
discovery page filters on (sun, view, accessible, terrace) from the saved rooms;
it runs whenever rooms are saved and when a restaurant is published.
"""

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ambience.validation import validate_rooms
from app.core import audit
from app.core.errors import ApiError
from app.models import ServicePeriod, Venue, VenuePhoto, utc_now
from app.restaurant_service import rooms
from app.restaurant_service.features import refresh_features

# Editor problems that stop publishing carry their own code; these are the links to fix them.
ROOM_FIX = "rooms"


def _fix(venue: Venue, page: str) -> str:
    return f"/owner/{venue.public_id}/{page}"


def _problem(venue: Venue, code: str, message: str, page: str) -> dict[str, str]:
    return {"code": code, "message": message, "fix_url": _fix(venue, page)}


def problems(session: Session, venue: Venue) -> list[dict[str, Any]]:
    """Everything that stops this restaurant being published, each with a link to fix it."""
    found: list[dict[str, Any]] = []
    if not (venue.name.strip() and venue.cuisines and venue.price_level):
        found.append(
            _problem(
                venue, "identity", "Add the name, 1 to 3 cuisines and the price level.", "profile"
            )
        )
    if not (venue.address and venue.lat is not None and venue.lng is not None):
        found.append(
            _problem(venue, "location", "Add the address and place the pin on the map.", "profile")
        )
    has_hours = session.scalar(
        select(ServicePeriod.id).where(ServicePeriod.venue_id == venue.id).limit(1)
    )
    if has_hours is None:
        found.append(
            _problem(venue, "hours", "Add at least one service to the opening hours.", "hours")
        )

    layout = rooms.view(session, venue)["rooms"]
    active = [t for room in layout for t in room["tables"] if t.get("is_active", True)]
    if not active:
        found.append(_problem(venue, "no_tables", "Add at least one table.", ROOM_FIX))
    for issue in validate_rooms(layout, for_publication=True):
        if issue["level"] == "error":
            found.append(
                {
                    "code": issue["code"],
                    "message": issue["message"],
                    "fix_url": _fix(venue, ROOM_FIX),
                }
                | {k: issue[k] for k in ("room_key", "table_keys") if k in issue}
            )
    return found


def review(session: Session, venue: Venue) -> dict[str, Any]:
    """The checklist the owner sees before publishing: what blocks it, and what is only a tip."""
    found = problems(session, venue)
    has_photo = session.scalar(
        select(VenuePhoto.id)
        .where(VenuePhoto.venue_id == venue.id, VenuePhoto.kind == "gallery")
        .limit(1)
    )
    tips = []
    if has_photo is None:
        tips.append(
            _problem(
                venue, "photos", "A photo of the restaurant helps diners choose you.", "photos"
            )
        )
    return {
        "name": venue.name,
        "slug": venue.slug,
        "status": venue.status,
        "ready": not found,
        "problems": found,
        "tips": tips,
    }


def publish(session: Session, venue: Venue, actor: str) -> dict[str, str]:
    """Publish, or 422 with the problems. Publishing twice changes nothing."""
    found = problems(session, venue)
    if found:
        raise PublishRefused(found)
    refresh_features(session, venue)
    if venue.status != "published" or venue.published_at is None:
        venue.status = "published"
        venue.published_at = utc_now()
    audit.record(
        session, actor=actor, action="restaurant.publish", entity="venue", entity_id=venue.public_id
    )
    session.commit()
    return {"status": "published", "url": f"/restaurants/{venue.slug}"}


def unpublish(session: Session, venue: Venue, actor: str) -> dict[str, str]:
    """Back to a draft: gone from search, no new bookings; existing bookings stay."""
    if venue.status != "draft":
        venue.status = "draft"
        audit.record(
            session,
            actor=actor,
            action="restaurant.unpublish",
            entity="venue",
            entity_id=venue.public_id,
        )
        session.commit()
    return {"status": "draft"}


class PublishRefused(ApiError):
    """422 with the list of problems, in the error and, as the spec says, at the top level."""

    def __init__(self, found: list[dict[str, Any]]) -> None:
        super().__init__(422, "validation", "This restaurant cannot be published yet.")
        self.problems = found
