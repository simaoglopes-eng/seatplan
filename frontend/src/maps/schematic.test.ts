import { describe, expect, it } from "vitest";
import { BOX, placePins } from "./schematic";

const LISBON = { id: "a", name: "Casa A", lat: 38.7223, lng: -9.1393 };
const NORTH = { id: "b", name: "Casa B", lat: 38.7523, lng: -9.1393 }; // about 3.3 km due north
const EAST = { id: "c", name: "Casa C", lat: 38.7223, lng: -9.0993 }; // about 3.5 km due east

describe("placePins", () => {
  it("numbers the pins in list order and keeps every one inside the box", () => {
    const { pins } = placePins([LISBON, NORTH, EAST]);
    expect(pins.map((p) => p.number)).toEqual([1, 2, 3]);
    for (const pin of pins) {
      expect(pin.x).toBeGreaterThan(0);
      expect(pin.x).toBeLessThan(BOX.width);
      expect(pin.y).toBeGreaterThan(0);
      expect(pin.y).toBeLessThan(BOX.height);
    }
  });

  it("puts north up and east to the right", () => {
    const { pins } = placePins([LISBON, NORTH, EAST]);
    const [home, north, east] = pins;
    expect(north.y).toBeLessThan(home.y);
    expect(Math.abs(north.x - home.x)).toBeLessThan(0.001);
    expect(east.x).toBeGreaterThan(home.x);
    expect(Math.abs(east.y - home.y)).toBeLessThan(0.001);
  });

  it("keeps distances in proportion: the same number of metres looks the same length east and north", () => {
    const { pins } = placePins([LISBON, NORTH, EAST]);
    const [home, north, east] = pins;
    const up = home.y - north.y; // about 3.3 km
    const right = east.x - home.x; // about 3.5 km
    expect(right / up).toBeGreaterThan(3.5 / 3.4);
    expect(right / up).toBeLessThan(3.5 / 3.2);
  });

  it("draws a scale bar with a round number that is not wider than a third of the box", () => {
    const { scale } = placePins([LISBON, NORTH, EAST]);
    expect(scale).not.toBeNull();
    expect(scale?.label).toMatch(/^(100|200|500) m$|^\d+ km$/);
    expect(scale!.width).toBeLessThanOrEqual(BOX.width * 0.3);
    expect(scale!.width).toBeGreaterThan(0);
  });

  it("handles a single pin without zooming to infinity, and a pin of the searcher's own place", () => {
    const one = placePins([LISBON]);
    expect(one.pins).toHaveLength(1);
    expect(Number.isFinite(one.pins[0].x) && Number.isFinite(one.pins[0].y)).toBe(true);
    const withCentre = placePins([LISBON], { lat: 38.73, lng: -9.14 });
    expect(withCentre.centre).not.toBeNull();
  });

  it("says nothing for no pins", () => {
    expect(placePins([])).toEqual({ pins: [], centre: null, scale: null });
  });
});
