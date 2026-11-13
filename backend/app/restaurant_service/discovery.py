"""Finding restaurants and the public restaurant page (spec 9.1, 9.2).

Search is done here in Python over the published restaurants: there are few of
them, accents and capitals are easy to ignore this way, and the same code works
on SQLite and Postgres. Only the restaurants of the requested page get their
photo and their free times looked up, unless "available" must look at all of them.
"""

import math
import re
import unicodedata
from dataclasses import dataclass
from datetime import date, time
from typing import Any
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.orm import Session, defer

from app.models import Room, Venue, VenuePhoto
from app.restaurant_service import photos
from app.restaurant_service.availability import PartyNeeds, max_party, slot_statuses
from app.restaurant_service.schedule_edit import read_schedule

FEATURES = ("sun", "view", "accessible", "terrace")
NEXT_TIMES = 3
# "Available" means a free seating at most this long from the time asked.
AVAILABLE_WITHIN_MIN = 60
EARTH_RADIUS_M = 6_371_000.0


@dataclass(frozen=True)
class Search:
    q: str = ""
    cuisines: tuple[str, ...] = ()
    prices: tuple[int, ...] = ()
    features: tuple[str, ...] = ()
    lat: float | None = None
    lng: float | None = None
    day: date | None = None
    at: time | None = None
    party: int | None = None
    available: bool = False
    limit: int = 20
    offset: int = 0


def fold(text: str) -> str:
    """Lower case, no accents, single spaces: what search compares."""
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", plain.lower()).strip()


def distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in metres (haversine)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (
        math.sin((p2 - p1) / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))


def _haystack(venue: Venue) -> str:
    return fold(" ".join([venue.name, *venue.cuisines]))


def _matches(venue: Venue, search: Search) -> bool:
    if search.q and not all(token in _haystack(venue) for token in fold(search.q).split(" ")):
        return False
    if search.cuisines and not set(search.cuisines) & set(venue.cuisines):
        return False
    if search.prices and venue.price_level not in search.prices:
        return False
    have = venue.features or {}
    return all(have.get(feature) for feature in search.features)


def _distance(venue: Venue, search: Search) -> float | None:
    if search.lat is None or search.lng is None or venue.lat is None or venue.lng is None:
        return None
    return distance_m(search.lat, search.lng, venue.lat, venue.lng)


def _minutes(moment: time) -> int:
    return moment.hour * 60 + moment.minute


def next_times(session: Session, venue: Venue, search: Search) -> list[str]:
    """The seatings closest to the time asked that still have a table, nearest first."""
    if search.day is None or search.at is None or search.party is None:
        return []
    needs = PartyNeeds(search.party)
    if search.party > max_party(session, venue):
        return []
    wanted = _minutes(search.at)
    free = [
        (abs(_minutes(time.fromisoformat(slot["time"])) - wanted), slot["time"])
        for slot in slot_statuses(session, venue, search.day, needs)
        if slot["status"] != "full"
    ]
    free.sort()
    return [moment for _, moment in free[:NEXT_TIMES]]


def _close_enough(times: list[str], search: Search) -> bool:
    if search.at is None:
        return False
    wanted = _minutes(search.at)
    return any(abs(_minutes(time.fromisoformat(t)) - wanted) <= AVAILABLE_WITHIN_MIN for t in times)


def _covers(session: Session, venue_ids: list[int]) -> dict[int, VenuePhoto]:
    if not venue_ids:
        return {}
    rows = session.scalars(
        select(VenuePhoto)
        .options(defer(VenuePhoto.data))
        .where(VenuePhoto.venue_id.in_(venue_ids), VenuePhoto.kind == "gallery")
        .order_by(VenuePhoto.venue_id, VenuePhoto.position, VenuePhoto.id)
    )
    found: dict[int, VenuePhoto] = {}
    for photo in rows:
        best = found.get(photo.venue_id)
        if best is None or (photo.is_cover and not best.is_cover):
            found[photo.venue_id] = photo
    return found


def _card(
    venue: Venue, cover: VenuePhoto | None, meters: float | None, times: list[str]
) -> dict[str, Any]:
    return {
        "slug": venue.slug,
        "public_id": venue.public_id,
        "name": venue.name,
        "cuisines": list(venue.cuisines),
        "price_level": venue.price_level,
        "cover_url": photos.metadata(cover)["url"] if cover else None,
        "cover_alt": cover.alt_text if cover else None,
        "address": venue.address,
        "lat": venue.lat,
        "lng": venue.lng,
        "distance_m": None if meters is None else round(meters),
        "features": {name: bool((venue.features or {}).get(name)) for name in FEATURES},
        "next_times": times,
    }


def search_restaurants(session: Session, search: Search) -> dict[str, Any]:
    venues = session.scalars(
        select(Venue).where(Venue.kind == "restaurant", Venue.status == "published")
    ).all()
    found = [(venue, _distance(venue, search)) for venue in venues if _matches(venue, search)]
    # Nearest first when we know where the diner is; restaurants without a pin go last.
    found.sort(
        key=lambda item: (
            item[1] is None,
            item[1] if item[1] is not None else 0.0,
            fold(item[0].name),
        )
    )
    times: dict[int, list[str]] = {}
    if search.available and search.day is not None:
        kept = []
        for venue, meters in found:
            times[venue.id] = next_times(session, venue, search)
            if _close_enough(times[venue.id], search):
                kept.append((venue, meters))
        found = kept
    page = found[search.offset : search.offset + search.limit]
    covers = _covers(session, [venue.id for venue, _ in page])
    items = []
    for venue, meters in page:
        if venue.id not in times:
            times[venue.id] = next_times(session, venue, search)
        items.append(_card(venue, covers.get(venue.id), meters, times[venue.id]))
    return {"items": items, "total": len(found)}


def maps_url(venue: Venue) -> str:
    if venue.google_maps_url:
        return venue.google_maps_url
    if venue.lat is not None and venue.lng is not None:
        query = f"{venue.lat},{venue.lng}"
    else:
        query = f"{venue.name} {venue.address}".strip()
    return f"https://www.google.com/maps/search/?api=1&query={quote(query)}"


def public_page(session: Session, venue: Venue, *, preview: bool) -> dict[str, Any]:
    gallery = [p for p in photos.listing(session, venue) if p.kind == "gallery"]
    rooms = session.scalars(
        select(Room).where(Room.venue_id == venue.id).order_by(Room.position, Room.id)
    )
    return {
        "slug": venue.slug,
        "public_id": venue.public_id,
        "name": venue.name,
        "preview": preview,
        "description": venue.description,
        "cuisines": list(venue.cuisines),
        "price_level": venue.price_level,
        "address": venue.address,
        "lat": venue.lat,
        "lng": venue.lng,
        "phone": venue.phone,
        "website": venue.website,
        "instagram": venue.instagram,
        "timezone": venue.timezone,
        "features": {name: bool((venue.features or {}).get(name)) for name in FEATURES},
        "rooms_summary": [room.name for room in rooms],
        "photos": [
            {"url": f"/api/photos/{p.public_id}", "alt": p.alt_text, "is_cover": p.is_cover}
            for p in gallery
        ],
        "max_party": max_party(session, venue),
        "schedule": read_schedule(session, venue, upcoming_only=True),
        "book_url": f"/r/{venue.public_id}",
        "maps_url": maps_url(venue),
    }


def find_by_slug(session: Session, slug: str) -> Venue | None:
    return session.scalars(
        select(Venue).where(Venue.slug == slug, Venue.kind == "restaurant")
    ).first()
