import { expect, it } from "vitest";
import { compassNorth, normaliseNorth, northAt } from "./northModel";

it("keeps north in screen clockwise degrees and ignores relative orientation", () => {
  expect(normaliseNorth(-15)).toBe(345);
  expect(normaliseNorth(360)).toBe(0);
  expect(northAt({ x: 100, y: 0 })).toBe(90);
  expect(northAt({ x: 0, y: -100 })).toBe(0);
  expect(compassNorth({ alpha: 90, absolute: false })).toBeNull();
  expect(compassNorth({ alpha: 90, absolute: true })).toBe(90);
  expect(compassNorth({ webkitCompassHeading: 90 })).toBe(270);
});
