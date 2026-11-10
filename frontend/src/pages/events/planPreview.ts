// Pure helpers for the organiser map: who sits where, and how the map would
// look if a scenario were applied. No React here, so each rule can be tested.
import type { OrganiserGuest, Scenario } from "../../api/events";
import type { MapSeat } from "../../api/types";

/** seat id -> guest sitting there, from the guest list. */
export function guestBySeat(guests: OrganiserGuest[]): Map<number, OrganiserGuest> {
  const result = new Map<number, OrganiserGuest>();
  for (const guest of guests) {
    if (guest.seat_id !== null) result.set(guest.seat_id, guest);
  }
  return result;
}

/**
 * The map as it would look after the scenario: every seat in the scenario
 * becomes taken with the guest's real name; every other seat that is not
 * blocked becomes free (re-plan may have emptied it).
 */
export function previewSeats(seats: MapSeat[], guests: OrganiserGuest[], scenario: Scenario): MapSeat[] {
  const nameById = new Map(guests.map((g) => [g.id, g.name]));
  const occupantBySeat = new Map<number, string>();
  for (const [guestId, seatId] of Object.entries(scenario.assignments)) {
    occupantBySeat.set(seatId, nameById.get(Number(guestId)) ?? "Guest");
  }
  return seats.map((seat) => {
    if (seat.state === "blocked") return seat;
    const occupant = occupantBySeat.get(seat.id);
    // A seat an attendee is holding right now stays held: the scenario cannot touch it.
    if (occupant === undefined && seat.state === "held") return seat;
    if (occupant === undefined) return { ...seat, state: "free", occupant: null };
    return { ...seat, state: "taken", occupant };
  });
}

/** Seats that get a new guest in the scenario (placed or moved), so the map can mark them. */
export function changedSeats(scenario: Scenario, guests: OrganiserGuest[]): Set<number> {
  const seatNow = new Map(guests.map((g) => [g.id, g.seat_id]));
  const changed = new Set<number>();
  for (const [guestId, seatId] of Object.entries(scenario.assignments)) {
    if (seatNow.get(Number(guestId)) !== seatId) changed.add(seatId);
  }
  return changed;
}

/** How many guests without a seat today get one in the scenario. */
export function placedCount(scenario: Scenario, guests: OrganiserGuest[]): number {
  const unseated = new Set(guests.filter((g) => g.seat_id === null).map((g) => g.id));
  return Object.keys(scenario.assignments).filter((id) => unseated.has(Number(id))).length;
}

/** Turns a drop point into a seat id, using the seat's DOM id ("...-t42"). */
export function seatIdFromElement(element: Element | null): number | null {
  const option = element?.closest('[role="option"]');
  const match = option?.id.match(/-t(\d+)$/);
  return match ? Number(match[1]) : null;
}
