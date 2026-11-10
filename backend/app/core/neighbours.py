"""Which seats at one table count as "next to" each other.

Pure geometry, no database: the layout save calls neighbour_pairs() once per
table and stores the result in seat_neighbours.

- round table: walk around the centre by angle; each seat touches the next
  one, and the last seat touches the first (it is a circle).
- row: seats side by side along the row, in order.
- rect: a long table has two sides; seats are neighbours when they are
  consecutive on the same side. Seats facing each other are not "next to".
"""

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class TableShape:
    shape: str  # "round", "rect" or "row"
    centre_x: float
    centre_y: float
    rotation_deg: float


@dataclass(frozen=True)
class SeatPoint:
    id: int
    x: float
    y: float


def _to_table_axes(table: TableShape, seat: SeatPoint) -> tuple[float, float]:
    """Seat position as seen by the table: undo the table's rotation so that
    "along the table" is always the x axis."""
    dx = seat.x - table.centre_x
    dy = seat.y - table.centre_y
    angle = math.radians(-table.rotation_deg)
    along = dx * math.cos(angle) - dy * math.sin(angle)
    across = dx * math.sin(angle) + dy * math.cos(angle)
    return along, across


def _chain(seats: list[SeatPoint]) -> list[tuple[int, int]]:
    """Each seat with the next one in the list."""
    return [(seats[i].id, seats[i + 1].id) for i in range(len(seats) - 1)]


def _round_pairs(table: TableShape, seats: list[SeatPoint]) -> list[tuple[int, int]]:
    ordered = sorted(seats, key=lambda s: math.atan2(s.y - table.centre_y, s.x - table.centre_x))
    pairs = _chain(ordered)
    # Close the circle, but two seats would otherwise be paired twice.
    if len(ordered) >= 3:
        pairs.append((ordered[-1].id, ordered[0].id))
    return pairs


def _line_pairs(table: TableShape, seats: list[SeatPoint]) -> list[tuple[int, int]]:
    ordered = sorted(seats, key=lambda s: _to_table_axes(table, s)[0])
    return _chain(ordered)


def _rect_pairs(table: TableShape, seats: list[SeatPoint]) -> list[tuple[int, int]]:
    side_a = [s for s in seats if _to_table_axes(table, s)[1] < 0]
    side_b = [s for s in seats if _to_table_axes(table, s)[1] >= 0]
    return _line_pairs(table, side_a) + _line_pairs(table, side_b)


def neighbour_pairs(table: TableShape, seats: list[SeatPoint]) -> list[tuple[int, int]]:
    """Unordered neighbour pairs for one table. The caller stores both directions."""
    if len(seats) < 2:
        return []
    if table.shape == "round":
        return _round_pairs(table, seats)
    if table.shape == "rect":
        return _rect_pairs(table, seats)
    return _line_pairs(table, seats)
