import { expect, it } from "vitest";
import { outlineToPolygon, polygonArea, sidePoint } from "./geometry";
import { createRoom } from "./roomModel";
import { appendCorner, finishOutline, insertCorner, moveCorner, removeCorner, setSideCurve, setSideLength } from "./shapeEditing";

it("edits a side without mutating earlier history and bounds the curve", () => {
  const original = createRoom("Main", 1000, 700);
  const curved = setSideCurve(original, 0, 100);
  expect(original.outline.points[0].curve).toBe(0);
  expect(sidePoint(curved.outline, 0, 0.5).y).toBeCloseTo(-100);
  expect(() => setSideCurve(original, 0, 501)).toThrow();
  const longer = setSideLength(original, 0, 1200);
  expect(longer.outline.points[1].x).toBe(1200);
  expect(original.outline.points[1].x).toBe(1000);
});

it("splits a circular side into two arcs on the same circle", () => {
  const room = setSideCurve(createRoom("Curve", 100, 100), 0, 50);
  const split = insertCorner(room, 0);
  expect(split.outline.points).toHaveLength(5);
  expect(split.outline.points[1].x).toBeCloseTo(50);
  expect(split.outline.points[1].y).toBeCloseTo(-50);
  expect(sidePoint(split.outline, 0, 0.5).x).toBeCloseTo(14.64466094);
  expect(sidePoint(split.outline, 1, 0.5).x).toBeCloseTo(85.35533906);
});

it("moves and removes corners while retaining the minimum three", () => {
  const room = createRoom("Main", 1000, 700);
  const moved = moveCorner(room, 1, { x: 1100, y: 50 });
  expect(room.outline.points[1].x).toBe(1000);
  expect(moved.outline.points[1].x).toBe(1100);
  const triangle = removeCorner(room, 1);
  expect(triangle.outline.points).toHaveLength(3);
  expect(() => removeCorner(triangle, 0)).toThrow();
});

it("ignores repeated drawing taps and closes clockwise", () => {
  const room = { ...createRoom("Draw", 1000, 700), outline: { points: [] } };
  const a = appendCorner(room, { x: 0, y: 0 });
  expect(appendCorner(a, { x: 0, y: 0 })).toBe(a);
  const b = appendCorner(a, { x: 0, y: 700 });
  expect(appendCorner(b, { x: 0, y: 0 })).toBe(b);
  const c = appendCorner(b, { x: 1000, y: 700 });
  expect(polygonArea(outlineToPolygon(finishOutline(c).outline))).toBeGreaterThan(0);
});

it("sets a curved wall length while keeping its sagitta", () => {
  const room = setSideCurve(createRoom("Quarter circle", 100, 100), 0, 29.28932188134524);
  const changed = setSideLength(room, 0, Math.PI * 50);
  expect(changed.outline.points[1].x).toBeCloseTo(141.4213562373);
  expect(changed.outline.points[0].curve).toBeCloseTo(29.28932188134524);
});
