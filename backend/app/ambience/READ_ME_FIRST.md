# Ambience

Pure centimetre geometry and sunlight calculations for restaurants. No database,
HTTP or network dependencies. Screen x points right and y points down.

geometry.py exposes frozen Point values, outline_polygon, side_point,
side_normal, polygon_area, point_in_polygon, rect_corners and bearing.
Positive signed area means clockwise screen winding. A positive outgoing
sagitta bulges outward on a clockwise outline. Boundary points are inside.
Table positions retain the shared unrotated bounding-box convention.

Tests use known rectangles, a semicircle and property checks for rotated area.
Run from backend with ..\.venv\Scripts\python.exe -m pytest tests/test_ambience_geometry.py.

Why approximate curves? Drawing, containment and later email rendering need the
same deterministic polygon. Each curved side uses 16 segments by default.

Why is north subtracted? north_deg describes the clockwise screen direction
of real north, so screen bearings must be relative to that direction.

Who validates a draft? Geometry provides measurements. The editor validation
layer reports geometric problems and the persistence layer checks references.
