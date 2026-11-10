// Pure decisions for the attendee page: which step to show, and whether a
// live update means "the seat you wanted is gone". Kept out of React so each
// rule can be read and tested on its own.
import type { AttendeeView, SeatRecommendation, VisiblePerson } from "../../api/events";
import type { MapSeat } from "../../api/types";
import { deadlinePassed } from "./format";

/** A seat held in this browser, with the moment the server will let it go. */
export interface ActiveHold {
  seat_id: number;
  expires_at: string;
}

export type AttendeeStep = "welcome" | "declined" | "closed" | "people" | "seat" | "done";

export interface StepInputs {
  view: AttendeeView;
  peopleDone: boolean;
  changingSeat: boolean;
  now?: number;
}

/** The one step the attendee should see right now, in the order of the journey. */
export function currentStep({ view, peopleDone, changingSeat, now }: StepInputs): AttendeeStep {
  const { me, event, people } = view;
  if (me.rsvp === "pending") return "welcome";
  if (me.rsvp === "no") return "declined";
  if (event.deadline_passed || deadlinePassed(event.change_deadline, now)) return "closed";
  if (me.seat_id !== null && !changingSeat) return "done";
  // Someone who already listed people, or who has nobody to list, skips the step.
  const needsPeopleStep = !peopleDone && me.knows.length === 0 && people.length > 0;
  return needsPeopleStep ? "people" : "seat";
}

/** Index for the Stepper at the top of the page. */
export function stepIndex(step: AttendeeStep): number {
  if (step === "welcome" || step === "declined") return 0;
  if (step === "people") return 1;
  if (step === "seat") return 2;
  return 3;
}

/**
 * After fresh data arrives: is the seat I hold, or the one I am looking at,
 * now gone? My own hold shows as "held", so a held seat is lost only when it
 * shows as someone's seat (taken or friend) or closed; a seat I am only
 * looking at is lost as soon as it is not free any more.
 */
export function lostSeat(seats: MapSeat[], hold: ActiveHold | null, lookingAt: number | null): number | null {
  const stateOf = (id: number) => seats.find((s) => s.id === id)?.state;
  // Someone else now sits there: shown as taken, or as friend if I know them.
  const heldState = hold ? stateOf(hold.seat_id) : undefined;
  if (hold && (heldState === "taken" || heldState === "friend" || heldState === "blocked")) return hold.seat_id;
  if (lookingAt !== null && lookingAt !== hold?.seat_id) {
    const state = stateOf(lookingAt);
    if (state !== undefined && state !== "free") return lookingAt;
  }
  return null;
}

/**
 * What to say after the person saved who they know. "Seats near them" is only
 * true when at least one of those people already has a seat.
 */
export function knowsSavedMessage(ids: number[], people: VisiblePerson[]): string {
  if (ids.length === 0) return "Here is the seat map.";
  const saved = `Saved ${ids.length} ${ids.length === 1 ? "person" : "people"}.`;
  const chosen = new Set(ids);
  const anySeated = people.some((person) => chosen.has(person.id) && person.seat_id !== null);
  if (anySeated) return `${saved} Seats near them are suggested below.`;
  return `${saved} Nobody you chose has a seat yet, so any free seat is fine for now. You can change it later.`;
}

/** The best recommendation that is still free and is not the seat we just lost. */
export function nextBest(recs: SeatRecommendation[], seats: MapSeat[], exclude: number): SeatRecommendation | null {
  const free = new Set(seats.filter((s) => s.state === "free").map((s) => s.id));
  return recs.find((rec) => rec.seat_id !== exclude && free.has(rec.seat_id)) ?? null;
}
