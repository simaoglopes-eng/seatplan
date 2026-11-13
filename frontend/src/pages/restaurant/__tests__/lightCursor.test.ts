import { describe, expect, it } from "vitest";
import { sunsetPercent } from "../LightCursor";

const STEPS = ["20:00", "20:15", "20:30", "20:45", "21:00", "21:15", "21:30"];

describe("sunsetPercent", () => {
  it("places the sunset along the booked stay", () => {
    expect(sunsetPercent(STEPS, "20:45")).toBeCloseTo(50);
    expect(sunsetPercent(STEPS, "20:00")).toBe(0);
    expect(sunsetPercent(STEPS, "21:30")).toBe(100);
  });

  it("says nothing when the sunset is outside the stay or unknown", () => {
    expect(sunsetPercent(STEPS, "19:59")).toBeNull();
    expect(sunsetPercent(STEPS, "21:31")).toBeNull();
    expect(sunsetPercent(STEPS, null)).toBeNull();
    expect(sunsetPercent(["20:00"], "20:00")).toBeNull();
  });
});
