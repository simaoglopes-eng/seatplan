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

validation.py exposes validate_rooms(rooms, for_publication=False), taking plain
structurally validated room mappings and returning code/level/message/room_key/
table_keys plus optional opening_key/fixture_key. It mirrors browser validation.
There are no imports of the ambience input model or table/light modules.
Outlines use 16 arc segments and reject self-crossing/touching or degenerate
edges. Circles use radius containment; rotated rectangles use corners, centre
and wall crossings so they cannot bridge a concave notch. Overlap uses SAT,
with circle axes and a true minimum penetration depth for nested intervals.
Join groups allow at most 2 cm penetration. Exact boundary contact has no area
overlap. Expanded table footprints add 45 cm on every side for passage warnings.
Inactive tables still exist physically for passage/fixture warnings; only active
table pairs produce tables_overlap. No north/no active tables are publication-only.
Draft problems never replace structural/reference checks in the persistence layer.


solar.py exposes sun_position and sun_times with frozen SunPosition/SunTimes.
Instants must be timezone aware. Input longitudes are positive east, and output
rise/set/noon instants use the requested ZoneInfo timezone. Rise/set are None
on polar days and nights. The 90.833 degree apparent horizon applies only to
rise/set. The geometric altitude is used for later direct-sun decisions.
Reference equations are linked in solar.py. Tests cover the approved Lisbon
solstice reference times and angles, summer night, UTC equivalence and Troms?.
