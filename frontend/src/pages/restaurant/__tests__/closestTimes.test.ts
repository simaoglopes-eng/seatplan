import { describe, expect, it } from "vitest";
import type { TimeSlot } from "../../../api/restaurant";
import { closestTimes } from "../StepTime";

const slot = (time: string, status: TimeSlot["status"] = "available"): TimeSlot => ({ time, service: "Dinner", status, reason: null });
const DAY = [slot("19:00"), slot("19:30", "full"), slot("20:00", "full"), slot("20:30"), slot("21:00", "limited"), slot("21:30")];

describe("closestTimes", () => {
  it("points to the nearest bookable times when the asked-for time is full", () => {
    expect(closestTimes(DAY, "20:00")).toEqual(["20:30", "19:00", "21:00"]);
  });

  it("is empty when the asked-for time can be booked, or nothing was asked for", () => {
    expect(closestTimes(DAY, "20:30")).toEqual([]);
    expect(closestTimes(DAY, null)).toEqual([]);
  });

  it("works for a time that is not a slot at all, and never offers a full time", () => {
    expect(closestTimes(DAY, "03:00")).toEqual(["19:00", "20:30", "21:00"]);
    expect(closestTimes([slot("20:00", "full")], "20:00")).toEqual([]);
  });
});
