"""The ambience of one table for one booking (spec 7.5).

table_ambience looks at the stay in 15-minute steps, [start, end), the same
grid the restaurant slots use, and reports the light at the start, how long
the table is in the sun, when the sun leaves or arrives, sunset and dusk, the
view from the nearest window, what busy things are close and the sentences.
seat_facing gives the one sentence about a chosen chair.
"""

import math
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from functools import cache

from app.ambience import phrases
from app.ambience.geometry import Point, point_in_polygon
from app.ambience.light import (
    LIGHT_WINDOWS,
    SUNSET_FACING,
    SUNSET_WINDOW,
    Light,
    opening_distance,
    opening_facing,
    opening_segments,
    polygon_distance,
    table_light,
    table_polygon,
)
from app.ambience.models import (
    AmbienceFixture,
    AmbienceOpening,
    AmbienceRoom,
    AmbienceSeat,
    AmbienceTable,
)
from app.ambience.solar import SunTimes, sun_times

STEP = timedelta(minutes=15)
VIEW_DISTANCE = 200.0  # cm, table edge to window, for "has a view"
NEAR_DISTANCE = 300.0  # cm, edge to edge, for "next to the bar"
QUIET_DISTANCE = 500.0  # cm: nothing busy closer than this is "quiet"
SEAT_WINDOW_DISTANCE = 300.0  # cm: the chair sentence needs a window this close
SUNNY_MINUTES = 30  # minutes of direct sun that make a "sunny table"
NEAR_KINDS = ("bar", "kitchen", "wc", "stage", "fireplace", "tv", "host_stand")
BUSY_KINDS = ("bar", "kitchen", "wc", "stage", "tv", "entrance")


@dataclass(frozen=True)
class TableView:
    text: str
    tags: tuple[str, ...]
    night_text: str
    photo_url: str
    distance_cm: float


@dataclass(frozen=True)
class TableAmbience:
    light: Light
    sun_minutes: int
    sun_until: time | None
    sun_from: time | None
    sunset_at: time | None
    dark_at: time | None
    view: TableView | None
    near: tuple[str, ...]
    quiet: bool
    features: tuple[str, ...]
    phrases: tuple[str, ...]


@cache
def _times(lat: float, lng: float, day: date, zone: object) -> SunTimes:
    return sun_times(lat, lng, day, zone)  # type: ignore[arg-type]


def _steps(start: datetime, end: datetime) -> list[datetime]:
    moments, moment = [], start
    while moment < end:
        moments.append(moment)
        moment += STEP
    return moments


def _local(moment: datetime) -> time:
    return moment.timetz().replace(tzinfo=None)


def _polygons_distance(a: tuple[Point, ...], b: tuple[Point, ...]) -> float:
    if any(point_in_polygon(p, a) for p in b) or any(point_in_polygon(p, b) for p in a):
        return 0.0
    return polygon_distance(a, list(zip(b, (*b[1:], *b[:1]), strict=True)))


def _fixture_distance(table: AmbienceTable, fixture: AmbienceFixture) -> float:
    return _polygons_distance(table_polygon(table), table_polygon(fixture))


def _busy_distances(room: AmbienceRoom, table: AmbienceTable) -> list[tuple[float, str]]:
    """(distance, kind) for every fixture and main entrance, nearest first."""
    found = [(_fixture_distance(table, f), f.kind) for f in room.fixtures]
    found += [
        (opening_distance(room, table, o), "entrance")
        for o in room.openings
        if o.kind == "door" and o.is_main_entrance
    ]
    return sorted(found)


def _view(room: AmbienceRoom, table: AmbienceTable, night: bool) -> TableView | None:
    best: tuple[float, AmbienceOpening] | None = None
    for opening in room.openings:
        if opening.kind not in LIGHT_WINDOWS:
            continue
        if not (opening.view_text.strip() or opening.view_tags):
            continue
        distance = opening_distance(room, table, opening)
        if distance < VIEW_DISTANCE and (best is None or distance < best[0]):
            best = (distance, opening)
    if best is None:
        return None
    distance, opening = best
    text = (
        opening.night_view_text if night and opening.night_view_text.strip() else opening.view_text
    )
    return TableView(
        text=text.strip(),
        tags=opening.view_tags,
        night_text=opening.night_view_text,
        photo_url=opening.view_photo_url,
        distance_cm=distance,
    )


def _sees_sunset(room: AmbienceRoom, table: AmbienceTable) -> bool:
    if room.is_outdoor:
        return True
    low, high = SUNSET_FACING
    for opening in room.openings:
        if opening.kind not in LIGHT_WINDOWS:
            continue
        facing = opening_facing(room, opening)
        near = opening_distance(room, table, opening) < SEAT_WINDOW_DISTANCE
        if facing is not None and low <= facing <= high and near:
            return True
    return False


def table_ambience(
    room: AmbienceRoom,
    table: AmbienceTable,
    lat: float,
    lng: float,
    start: datetime,
    end: datetime,
) -> TableAmbience:
    """Spec 7.5 for a stay [start, end), both aware datetimes in local time."""
    if start.tzinfo is None or end.tzinfo is None:
        raise ValueError("The stay must be timezone aware")
    if end <= start:
        raise ValueError("A stay must end after it starts")

    steps = _steps(start, end)
    lights = [
        table_light(room, table, lat, lng, s, times=_times(lat, lng, s.date(), s.tzinfo))
        for s in steps
    ]
    sunny = [light == "sun" for light in lights]
    sun_minutes = sum(sunny) * int(STEP.total_seconds() // 60)
    first = lights[0]

    sun_until = sun_from = None
    if sunny[0] and not all(sunny):
        sun_until = _local(steps[sunny.index(False)])
    elif not sunny[0] and any(sunny):
        sun_from = _local(steps[sunny.index(True)])

    sunset = _times(lat, lng, start.date(), start.tzinfo).sunset
    sunset_at = dark_at = None
    if sunset is not None and first != "night":
        if start <= sunset < max(end, start + SUNSET_WINDOW) and _sees_sunset(room, table):
            sunset_at = _local(sunset)
        elif start < sunset < end:
            dark_at = _local(sunset)

    view = _view(room, table, night=first == "night")
    busy = _busy_distances(room, table)
    near = tuple(
        kind
        for distance, kind in busy
        if distance < NEAR_DISTANCE and kind in (*NEAR_KINDS, "entrance")
    )
    quiet = not any(distance < QUIET_DISTANCE and kind in BUSY_KINDS for distance, kind in busy)
    away_from_wc = not any(distance < QUIET_DISTANCE and kind == "wc" for distance, kind in busy)

    features = []
    if sun_minutes >= SUNNY_MINUTES:
        features.append("sun")
    if sun_minutes == 0 and first != "night":
        features.append("shade")
    if view is not None:
        features.append("view")
    if quiet:
        features.append("quiet")
    if away_from_wc:
        features.append("away_from_wc")
    if sunset_at is not None:
        features.append("sunset")

    sentences = [
        phrases.light_phrase(
            first,
            outdoor=room.is_outdoor,
            whole_meal_sun=all(sunny),
            sun_until=sun_until,
            sun_from=sun_from,
            sunset_at=sunset_at,
            dark_at=dark_at,
        ),
        phrases.view_phrase(view.text, view.tags) if view is not None else None,
        phrases.near_phrase(near, quiet),
    ]
    return TableAmbience(
        light=first,
        sun_minutes=sun_minutes,
        sun_until=sun_until,
        sun_from=sun_from,
        sunset_at=sunset_at,
        dark_at=dark_at,
        view=view,
        near=near,
        quiet=quiet,
        features=tuple(features),
        phrases=tuple(s for s in sentences if s)[:3],
    )


def _nearest_window(room: AmbienceRoom, table: AmbienceTable) -> AmbienceOpening | None:
    """The view window if there is one, else the nearest window within 3 m."""
    windows = [o for o in room.openings if o.kind in LIGHT_WINDOWS]
    scored = sorted(
        (opening_distance(room, table, o), not (o.view_text or o.view_tags), index, o)
        for index, o in enumerate(windows)
    )
    for distance, _no_view, _index, opening in scored:
        if distance < SEAT_WINDOW_DISTANCE:
            return opening
    return None


def seat_facing(room: AmbienceRoom, table: AmbienceTable, seat: AmbienceSeat) -> str | None:
    """'Facing the window', 'Back to the window' or 'Side-on to the window'.

    The chair looks at the table's centre. None when no window is close
    enough to say anything true.
    """
    opening = _nearest_window(room, table)
    if opening is None:
        return None
    segments = opening_segments(room, opening)
    a, b = segments[len(segments) // 2]
    window_mid = Point((a.x + b.x) / 2, (a.y + b.y) / 2)
    look = (table.x + table.w / 2 - seat.x, table.y + table.h / 2 - seat.y)
    to_window = (window_mid.x - seat.x, window_mid.y - seat.y)
    norms = math.hypot(*look) * math.hypot(*to_window)
    if norms == 0:
        return None
    cosine = (look[0] * to_window[0] + look[1] * to_window[1]) / norms
    return phrases.seat_phrase(math.degrees(math.acos(max(-1.0, min(1.0, cosine)))))
