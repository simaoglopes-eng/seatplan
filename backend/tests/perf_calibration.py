"""How slow is this machine right now? Used by the timing tests (spec 12: 300 ms and 500 ms limits).

The limits are for an ordinary, idle laptop. A machine that is also running a browser, Docker or a second test
run is slower for everything, and a fixed limit then fails for a reason that has nothing to do with the code.
So each timing test scales its limit by how much slower a fixed piece of pure Python is than it was on the idle
machine where the limits were set (both are measured on the wall clock, under the same load). The scale never goes below 1, and it is capped, so a real slowdown of the
code (several times slower than its limit) still fails on any machine.
"""

import time

from app.ambience.geometry import Point, point_in_polygon

# A fixed piece of the same kind of work the timing tests exercise (point-in-polygon tests, as in the light
# maths), so a busy machine slows the benchmark about as much as it slows the code under test.
POLYGON = tuple(Point(100 * (1 + (i % 2)) * 0.5 + i, 50 * i % 90) for i in range(16))
BENCH_STEPS = 20_000
# Wall-clock seconds for BENCH_STEPS tests on an idle development laptop (estimated 2026-11-14 from the ratio to the 60-table map, which took about 0.2 s then).
REFERENCE_SECONDS = 0.08
MAX_SCALE = 4.0


def _bench() -> float:
    began = time.perf_counter()
    for step in range(BENCH_STEPS):
        point_in_polygon(Point(step % 97, step % 89), POLYGON)
    return time.perf_counter() - began


def machine_scale() -> float:
    """1.0 on an idle machine; up to MAX_SCALE when everything is running slower than that."""
    # The middle of five, not the best: one quiet moment must not hide that the machine is busy.
    middle = sorted(_bench() for _ in range(5))[2]
    return min(MAX_SCALE, max(1.0, middle / REFERENCE_SECONDS))


def limit(seconds: float) -> float:
    """The limit for this machine right now."""
    return seconds * machine_scale()
