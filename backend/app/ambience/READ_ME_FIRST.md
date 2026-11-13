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


models.py holds the engine's inputs as frozen values (AmbienceRoom,
AmbienceOpening, AmbienceFixture, AmbienceTable, AmbienceSeat). The service
layer fills them from database rows; the engine never sees a row.

light.py (spec 7.3, 7.4) decides direct sun and table light:
- window_has_sun: the owner's rule (auto, never, between HH:MM-HH:MM) must
  allow it, north must be set, the sun must be more than 3 degrees high and
  within 80 degrees of the way the window faces. Doors never let sun in.
- sun_patches: one parallelogram per sunny window, from the window into the
  room along the light, top_height / tan(altitude) deep, capped at 600 cm.
  A window on a curved side is cut into 16 pieces, each judged by its own
  facing. Outdoors the whole room is the patch while the sun is up.
- table_light: night > sun (2 of 5 sample points in a patch and in the room)
  > sunset (last 45 min, within 3 m of a window facing 200-340 degrees)
  > shade (outdoors under an awning) > daylight (within 3 m of a window)
  > interior. Distances are edge to edge (table footprint to window).

Why can the owner's hours not create sun? The rule only narrows what the
geometry allows; it never overrides "the sun is behind the building".

solar.py exposes sun_position and sun_times with frozen SunPosition/SunTimes.
Instants must be timezone aware. Input longitudes are positive east, and output
rise/set/noon instants use the requested ZoneInfo timezone. Rise/set are None
on polar days and nights. The 90.833 degree apparent horizon applies only to
rise/set. The geometric altitude is used for later direct-sun decisions.
Reference equations are linked in solar.py. Tests cover the approved Lisbon
solstice reference times and angles, summer night, UTC equivalence and Troms?.
