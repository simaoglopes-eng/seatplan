"""Centimetres in screen coordinates, with clockwise room outlines."""

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

Outline = Mapping[str, Sequence[Mapping[str, float]]]


@dataclass(frozen=True)
class Point:
    x: float
    y: float


def polygon_area(points: Sequence[Point]) -> float:
    """Signed area, positive for clockwise winding on a screen."""
    return sum(a.x * b.y - b.x * a.y for a, b in zip(points, (*points[1:], *points[:1]))) / 2


def point_in_polygon(point: Point, polygon: Sequence[Point]) -> bool:
    """Ray casting, including the boundary so touching a wall is inside."""
    inside = False
    for a, b in zip(polygon, (*polygon[1:], *polygon[:1])):
        cross = (point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x)
        if (
            abs(cross) <= 1e-8
            and min(a.x, b.x) <= point.x <= max(a.x, b.x)
            and min(a.y, b.y) <= point.y <= max(a.y, b.y)
        ):
            return True
        if (a.y > point.y) != (b.y > point.y):
            crossing = a.x + (point.y - a.y) * (b.x - a.x) / (b.y - a.y)
            if point.x < crossing:
                inside = not inside
    return inside


def bearing(dx: float, dy: float, north_deg: float) -> float:
    """Real-world clockwise bearing from a nonzero screen direction."""
    if not all(math.isfinite(v) for v in (dx, dy, north_deg)) or (dx == 0 and dy == 0):
        raise ValueError("A finite, nonzero direction is required")
    return (math.degrees(math.atan2(dx, -dy)) - north_deg) % 360


def rect_corners(x: float, y: float, w: float, h: float, rotation: float) -> tuple[Point, ...]:
    """Rotate the unrotated bounding box about its centre."""
    angle = math.radians(rotation)
    c, s = math.cos(angle), math.sin(angle)
    cx, cy = x + w / 2, y + h / 2
    return tuple(
        Point(cx + dx * c - dy * s, cy + dx * s + dy * c)
        for dx, dy in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2))
    )


def side_point(outline: Outline, side: int, fraction: float) -> Point:
    """Point at a fraction of straight or circular side length."""
    points = outline["points"]
    a, b = points[side], points[(side + 1) % len(points)]
    dx, dy = b["x"] - a["x"], b["y"] - a["y"]
    chord = math.hypot(dx, dy)
    sagitta = a.get("curve", 0)
    if not 0 <= fraction <= 1 or chord == 0 or abs(sagitta) > chord / 2:
        raise ValueError("Invalid side or arc fraction")
    if sagitta == 0:
        return Point(a["x"] + fraction * dx, a["y"] + fraction * dy)
    radius = (chord * chord / 4 + sagitta * sagitta) / (2 * sagitta)
    cx = (a["x"] + b["x"]) / 2 - dy / chord * (radius - sagitta)
    cy = (a["y"] + b["y"]) / 2 + dx / chord * (radius - sagitta)
    angle = math.atan2(a["y"] - cy, a["x"] - cx)
    angle += fraction * 4 * math.atan(2 * sagitta / chord)
    return Point(cx + abs(radius) * math.cos(angle), cy + abs(radius) * math.sin(angle))


def side_normal(outline: Outline, side: int, fraction: float) -> tuple[float, float]:
    """Outward unit normal at a position on a clockwise side."""
    before = side_point(outline, side, max(0, fraction - 1e-6))
    after = side_point(outline, side, min(1, fraction + 1e-6))
    dx, dy = after.x - before.x, after.y - before.y
    length = math.hypot(dx, dy)
    if length == 0:
        raise ValueError("A nonzero side is required")
    return dy / length, -dx / length


def outline_polygon(outline: Outline, segments_per_arc: int = 16) -> tuple[Point, ...]:
    """Approximate each circular side with equally spaced arc segments."""
    points = outline["points"]
    if not 3 <= len(points) <= 60 or segments_per_arc < 1:
        raise ValueError("An outline needs 3-60 points and positive segment count")
    if not all(math.isfinite(p.get(k, 0)) for p in points for k in ("x", "y", "curve")):
        raise ValueError("Coordinates must be finite")
    polygon = []
    for side, point in enumerate(points):
        count = segments_per_arc if point.get("curve", 0) else 1
        polygon.extend(side_point(outline, side, step / count) for step in range(count))
    return tuple(polygon)
