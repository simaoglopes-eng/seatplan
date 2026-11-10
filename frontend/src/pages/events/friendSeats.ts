// Finds the free seats right next to people you know, so the map can point
// them out. The attendee map has no neighbour list (that stays on the server
// for the optimiser), so "next to" here means: same table, and one of the two
// closest seats to the friend. Two, because a seat has a left and a right.
import type { MapSeat } from "../../api/types";

const NEIGHBOURS_PER_FRIEND = 2;

function distance(a: MapSeat, b: MapSeat): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Ids of the seats closest to `seat` at the same table, nearest first. */
function closestAtTable(seat: MapSeat, seats: MapSeat[]): MapSeat[] {
  return seats
    .filter((other) => other.table_id === seat.table_id && other.id !== seat.id)
    .sort((a, b) => distance(seat, a) - distance(seat, b))
    .slice(0, NEIGHBOURS_PER_FRIEND);
}

/** Free seats sitting directly next to a seat in the `friend` state. */
export function seatsNextToFriends(seats: MapSeat[]): Set<number> {
  const result = new Set<number>();
  for (const seat of seats) {
    if (seat.state !== "friend") continue;
    for (const neighbour of closestAtTable(seat, seats)) {
      if (neighbour.state === "free") result.add(neighbour.id);
    }
  }
  return result;
}
