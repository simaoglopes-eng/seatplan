import { expect, it } from "vitest";
import { createInitialShape, snappedPoint } from "./shapeModel";
import { polygonArea } from "./geometry";

it("creates an L-shaped room with the specified cutout", () => {
  const room = createInitialShape("L room", "l-shape", 1000, 700, 300, 200, false);
  expect(room.outline.points).toHaveLength(6);
  expect(polygonArea(room.outline.points)).toBe(640000);
});

it("snaps corners to fifty centimetres and constrains shift drawing to 45 degrees", () => {
  expect(snappedPoint({ x: 126, y: 76 }, null, true, false)).toEqual({ x: 150, y: 100 });
  const point = snappedPoint({ x: 140, y: 110 }, { x: 0, y: 0 }, true, true);
  expect(point.x).toBeCloseTo(point.y);
});

it("refuses blank names and non-finite cutout dimensions", () => {
  expect(() => createInitialShape(" ", "rectangle", 1000, 700, 300, 200, false)).toThrow();
  expect(() => createInitialShape("L room", "l-shape", 1000, 700, NaN, 200, false)).toThrow();
});
