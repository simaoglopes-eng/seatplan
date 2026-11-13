"""The facts shown on search cards: sun, view, accessible, terrace (spec 9.1).

Worked out from the saved rooms and tables, stored on `venues.features`, and
refreshed whenever rooms are saved and when a restaurant is published. They only
ever claim what the rooms support: no north means no sun, a window that "never"
gets sun does not count, and a window facing away from the sun does not either.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ambience.light import LIGHT_WINDOWS, opening_facing
from app.models import Venue, VenueTable
from app.restaurant_service import ambience_view

# A window "gets sun" when it looks between east and west by the south.
SUN_FROM, SUN_UNTIL = 90.0, 270.0


def compute_features(session: Session, venue: Venue) -> dict[str, bool]:
    """The four features of a restaurant, from its saved rooms and tables."""
    loaded = ambience_view.load_rooms(session, venue)
    sun = view = terrace = False
    for entry in loaded:
        room = entry.room
        terrace = terrace or room.is_outdoor
        sun = sun or room.is_outdoor
        for opening in room.openings:
            if opening.kind not in LIGHT_WINDOWS:
                continue
            if opening.view_text.strip() or opening.view_tags:
                view = True
            if opening.sun_rule == "never" or room.north_deg is None:
                continue
            facing = opening_facing(room, opening)
            if facing is not None and SUN_FROM <= facing <= SUN_UNTIL:
                sun = True
    accessible = (
        session.scalar(
            select(VenueTable.id)
            .where(VenueTable.venue_id == venue.id, VenueTable.is_active, VenueTable.is_accessible)
            .limit(1)
        )
        is not None
    )
    return {"sun": sun, "view": view, "accessible": accessible, "terrace": terrace}


def refresh_features(session: Session, venue: Venue) -> None:
    """Store the features on the venue. Does not commit."""
    venue.features = compute_features(session, venue)
