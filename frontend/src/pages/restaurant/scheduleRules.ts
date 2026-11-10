// Checks for the schedule editor, as pure functions. The server checks again;
// these let staff see every problem before they press Save.
import type { Schedule } from "../../api/restaurant";
import { toMinutes } from "./format";

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Slot lengths must be whole 15-minute blocks, because tables are booked in 15-minute slots. */
export const SLOT_LENGTHS = [15, 30, 45, 60];

/** Returns one plain sentence per problem; an empty list means the schedule can be saved. */
export function scheduleProblems(schedule: Schedule): string[] {
  const problems: string[] = [];
  schedule.services.forEach((service, i) => {
    const name = service.name.trim() || `Service ${i + 1}`;
    if (service.name.trim() === "") problems.push(`Service ${i + 1} needs a name, for example Lunch.`);
    if (toMinutes(service.end_time) <= toMinutes(service.start_time)) problems.push(`${name} on ${WEEKDAYS[service.weekday]} ends before it starts.`);
    if (service.max_covers_per_slot < 1) problems.push(`${name} needs at least 1 cover per slot.`);
  });
  schedule.turn_times.forEach((turn) => {
    if (turn.max_party < 1 || turn.minutes < 15) problems.push(`Turn time for up to ${turn.max_party} people must be at least 15 minutes.`);
  });
  schedule.blackout_dates.forEach((blackout, i) => {
    if (blackout.date === "") problems.push(`Closed day ${i + 1} needs a date.`);
    if (blackout.reason.trim() === "") problems.push(`Closed day ${blackout.date || i + 1} needs a reason; diners will see it.`);
  });
  return problems;
}

/** A copy of `list` with item `index` changed, for immutable React state. */
export function updateAt<T>(list: T[], index: number, patch: Partial<T>): T[] {
  return list.map((item, i) => (i === index ? { ...item, ...patch } : item));
}

export function removeAt<T>(list: T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}
