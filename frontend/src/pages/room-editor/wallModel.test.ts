import { expect, it } from "vitest";
import { createRoom } from "./roomModel";
import { addOpening, updateOpening, openingBearing, wallOffset } from "./wallModel";
import { setSideCurve, setSideLength } from "./shapeEditing";

it("adds immutable openings into free wall space and rejects overlap", () => {
  const original = createRoom("Main", 1000, 700);
  const window = addOpening(original, 0, "window");
  expect(original.openings).toHaveLength(0);
  expect(window.openings[0]).toMatchObject({ width: 120, top_height: 220, sun_rule: "auto" });
  const door = addOpening(window, 0, "door");
  expect(door.openings[1].offset).toBeGreaterThanOrEqual(120);
  expect(() => updateOpening(door, door.openings[1].key, { offset: 100 })).toThrow(/overlap/i);
  expect(() => updateOpening(window, window.openings[0].key, { width: 39 })).toThrow();
  expect(() => addOpening(window, 0, "glass_wall")).toThrow();
});

it("uses arc length and outward normal at the opening midpoint", () => {
  const curved = setSideCurve(createRoom("Arc", 100, 100), 0, 50);
  const room = addOpening({ ...curved, north_deg: 0 }, 0, "glass_wall");
  expect(room.openings[0].width).toBeCloseTo(157.0796326795);
  expect(openingBearing(room, room.openings[0])).toBeCloseTo(0, 3);
  const left = updateOpening({ ...room, openings: [{ ...room.openings[0], kind: "window" }] }, room.openings[0].key, { offset: 0, width: Math.PI * 25 });
  expect(openingBearing(left, left.openings[0])).toBeCloseTo(315, 3);
  expect(openingBearing({ ...room, north_deg: null }, room.openings[0])).toBeNull();
});

it("keeps full glass on resized walls and refuses to shrink across a window", () => {
  const glass = addOpening(createRoom("Glass", 1000, 700), 0, "glass_wall");
  expect(setSideLength(glass, 0, 1200).openings[0].width).toBeCloseTo(1200);
  const window = addOpening(createRoom("Window", 1000, 700), 0, "window");
  const moved = updateOpening(window, window.openings[0].key, { offset: 800 });
  expect(() => setSideLength(moved, 0, 850)).toThrow(/within the wall/i);
  expect(moved.openings[0].offset).toBe(800);
});

it("validates view and sun fields and measures dragging along the curve", () => {
  const room = addOpening(setSideCurve(createRoom("Arc", 100, 100), 0, 50), 0, "window");
  const key = room.openings[0].key;
  expect(wallOffset(room, 0, { x: 50, y: -50 })).toBeCloseTo(Math.PI * 25, 3);
  expect(() => updateOpening(room, key, { top_height: 99 })).toThrow();
  expect(() => updateOpening(room, key, { view_tags: ["river", "sea", "city", "hills"] })).toThrow();
  expect(() => updateOpening(room, key, { sun_rule: "between", sun_from: "15:00", sun_until: "10:00" })).toThrow();
  expect(updateOpening(room, key, { sun_rule: "between", sun_from: "10:00", sun_until: "15:00" }).openings[0].sun_until).toBe("15:00");
});
