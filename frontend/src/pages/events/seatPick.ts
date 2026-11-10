// What a click (or Enter, or a drop) on a seat means in the organiser view.
// It is the keyboard alternative to drag and drop: choose a guest, then a seat.
//   - no guest chosen, seat occupied  -> pick up the guest sitting there
//   - guest chosen, seat free         -> move them (or, in what-if mode, show the score change first)
//   - guest chosen, seat occupied     -> explain, change nothing
import * as eventsApi from "../../api/events";
import type { OrganiserEvent } from "../../api/events";
import { ApiError } from "../../api/client";
import { seatName, signed } from "./format";
import { guestBySeat } from "./planPreview";
import type { OrganiserState } from "./useOrganiser";

export async function pickSeat(org: OrganiserState, data: OrganiserEvent, seatId: number, guestId: number | null): Promise<void> {
  const label = seatName(seatId, data.map.seats, data.map.tables);
  const sitting = guestBySeat(data.guests).get(seatId);
  if (guestId === null) {
    if (sitting) {
      org.setSelectedGuest(sitting.id);
      org.announce(`Picked ${sitting.name}. Now choose a free seat for them.`);
    } else {
      org.announce(`Choose a guest first (Guests tab, "Place"), then choose ${label}.`);
    }
    return;
  }
  const guest = data.guests.find((g) => g.id === guestId);
  if (!guest) return;
  if (sitting && sitting.id !== guestId) {
    org.announce(`${label} is taken by ${sitting.name}. Choose a free seat for ${guest.name}.`);
    return;
  }
  if (org.whatIfMode) {
    await previewMove(org, guestId, seatId, `${guest.name} to ${label}`);
    return;
  }
  const ok = await org.run("assign", `${guest.name} now sits at ${label}.`, async () => {
    await eventsApi.assignSeat(org.eventId, guestId, seatId);
  });
  if (ok) org.setSelectedGuest(null);
}

/** What-if: ask the server for the score change, show it, commit nothing yet. */
async function previewMove(org: OrganiserState, guestId: number, seatId: number, what: string): Promise<void> {
  try {
    const result = await eventsApi.whatIf(org.eventId, [{ guest_id: guestId, seat_id: seatId }]);
    org.setPendingMove({ move: { guest_id: guestId, seat_id: seatId }, result });
    org.announce(`What if: moving ${what} changes the score by ${signed(result.delta.total)}. Nothing has moved yet.`);
  } catch (error) {
    const text = error instanceof ApiError ? error.message : "The what-if check did not work.";
    org.announce(`Problem: ${text}`);
  }
}
