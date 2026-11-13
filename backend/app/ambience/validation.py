"""Pure geometric draft/publication checks, mirrored by the room editor."""

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from app.ambience.geometry import (
    Point,
    outline_polygon,
    point_in_polygon,
    polygon_area,
    rect_corners,
)

EPS = 1e-6
Item = Mapping[str, Any]


@dataclass(frozen=True)
class _Shape:
    centre: Point
    radius: float | None
    polygon: tuple[Point, ...]


def _shape(item: Item, margin: float = 0) -> _Shape:
    x, y, w, h = (float(item[k]) for k in ("x", "y", "w", "h"))
    centre = Point(x + w / 2, y + h / 2)
    if item.get("shape") in {"round", "circle"}:
        return _Shape(centre, w / 2 + margin, ())
    return _Shape(
        centre,
        None,
        rect_corners(
            x - margin, y - margin, w + margin * 2, h + margin * 2, float(item.get("rotation", 0))
        ),
    )


def _edges(polygon: Sequence[Point]) -> list[tuple[Point, Point]]:
    return list(zip(polygon, (*polygon[1:], *polygon[:1])))


def _distance(point: Point, a: Point, b: Point) -> float:
    dx, dy = b.x - a.x, b.y - a.y
    t = (
        max(0, min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)))
        if dx or dy
        else 0
    )
    return math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy)


def _penetration(a: _Shape, b: _Shape) -> float | None:
    if a.radius is not None and b.radius is not None:
        depth = a.radius + b.radius - math.hypot(a.centre.x - b.centre.x, a.centre.y - b.centre.y)
        return depth if depth > EPS else None
    axes = [Point(-(q.y - p.y), q.x - p.x) for p, q in _edges(a.polygon) + _edges(b.polygon)]
    for circle, other in ((a, b), (b, a)):
        if circle.radius is not None and other.polygon:
            closest = min(
                other.polygon,
                key=lambda p: math.hypot(p.x - circle.centre.x, p.y - circle.centre.y),
            )
            axes.append(Point(closest.x - circle.centre.x, closest.y - circle.centre.y))
    depth = math.inf
    for axis in axes:
        length = math.hypot(axis.x, axis.y)
        if length < EPS:
            continue
        nx, ny = axis.x / length, axis.y / length
        intervals = []
        for shape in (a, b):
            if shape.radius is not None:
                centre = shape.centre.x * nx + shape.centre.y * ny
                intervals.append((centre - shape.radius, centre + shape.radius))
            else:
                values = [p.x * nx + p.y * ny for p in shape.polygon]
                intervals.append((min(values), max(values)))
        (amin, amax), (bmin, bmax) = intervals
        overlap = min(amax - bmin, bmax - amin)
        if overlap <= EPS:
            return None
        depth = min(depth, overlap)
    return depth


def _inside(shape: _Shape, polygon: Sequence[Point]) -> bool:
    if not point_in_polygon(shape.centre, polygon):
        return False
    if shape.radius is not None:
        return all(_distance(shape.centre, a, b) + EPS >= shape.radius for a, b in _edges(polygon))
    return all(point_in_polygon(p, polygon) for p in shape.polygon) and not any(
        _crosses(a, b, c, d, proper=True)
        for a, b in _edges(shape.polygon)
        for c, d in _edges(polygon)
    )


def _crosses(a: Point, b: Point, c: Point, d: Point, *, proper: bool = False) -> bool:
    if (
        max(a.x, b.x) + EPS < min(c.x, d.x)
        or max(c.x, d.x) + EPS < min(a.x, b.x)
        or max(a.y, b.y) + EPS < min(c.y, d.y)
        or max(c.y, d.y) + EPS < min(a.y, b.y)
    ):
        return False

    def cross(p: Point, q: Point, r: Point) -> float:
        return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)

    ab_c, ab_d, cd_a, cd_b = cross(a, b, c), cross(a, b, d), cross(c, d, a), cross(c, d, b)
    if ab_c * ab_d < -EPS and cd_a * cd_b < -EPS:
        return True
    return not proper and any(
        _distance(p, q, r) < EPS for p, q, r in ((a, c, d), (b, c, d), (c, a, b), (d, a, b))
    )


def _outline(room: Item) -> tuple[Point, ...] | None:
    try:
        polygon = outline_polygon(room["outline"])
        if abs(polygon_area(polygon)) < EPS:
            return None
        edges = _edges(polygon)
        for i, (a, b) in enumerate(edges):
            if math.hypot(a.x - b.x, a.y - b.y) < EPS:
                return None
            for j in range(i + 2, len(edges)):
                if i == 0 and j == len(edges) - 1:
                    continue
                if _crosses(a, b, *edges[j]):
                    return None
        return polygon
    except (ValueError, KeyError, IndexError, TypeError):
        return None


def _label(table: Item) -> str:
    value = str(table["label"])
    return value[6:] if value.lower().startswith("table ") else value


def validate_rooms(rooms: Sequence[Item], *, for_publication: bool = False) -> list[dict[str, Any]]:
    problems: list[dict[str, Any]] = []
    for room in rooms:
        polygon = _outline(room)
        tables = room.get("tables", [])

        def add(
            code: str,
            level: str,
            message: str,
            keys: list[str],
            room_key: str = room["key"],
            **details: Any,
        ) -> None:
            problems.append(
                {
                    "code": code,
                    "level": level,
                    "message": message,
                    "room_key": room_key,
                    "table_keys": keys,
                    **details,
                }
            )

        if polygon is None:
            add("outline_invalid", "error", "The walls cross each other.", [])
        windows = [o for o in room.get("openings", []) if o.get("kind") in {"window", "glass_wall"}]
        if for_publication and windows and room.get("north_deg") is None:
            add("no_north", "error", "Set north so we can work out the sun.", [])
        for opening in windows:
            if not opening.get("view_text", "").strip():
                add(
                    "window_no_view",
                    "info",
                    "Add what guests see from this window.",
                    [],
                    opening_key=opening["key"],
                )
        for i, table in enumerate(tables):
            if polygon is not None and not _inside(_shape(table), polygon):
                add(
                    "table_outside",
                    "error",
                    f"Table {_label(table)} is outside the walls.",
                    [table["key"]],
                )
            for other in tables[i + 1 :]:
                depth = _penetration(_shape(table), _shape(other))
                same_group = table.get("combine_group") and table.get("combine_group") == other.get(
                    "combine_group"
                )
                if (
                    table.get("is_active", True)
                    and other.get("is_active", True)
                    and depth is not None
                    and depth > (2 + EPS if same_group else EPS)
                ):
                    add(
                        "tables_overlap",
                        "error",
                        f"Tables {_label(table)} and {_label(other)} overlap.",
                        [table["key"], other["key"]],
                    )
                if _penetration(_shape(table, 45), _shape(other, 45)) is not None:
                    add(
                        "tight_passage",
                        "warning",
                        f"Little room to walk between tables {_label(table)} and {_label(other)}.",
                        [table["key"], other["key"]],
                    )
            for fixture in room.get("fixtures", []):
                if _penetration(_shape(table), _shape(fixture)) is not None:
                    name = fixture.get("label") or str(fixture["kind"]).replace("_", " ")
                    add(
                        "fixture_overlap",
                        "warning",
                        f"Table {_label(table)} overlaps the {name}.",
                        [table["key"]],
                        fixture_key=fixture["key"],
                    )
    if for_publication and not any(
        t.get("is_active", True) for room in rooms for t in room.get("tables", [])
    ):
        problems.append(
            {
                "code": "no_tables",
                "level": "error",
                "message": "Add at least one table.",
                "room_key": None,
                "table_keys": [],
            }
        )
    return problems
