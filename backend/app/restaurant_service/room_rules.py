"""Structural room rules before persistence; geometric draft errors stay editable."""

import math

from app.ambience.geometry import outline_polygon, polygon_area
from app.core.errors import ApiError

EPS = 1e-6
VIEW_TAGS = {
    "river",
    "sea",
    "street",
    "garden",
    "courtyard",
    "monument",
    "city",
    "hills",
    "pool",
    "square",
}


def normalise_winding(room: dict) -> dict:
    try:
        if polygon_area(outline_polygon(room["outline"])) >= 0:
            return room
    except (ValueError, IndexError):
        # Unfinished/invalid geometry can be saved as a draft, without windows
        # referencing missing sides. Publication validation reports its errors.
        return room
    points = room["outline"]["points"]
    count = len(points)
    reversed_points = [
        dict(point, curve=-points[(count - 2 - i) % count].get("curve", 0))
        for i, point in enumerate(reversed(points))
    ]
    openings = [
        dict(
            o,
            side=(count - 2 - o["side"]) % count,
            offset=max(0, side_length(room["outline"], o["side"]) - o["offset"] - o["width"]),
        )
        for o in room["openings"]
    ]
    return {**room, "outline": {"points": reversed_points}, "openings": openings}


def side_length(outline: dict, side: int) -> float:
    points = outline["points"]
    if not 0 <= side < len(points):
        raise ApiError(422, "validation", "Choose an existing wall for the opening.")
    a, b = points[side], points[(side + 1) % len(points)]
    chord = math.hypot(b["x"] - a["x"], b["y"] - a["y"])
    curve = abs(a.get("curve", 0))
    if chord < EPS or curve > chord / 2 + EPS:
        raise ApiError(422, "validation", "Repair the wall before placing an opening on it.")
    if curve < EPS:
        return chord
    radius = (chord * chord / 4 + curve * curve) / (2 * curve)
    return radius * 4 * math.atan(2 * curve / chord)


def check_openings(room: dict) -> None:
    for i, opening in enumerate(room["openings"]):
        length = side_length(room["outline"], opening["side"])
        offset, width = opening["offset"], opening["width"]
        if offset + width > length + EPS:
            raise ApiError(422, "validation", "Openings must stay within their wall.")
        if opening["kind"] == "glass_wall" and (abs(offset) > EPS or abs(width - length) > EPS):
            raise ApiError(422, "validation", "A glass wall must cover the whole wall.")
        if opening["is_main_entrance"] and opening["kind"] != "door":
            raise ApiError(422, "validation", "Only a door can be the main entrance.")
        tags = opening["view_tags"]
        if len(set(tags)) != len(tags) or not set(tags) <= VIEW_TAGS:
            raise ApiError(422, "validation", "Choose up to three different known view tags.")
        if (
            opening["sun_rule"] == "between"
            and opening["sun_from"] is not None
            and opening["sun_from"] == opening["sun_until"]
        ):
            raise ApiError(
                422, "validation", "Sunlight hours must have different start and end times."
            )
        for other in room["openings"][i + 1 :]:
            if (
                opening["side"] == other["side"]
                and offset < other["offset"] + other["width"] - EPS
                and other["offset"] < offset + width - EPS
            ):
                raise ApiError(422, "validation", "Openings on the same wall cannot overlap.")
