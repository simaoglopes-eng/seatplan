"""Direct sun through windows, sun patches on the floor and the light of a table.

Spec 7.3 and 7.4. Pure functions: rooms come in as ambience.models values and
the moment as a timezone-aware datetime in the restaurant's own time zone.

The rules never claim sun they cannot back up (spec anti-goal "the ambience
must not lie"): no north means no sun, a low sun (3 degrees or less) means no
sun, and the owner's "never" or "only between" rules always win over physics
saying yes, while physics saying no always wins over the owner's hours.
"""

import math
from collections.abc import Sequence
from datetime import datetime, time, timedelta
from functools import lru_cache
from itertools import pairwise
from typing import Literal

from app.ambience.geometry import (
    Point,
    bearing,
    outline_polygon,
    point_in_polygon,
    rect_corners,
    side_normal,
    side_point,
)
from app.ambience.models import AmbienceFixture, AmbienceOpening, AmbienceRoom, AmbienceTable
from app.ambience.solar import SunPosition, SunTimes, sun_position, sun_times

Light = Literal["night", "sun", "sunset", "shade", "daylight", "interior"]
Polygon = tuple[Point, ...]
Segment = tuple[Point, Point]

MIN_SUN_ALTITUDE = 3.0  # degrees; lower than this, buildings and the horizon block it
MAX_SUN_ANGLE = 80.0  # degrees between the sun and the way the window faces
MAX_PATCH_DEPTH = 600.0  # cm; a very low sun would otherwise cross the whole room
NEAR_WINDOW = 300.0  # cm, table edge to window, for "daylight" and "sunset"
SUNSET_WINDOW = timedelta(minutes=45)
SUNSET_FACING = (200.0, 340.0)  # degrees: windows that look towards the sunset
ARC_SEGMENTS = 16  # same approximation as geometry.outline_polygon
LIGHT_WINDOWS = ("window", "glass_wall")


# ---------------------------------------------------------------- openings


def _side_ends(room: AmbienceRoom, side: int) -> tuple[dict, dict]:
    points = room.outline["points"]
    return points[side], points[(side + 1) % len(points)]


def side_length(room: AmbienceRoom, side: int) -> float:
    """Length of a side in cm, along the arc when the side is curved."""
    a, b = _side_ends(room, side)
    chord = math.hypot(b["x"] - a["x"], b["y"] - a["y"])
    sagitta = a.get("curve", 0)
    if sagitta == 0 or chord == 0:
        return chord
    radius = (chord * chord / 4 + sagitta * sagitta) / (2 * abs(sagitta))
    angle = 4 * math.atan(2 * abs(sagitta) / chord)
    return radius * angle


def _span(room: AmbienceRoom, opening: AmbienceOpening) -> tuple[float, float]:
    """Where the opening starts and ends on its side, as fractions 0..1."""
    if opening.kind == "glass_wall":
        return 0.0, 1.0
    length = side_length(room, opening.side)
    if length <= 0:
        raise ValueError("An opening needs a side with a length")
    start = min(max(opening.offset / length, 0.0), 1.0)
    end = min(max((opening.offset + opening.width) / length, 0.0), 1.0)
    return start, end


def opening_segments(room: AmbienceRoom, opening: AmbienceOpening) -> tuple[Segment, ...]:
    """The opening as straight pieces: one on a straight side, 16 on a curved one.

    Every table asks for the same openings again and again, so the answer is kept
    for the exact outline and opening values (a plain tuple key: nothing is shared
    between rooms that differ in any number).
    """
    corners = tuple((p["x"], p["y"], p.get("curve", 0)) for p in room.outline["points"])
    return _segments_of(corners, opening.side, opening.offset, opening.width, opening.kind)


@lru_cache(maxsize=1024)
def _segments_of(
    corners: tuple[tuple[float, float, float], ...],
    side: int,
    offset: float,
    width: float,
    kind: str,
) -> tuple[Segment, ...]:
    outline = {"points": [{"x": x, "y": y, "curve": curve} for x, y, curve in corners]}
    room = AmbienceRoom(key="cached", outline=outline, north_deg=None)
    opening = AmbienceOpening(key="cached", side=side, offset=offset, width=width, kind=kind)  # type: ignore[arg-type]
    start, end = _span(room, opening)
    a, _ = _side_ends(room, opening.side)
    count = ARC_SEGMENTS if a.get("curve", 0) else 1
    stops = [start + (end - start) * step / count for step in range(count + 1)]
    corners = [side_point(room.outline, opening.side, f) for f in stops]
    return tuple(pairwise(corners))


def _facing_at(room: AmbienceRoom, side: int, fraction: float) -> float | None:
    if room.north_deg is None:
        return None
    nx, ny = side_normal(room.outline, side, fraction)
    return bearing(nx, ny, room.north_deg)


def opening_facing(room: AmbienceRoom, opening: AmbienceOpening) -> float | None:
    """Compass bearing the opening looks towards, or None while north is unset."""
    start, end = _span(room, opening)
    return _facing_at(room, opening.side, (start + end) / 2)


# ---------------------------------------------------------------- sun rules


def _angle_between(a: float, b: float) -> float:
    return abs((a - b + 180) % 360 - 180)


def _hours_allow(opening: AmbienceOpening, local: time) -> bool:
    if opening.sun_rule == "never":
        return False
    if opening.sun_rule == "auto":
        return True
    start, until = opening.sun_from, opening.sun_until
    if start is None or until is None:
        return False
    if start <= until:
        return start <= local < until
    return local >= start or local < until  # hours that cross midnight


def _sun_reaches(facing: float | None, sun: SunPosition) -> bool:
    if facing is None or sun.altitude_deg <= MIN_SUN_ALTITUDE:
        return False
    return _angle_between(sun.azimuth_deg, facing) <= MAX_SUN_ANGLE + 1e-9


def _local_time(when: datetime) -> time:
    if when.tzinfo is None:
        raise ValueError("The moment must be timezone aware")
    return when.timetz().replace(tzinfo=None)


def _sun(lat: float, lng: float, when: datetime, sun: SunPosition | None) -> SunPosition:
    return sun if sun is not None else sun_position(lat, lng, when)


def window_has_sun(
    room: AmbienceRoom,
    opening: AmbienceOpening,
    lat: float,
    lng: float,
    when: datetime,
    sun: SunPosition | None = None,
) -> bool:
    """Spec 7.3: does direct sun come in through this window at this moment?

    `sun` lets a caller (or a test) reuse a position it already worked out.
    """
    if opening.kind not in LIGHT_WINDOWS or room.is_outdoor:
        return False
    if not _hours_allow(opening, _local_time(when)):
        return False
    return _sun_reaches(opening_facing(room, opening), _sun(lat, lng, when, sun))


# ---------------------------------------------------------------- patches


def _ray(room: AmbienceRoom, sun: SunPosition) -> tuple[float, float]:
    """Screen direction of the light on the floor: away from the sun."""
    screen = math.radians((sun.azimuth_deg + 180 + (room.north_deg or 0)) % 360)
    return math.sin(screen), -math.cos(screen)


def _patch(segment: Segment, ray: tuple[float, float], depth: float) -> Polygon:
    a, b = segment
    dx, dy = ray[0] * depth, ray[1] * depth
    return (a, b, Point(b.x + dx, b.y + dy), Point(a.x + dx, a.y + dy))


def _opening_patches(
    room: AmbienceRoom, opening: AmbienceOpening, sun: SunPosition, local: time
) -> list[Polygon]:
    if opening.kind not in LIGHT_WINDOWS or not _hours_allow(opening, local):
        return []
    depth = min(opening.top_height / math.tan(math.radians(sun.altitude_deg)), MAX_PATCH_DEPTH)
    ray = _ray(room, sun)
    start, end = _span(room, opening)
    segments = opening_segments(room, opening)
    patches = []
    for index, segment in enumerate(segments):
        # Each piece of a curved window is judged by its own facing.
        middle = start + (end - start) * (index + 0.5) / len(segments)
        if _sun_reaches(_facing_at(room, opening.side, middle), sun):
            patches.append(_patch(segment, ray, depth))
    return patches


def sun_patches(
    room: AmbienceRoom,
    lat: float,
    lng: float,
    when: datetime,
    sun: SunPosition | None = None,
) -> tuple[Polygon, ...]:
    """Spec 7.3: the floor areas in direct sun, as polygons in cm.

    Indoors, one parallelogram per sunny window (per arc piece on a curved
    side), not yet clipped by the walls: callers clip when drawing and test
    points against both the patch and the room. Outdoors, the whole room while
    the sun is high enough (awnings are handled in table_light).
    """
    sun = _sun(lat, lng, when, sun)
    # Every table of a room asks for the same patches at the same moment, so they are kept
    # for the exact room values (a plain tuple key, nothing shared between different rooms).
    corners = tuple((p["x"], p["y"], p.get("curve", 0)) for p in room.outline["points"])
    return _patches_of(corners, room.north_deg, room.is_outdoor, tuple(room.openings), sun, when)


@lru_cache(maxsize=256)
def _patches_of(
    corners: tuple[tuple[float, float, float], ...],
    north_deg: float | None,
    is_outdoor: bool,
    openings: tuple[AmbienceOpening, ...],
    sun: SunPosition,
    when: datetime,
) -> tuple[Polygon, ...]:
    outline = {"points": [{"x": x, "y": y, "curve": curve} for x, y, curve in corners]}
    room = AmbienceRoom(
        key="cached", outline=outline, north_deg=north_deg, is_outdoor=is_outdoor, openings=openings
    )
    if room.is_outdoor:  # outdoors needs no north and no window
        return (outline_polygon(room.outline),) if _sun_is_up(sun) else ()
    if room.north_deg is None or not _sun_is_up(sun):
        return ()
    local = _local_time(when)
    patches: list[Polygon] = []
    for opening in room.openings:
        patches.extend(_opening_patches(room, opening, sun, local))
    return tuple(patches)


def _sun_is_up(sun: SunPosition) -> bool:
    return sun.altitude_deg > MIN_SUN_ALTITUDE


# ---------------------------------------------------------------- tables


def _circle(cx: float, cy: float, radius: float, count: int) -> Polygon:
    angles = (2 * math.pi * i / count for i in range(count))
    return tuple(Point(cx + radius * math.cos(a), cy + radius * math.sin(a)) for a in angles)


def table_polygon(table: AmbienceTable | AmbienceFixture) -> Polygon:
    """The footprint: a 16-sided circle for round items, else the rotated box."""
    if table.shape in ("round", "circle"):
        radius = min(table.w, table.h) / 2
        return _circle(table.x + table.w / 2, table.y + table.h / 2, radius, ARC_SEGMENTS)
    return rect_corners(table.x, table.y, table.w, table.h, table.rotation)


def table_samples(table: AmbienceTable) -> Polygon:
    """Spec 7.4: the centre plus four corners (four points on the edge if round)."""
    centre = Point(table.x + table.w / 2, table.y + table.h / 2)
    if table.shape == "round":
        r = min(table.w, table.h) / 2
        steps = ((1, 0), (0, 1), (-1, 0), (0, -1))
        return (centre, *(Point(centre.x + dx * r, centre.y + dy * r) for dx, dy in steps))
    return (centre, *rect_corners(table.x, table.y, table.w, table.h, table.rotation))


def _point_segment(p: Point, a: Point, b: Point) -> float:
    dx, dy = b.x - a.x, b.y - a.y
    length = dx * dx + dy * dy
    t = 0.0 if length == 0 else max(0.0, min(1.0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length))
    return math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))


def _cross(o: Point, a: Point, b: Point) -> float:
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)


def _segments_cross(a: Point, b: Point, c: Point, d: Point) -> bool:
    d1, d2 = _cross(c, d, a), _cross(c, d, b)
    d3, d4 = _cross(a, b, c), _cross(a, b, d)
    return (d1 > 0) != (d2 > 0) and (d3 > 0) != (d4 > 0)


def _segment_distance(a: Point, b: Point, c: Point, d: Point) -> float:
    if _segments_cross(a, b, c, d):
        return 0.0
    return min(
        _point_segment(a, c, d),
        _point_segment(b, c, d),
        _point_segment(c, a, b),
        _point_segment(d, a, b),
    )


def polygon_distance(polygon: Sequence[Point], segments: Sequence[Segment]) -> float:
    """Shortest edge-to-edge distance in cm; 0 when a segment touches the polygon."""
    edges = list(zip(polygon, (*polygon[1:], *polygon[:1]), strict=True))
    boxes = [(min(a.x, b.x), min(a.y, b.y), max(a.x, b.x), max(a.y, b.y)) for a, b in edges]
    best = math.inf
    for c, d in segments:
        if point_in_polygon(c, polygon) or point_in_polygon(d, polygon):
            return 0.0
        low_x, low_y, high_x, high_y = min(c.x, d.x), min(c.y, d.y), max(c.x, d.x), max(c.y, d.y)
        for (a, b), (x0, y0, x1, y1) in zip(edges, boxes, strict=True):
            # The gap between the two boxes is never more than the real distance, so a pair
            # whose boxes are already farther apart than the best found cannot improve it.
            gap = math.hypot(max(x0 - high_x, low_x - x1, 0.0), max(y0 - high_y, low_y - y1, 0.0))
            if gap < best:
                best = min(best, _segment_distance(a, b, c, d))
    return best


def opening_distance(room: AmbienceRoom, table: AmbienceTable, opening: AmbienceOpening) -> float:
    """Distance in cm from the table's edge to the opening."""
    return polygon_distance(table_polygon(table), opening_segments(room, opening))


def is_night(when: datetime, times: SunTimes, sun: SunPosition) -> bool:
    """True before sunrise and from sunset on; polar days use the sun's height."""
    if times.sunrise is None or times.sunset is None:
        return sun.altitude_deg <= 0  # polar day or polar night
    return when < times.sunrise or when >= times.sunset


def _inside_any(point: Point, polygons: Sequence[Polygon]) -> bool:
    return any(point_in_polygon(point, polygon) for polygon in polygons)


def _sunset_window(room: AmbienceRoom, table: AmbienceTable) -> bool:
    low, high = SUNSET_FACING
    for opening in room.openings:
        if opening.kind not in LIGHT_WINDOWS:
            continue
        facing = opening_facing(room, opening)
        facing_sunset = facing is not None and low <= facing <= high
        if facing_sunset and opening_distance(room, table, opening) < NEAR_WINDOW:
            return True
    return False


def _near_a_window(room: AmbienceRoom, table: AmbienceTable) -> bool:
    return any(
        opening.kind in LIGHT_WINDOWS and opening_distance(room, table, opening) < NEAR_WINDOW
        for opening in room.openings
    )


def table_light(
    room: AmbienceRoom,
    table: AmbienceTable,
    lat: float,
    lng: float,
    when: datetime,
    sun: SunPosition | None = None,
    times: SunTimes | None = None,
) -> Light:
    """Spec 7.4: the light at one table at one moment; the first rule that fits wins.

    night > sun > sunset > shade > daylight > interior.
    """
    sun = _sun(lat, lng, when, sun)
    if times is None:
        times = sun_times(lat, lng, when.date(), when.tzinfo)  # type: ignore[arg-type]
    if is_night(when, times, sun):
        return "night"
    samples = table_samples(table)
    if room.is_outdoor:
        awnings = [table_polygon(f) for f in room.fixtures if f.kind == "awning"]
        covered = sum(_inside_any(p, awnings) for p in samples)
        if _sun_is_up(sun) and len(samples) - covered >= 2:
            return "sun"
        return "shade" if covered >= 2 else "daylight"
    patches = sun_patches(room, lat, lng, when, sun=sun)
    if patches:
        room_polygon = outline_polygon(room.outline)
        lit = sum(_inside_any(p, patches) and point_in_polygon(p, room_polygon) for p in samples)
        if lit >= 2:
            return "sun"
    sunset = times.sunset
    sunset_soon = sunset is not None and timedelta(0) <= sunset - when <= SUNSET_WINDOW
    if sunset_soon and _sunset_window(room, table):
        return "sunset"
    if _near_a_window(room, table):
        return "daylight"
    return "interior"
