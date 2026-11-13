"""Known geometric examples for centimetre coordinates with screen y down."""

import math

import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.ambience.geometry import (
    Point,
    bearing,
    outline_polygon,
    point_in_polygon,
    polygon_area,
    rect_corners,
    side_normal,
)


def test_rectangle_and_boundary() -> None:
    outline = {
        "points": [{"x": 0, "y": 0}, {"x": 1000, "y": 0}, {"x": 1000, "y": 700}, {"x": 0, "y": 700}]
    }
    polygon = outline_polygon(outline, 16)
    assert polygon_area(polygon) == 700000
    assert point_in_polygon(Point(500, 350), polygon)
    assert point_in_polygon(Point(0, 350), polygon)
    assert not point_in_polygon(Point(-1, 350), polygon)


def test_positive_curve_bulges_outside_clockwise_room() -> None:
    outline = {
        "points": [
            {"x": 0, "y": 0, "curve": 50},
            {"x": 100, "y": 0},
            {"x": 100, "y": 100},
            {"x": 0, "y": 100},
        ]
    }
    polygon = outline_polygon(outline, 16)
    assert polygon[8].x == pytest.approx(50)
    assert polygon[8].y == pytest.approx(-50)
    assert side_normal(outline, 0, 0.5) == pytest.approx((0, -1))
    assert polygon_area(polygon) > 10000


def test_bearings_match_spec() -> None:
    assert bearing(0, -1, 0) == 0
    assert bearing(1, 0, 90) == 0
    assert bearing(1, 0, 0) == 90


@given(st.floats(min_value=0, max_value=360, allow_nan=False))
def test_rotated_rectangle_keeps_area(angle: float) -> None:
    corners = rect_corners(10, 20, 80, 40, angle)
    assert polygon_area(corners) == pytest.approx(3200)
    assert point_in_polygon(Point(50, 40), corners)
    assert all(math.isfinite(p.x) and math.isfinite(p.y) for p in corners)
