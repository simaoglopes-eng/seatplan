"""Find the restaurant named in the URL, for diners and for staff."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models import Organiser, Venue


def load_restaurant(session: Session, public_id: str) -> Venue:
    """Public lookup: any restaurant venue by its public id, else 404.

    Event venues answer 404 too, so the diner endpoints never reveal them.
    """
    venue = session.scalars(select(Venue).where(Venue.public_id == public_id)).first()
    if venue is None or venue.kind != "restaurant":
        raise ApiError(404, "not_found", "Restaurant not found.")
    return venue


def load_published(session: Session, public_id: str) -> Venue:
    """Diner lookup: only published restaurants. A draft or an unpublished one takes
    no new bookings and looks exactly like a restaurant that does not exist (404).
    Bookings that already exist are reached through their own manage links."""
    venue = load_restaurant(session, public_id)
    if venue.status != "published":
        raise ApiError(404, "not_found", "Restaurant not found.")
    return venue


def load_for_staff(session: Session, public_id: str, user: Organiser) -> Venue:
    """Owners see their restaurants, demo staff only demo restaurants.

    Forbidden looks the same as missing (404).
    """
    venue = load_restaurant(session, public_id)
    if (user.role == "staff" and not venue.is_demo) or (
        user.role != "staff" and venue.organiser_id != user.id
    ):
        raise ApiError(404, "not_found", "Restaurant not found.")
    return venue
