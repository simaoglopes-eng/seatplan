// A starting point for restaurants with no opening hours yet (spec 5.3 step 4):
// "Lunch 12:00-15:00 and Dinner 19:00-23:00, Tuesday to Sunday". The owner can
// change anything afterwards; nothing is saved until they tap "Use this".
import type { ServerSchedule } from "../../api/restaurant";

/** Monday is 0, so Tuesday to Sunday is 1 to 6. */
const OPEN_DAYS = [1, 2, 3, 4, 5, 6];

export const TEMPLATE_TEXT = "Lunch 12:00-15:00 and Dinner 19:00-23:00, Tuesday to Sunday";

export const TEMPLATE_SCHEDULE: ServerSchedule = {
  service_periods: OPEN_DAYS.flatMap((weekday) => [
    { name: "Lunch", weekday, start_time: "12:00", end_time: "15:00", slot_minutes: 15, max_covers_per_slot: 30 },
    { name: "Dinner", weekday, start_time: "19:00", end_time: "23:00", slot_minutes: 15, max_covers_per_slot: 40 },
  ]),
  turn_times: [
    { max_party: 2, minutes: 90 },
    { max_party: 4, minutes: 105 },
    { max_party: 6, minutes: 120 },
    { max_party: 10, minutes: 150 },
  ],
  blackout_dates: [],
};
