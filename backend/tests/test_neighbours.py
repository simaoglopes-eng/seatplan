"""Seat neighbour geometry, without a database."""

import math

from app.core.neighbours import SeatPoint, TableShape, neighbour_pairs


def _as_sets(pairs: list[tuple[int, int]]) -> set[frozenset[int]]:
    return {frozenset(pair) for pair in pairs}


def _round_seats(count: int, start_angle: float = 0.0) -> list[SeatPoint]:
    seats = []
    for i in range(count):
        angle = start_angle + 2 * math.pi * i / count
        seats.append(SeatPoint(i + 1, 50 + 10 * math.cos(angle), 50 + 10 * math.sin(angle)))
    return seats


def test_round_table_is_a_circle() -> None:
    table = TableShape("round", 50, 50, 0)
    # Given in a scrambled order: the angle, not the list order, decides.
    seats = _round_seats(6)
    scrambled = [seats[i] for i in (3, 0, 5, 1, 4, 2)]
    expected = {
        frozenset({1, 2}),
        frozenset({2, 3}),
        frozenset({3, 4}),
        frozenset({4, 5}),
        frozenset({5, 6}),
        frozenset({6, 1}),
    }
    assert _as_sets(neighbour_pairs(table, scrambled)) == expected


def test_round_table_with_two_seats_has_one_pair() -> None:
    table = TableShape("round", 50, 50, 0)
    assert _as_sets(neighbour_pairs(table, _round_seats(2))) == {frozenset({1, 2})}


def test_row_orders_seats_along_the_row() -> None:
    table = TableShape("row", 50, 10, 0)
    seats = [SeatPoint(3, 70, 10), SeatPoint(1, 30, 10), SeatPoint(2, 50, 10)]
    assert _as_sets(neighbour_pairs(table, seats)) == {frozenset({1, 2}), frozenset({2, 3})}


def test_rotated_row_still_works() -> None:
    # A vertical row: the table is rotated by 90 degrees.
    table = TableShape("row", 10, 50, 90)
    seats = [SeatPoint(1, 10, 30), SeatPoint(3, 10, 70), SeatPoint(2, 10, 50)]
    assert _as_sets(neighbour_pairs(table, seats)) == {frozenset({1, 2}), frozenset({2, 3})}


def test_rect_table_pairs_only_same_side() -> None:
    table = TableShape("rect", 50, 50, 0)
    top = [SeatPoint(1, 40, 40), SeatPoint(2, 60, 40)]
    bottom = [SeatPoint(3, 40, 60), SeatPoint(4, 60, 60)]
    assert _as_sets(neighbour_pairs(table, top + bottom)) == {frozenset({1, 2}), frozenset({3, 4})}


def test_single_seat_has_no_neighbours() -> None:
    assert neighbour_pairs(TableShape("round", 0, 0, 0), [SeatPoint(1, 1, 0)]) == []
