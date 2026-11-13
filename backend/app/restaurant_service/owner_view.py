"""Private owner cards and their six setup steps."""

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Organiser, ServicePeriod, Venue, VenuePhoto, VenueTable


def restaurant_card(session: Session, venue: Venue) -> dict[str, Any]:
    cover = session.scalar(
        select(VenuePhoto.public_id)
        .where(VenuePhoto.venue_id == venue.id, VenuePhoto.kind == "gallery")
        .order_by(VenuePhoto.is_cover.desc(), VenuePhoto.position, VenuePhoto.id)
        .limit(1)
    )
    hours = session.scalar(
        select(ServicePeriod.id).where(ServicePeriod.venue_id == venue.id).limit(1)
    )
    table = session.scalar(
        select(VenueTable.id).where(VenueTable.venue_id == venue.id, VenueTable.is_active).limit(1)
    )
    steps = {
        "identity": bool(venue.name and venue.cuisines and venue.price_level),
        "location": bool(venue.address and venue.lat is not None and venue.lng is not None),
        "photos": cover is not None,
        "hours": hours is not None,
        "rooms": table is not None,
        "review": venue.status == "published",
    }
    return {
        "public_id": venue.public_id,
        "slug": venue.slug,
        "name": venue.name,
        "status": venue.status,
        "cover_url": f"/api/photos/{cover}" if cover else None,
        "setup": {
            "done": sum(steps.values()),
            "total": len(steps),
            "missing": [key for key, done in steps.items() if not done],
        },
    }


def restaurants(session: Session, owner: Organiser) -> list[dict[str, Any]]:
    venues = session.scalars(
        select(Venue)
        .where(Venue.organiser_id == owner.id, Venue.kind == "restaurant")
        .order_by(Venue.id)
    )
    return [restaurant_card(session, venue) for venue in venues]
