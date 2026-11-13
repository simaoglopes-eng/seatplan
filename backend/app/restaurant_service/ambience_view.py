"""Database rows -> the ambience engine -> the JSON of spec 7.6.

The pure engine (app/ambience) only knows frozen dataclasses. This module
reads the saved rooms, openings, fixtures and tables of one restaurant, turns
them into those dataclasses, asks the engine, and writes the answer the API
sends. It is read-only, loads no photo bytes and returns no personal data:
only ids, polygons, light names and short sentences.

Two moments are involved. The *stay* starts at `start` and lasts as long as the
restaurant keeps a table for this party; the sentences and the numbers
describe the whole stay. The *moment* (the diner's time cursor, `start` by
default) decides where the sun patches fall and whether the room is dark.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ambience.geometry import Point
from app.ambience.light import is_night, sun_patches
from app.ambience.models import (
    AmbienceFixture,
    AmbienceOpening,
    AmbienceRoom,
    AmbienceTable,
)
from app.ambience.solar import sun_position, sun_times
from app.ambience.table import TableAmbience, table_ambience
from app.models import Room, RoomFixture, RoomOpening, Venue, VenuePhoto, VenueTable
from app.restaurant_service import schedule
from app.restaurant_service.clock import hhmm, local_datetime, venue_zone

# Used when the caller does not say how many people come.
DEFAULT_PARTY = 2
IMPLICIT_KEY = "implicit"


@dataclass(frozen=True)
class LoadedRoom:
    """One room of the restaurant with the engine's view of it and its tables."""

    id: int | None  # None for the implicit room of a restaurant that never saved one
    name: str
    room: AmbienceRoom
    tables: tuple[tuple[VenueTable, AmbienceTable], ...]


# ---------------------------------------------------------------- rows -> engine


def _view_photos(session: Session, venue: Venue) -> dict[int, str]:
    """Opening id -> public URL of its view photo. Only metadata, never bytes."""
    query = (
        select(VenuePhoto.opening_id, VenuePhoto.public_id)
        .where(
            (VenuePhoto.venue_id == venue.id)
            & (VenuePhoto.kind == "view")
            & VenuePhoto.opening_id.is_not(None)
        )
        .order_by(VenuePhoto.position, VenuePhoto.id)
    )
    urls: dict[int, str] = {}
    for opening_id, public_id in session.execute(query):
        urls.setdefault(opening_id, f"/api/photos/{public_id}")
    return urls


def _opening(row: RoomOpening, photos: dict[int, str]) -> AmbienceOpening:
    return AmbienceOpening(
        key=row.id,
        side=row.side,
        offset=row.offset,
        width=row.width,
        kind=row.kind,  # type: ignore[arg-type]
        top_height=row.top_height,
        is_main_entrance=row.is_main_entrance,
        view_text=row.view_text,
        view_tags=tuple(row.view_tags or ()),
        night_view_text=row.night_view_text,
        view_photo_url=photos.get(row.id, ""),
        sun_rule=row.sun_rule,  # type: ignore[arg-type]
        sun_from=row.sun_from,
        sun_until=row.sun_until,
    )


def _fixture(row: RoomFixture) -> AmbienceFixture:
    return AmbienceFixture(
        key=row.id,
        kind=row.kind,
        shape=row.shape,  # type: ignore[arg-type]
        x=row.x,
        y=row.y,
        w=row.w,
        h=row.h,
        rotation=row.rotation,
        label=row.label,
    )


def _table(row: VenueTable) -> AmbienceTable:
    return AmbienceTable(
        key=row.id,
        label=row.label,
        shape=row.shape,  # type: ignore[arg-type]
        x=row.x,
        y=row.y,
        w=row.w,
        h=row.h,
        rotation=row.rotation,
    )


def _implicit_room(venue: Venue) -> AmbienceRoom:
    """The whole floor as one plain room: no north, no windows, so no sun claims."""
    width, height = venue.width, venue.height
    corners = ((0, 0), (width, 0), (width, height), (0, height))
    outline = {"points": [{"x": x, "y": y, "curve": 0} for x, y in corners]}
    return AmbienceRoom(key=IMPLICIT_KEY, outline=outline, north_deg=None)


def load_rooms(session: Session, venue: Venue) -> list[LoadedRoom]:
    """Saved rooms in order, each with its active tables.

    Tables that belong to no saved room (every restaurant that has never used
    the room editor) share one implicit room, added last and only if needed.
    Inactive tables are never part of the answer.
    """
    rows = list(
        session.scalars(
            select(Room).where(Room.venue_id == venue.id).order_by(Room.position, Room.id)
        )
    )
    ids = [row.id for row in rows]
    photos = _view_photos(session, venue)
    openings: dict[int, list[RoomOpening]] = {}
    fixtures: dict[int, list[RoomFixture]] = {}
    if ids:
        for opening in session.scalars(
            select(RoomOpening).where(RoomOpening.room_id.in_(ids)).order_by(RoomOpening.id)
        ):
            openings.setdefault(opening.room_id, []).append(opening)
        for fixture in session.scalars(
            select(RoomFixture).where(RoomFixture.room_id.in_(ids)).order_by(RoomFixture.id)
        ):
            fixtures.setdefault(fixture.room_id, []).append(fixture)

    tables: dict[int | None, list[VenueTable]] = {}
    query = (
        select(VenueTable)
        .where((VenueTable.venue_id == venue.id) & VenueTable.is_active)
        .order_by(VenueTable.id)
    )
    for table in session.scalars(query):
        known = table.room_id if table.room_id in ids else None
        tables.setdefault(known, []).append(table)

    loaded = [
        LoadedRoom(
            id=row.id,
            name=row.name,
            room=AmbienceRoom(
                key=row.id,
                outline=row.outline,
                north_deg=row.north_deg,
                is_outdoor=row.is_outdoor,
                openings=tuple(_opening(o, photos) for o in openings.get(row.id, ())),
                fixtures=tuple(_fixture(f) for f in fixtures.get(row.id, ())),
            ),
            tables=tuple((t, _table(t)) for t in tables.get(row.id, ())),
        )
        for row in rows
    ]
    if tables.get(None):
        implicit = _implicit_room(venue)
        loaded.append(
            LoadedRoom(None, "Main room", implicit, tuple((t, _table(t)) for t in tables[None]))
        )
    return loaded


# ---------------------------------------------------------------- engine -> JSON


def _clock(moment: time | None) -> str | None:
    return None if moment is None else hhmm(moment)


def _polygon(points: tuple[Point, ...]) -> list[dict[str, float]]:
    return [{"x": round(p.x, 1), "y": round(p.y, 1)} for p in points]


def _table_payload(table_id: int, found: TableAmbience, detail: bool) -> dict[str, Any]:
    answer: dict[str, Any] = {
        "id": table_id,
        "light": found.light,
        "phrases": list(found.phrases),
    }
    if not detail:
        return answer
    view = found.view
    answer |= {
        "sun_minutes": found.sun_minutes,
        "sun_until": _clock(found.sun_until),
        "sun_from": _clock(found.sun_from),
        "sunset_at": _clock(found.sunset_at),
        "dark_at": _clock(found.dark_at),
        "view": None
        if view is None
        else {
            "text": view.text,
            "tags": list(view.tags),
            "night_text": view.night_text,
            "photo_url": view.photo_url,
            "distance_cm": round(view.distance_cm),
        },
        "near": list(found.near),
        "quiet": found.quiet,
        "features": list(found.features),
    }
    return answer


def ambience_payload(
    session: Session,
    venue: Venue,
    day: date,
    start: time,
    party: int | None = None,
    moment: time | None = None,
    detail: bool = False,
) -> dict[str, Any]:
    """Spec 7.6: {rooms: [{id, sun_patches, night}], tables: [{id, light, phrases}]}.

    `detail=True` adds the numbers behind the sentences to every table (for the
    diner map and the editor). A restaurant with no coordinates cannot say
    anything about the sun, so it answers `located: false` and no tables.
    """
    zone = venue_zone(venue)
    begins = local_datetime(venue, day, start)
    at = local_datetime(venue, day, moment) if moment is not None else begins
    minutes = schedule.turn_minutes(session, venue, party or DEFAULT_PARTY)
    ends = begins + timedelta(minutes=minutes)
    rooms = load_rooms(session, venue)
    answer: dict[str, Any] = {
        "date": day.isoformat(),
        "time": hhmm(at.time()),
        "stay_start": hhmm(begins.time()),
        "stay_end": hhmm(ends.time()),
        "located": venue.lat is not None and venue.lng is not None,
        "sun": None,
        "rooms": [],
        "tables": [],
    }
    if venue.lat is None or venue.lng is None:
        answer["rooms"] = [{"id": r.id, "sun_patches": [], "night": False} for r in rooms]
        return answer

    lat, lng = venue.lat, venue.lng
    position = sun_position(lat, lng, at.astimezone(UTC))
    times = sun_times(lat, lng, day, zone)
    night = is_night(at, times, position)

    def local(moment_: datetime | None) -> str | None:
        return None if moment_ is None else hhmm(moment_.astimezone(zone).time())

    answer["sun"] = {
        "sunrise": local(times.sunrise),
        "sunset": local(times.sunset),
        "azimuth": round(position.azimuth_deg, 1),
        "altitude": round(position.altitude_deg, 1),
    }
    tables: list[dict[str, Any]] = []
    for loaded in rooms:
        patches = sun_patches(loaded.room, lat, lng, at, sun=position)
        answer["rooms"].append(
            {
                "id": loaded.id,
                "sun_patches": [] if night else [_polygon(p) for p in patches],
                "night": night,
            }
        )
        for row, engine_table in loaded.tables:
            found = table_ambience(loaded.room, engine_table, lat, lng, begins, ends)
            tables.append(_table_payload(row.id, found, detail))
    answer["tables"] = sorted(tables, key=lambda t: t["id"])
    return answer
