import { describe, expect, it } from "vitest";
import { bearing, outlineToPolygon, pointInPolygon, polygonArea, rectCorners, sideNormal, sidePoint } from "./geometry";
import { addRoom, createRoom, replaceRoom } from "./roomModel";

describe("restaurant geometry matches the Python reference cases", () => {
  it("measures a 10 by 7 metre room and includes its boundary", () => {
    const room = createRoom("Main room", 1000, 700);
    const polygon = outlineToPolygon(room.outline, 16);
    expect(polygonArea(polygon)).toBe(700000);
    expect(pointInPolygon({ x: 500, y: 350 }, polygon)).toBe(true);
    expect(pointInPolygon({ x: 0, y: 350 }, polygon)).toBe(true);
    expect(pointInPolygon({ x: -1, y: 350 }, polygon)).toBe(false);
  });
  it("bulges a clockwise top wall outward by its sagitta", () => {
    const room = createRoom("Curve", 100, 100);
    room.outline.points[0].curve = 50;
    const polygon = outlineToPolygon(room.outline, 16);
    expect(polygon[8].x).toBeCloseTo(50);
    expect(polygon[8].y).toBeCloseTo(-50);
    expect(sidePoint(room.outline, 0, 0.5).y).toBeCloseTo(-50);
    expect(sideNormal(room.outline, 0, 0.5).y).toBeCloseTo(-1);
    expect(polygonArea(polygon)).toBeGreaterThan(10000);
  });
  it("keeps rotated area and converts screen direction relative to north", () => {
    for (let angle = 0; angle <= 360; angle += 15) {
      expect(polygonArea(rectCorners({ x: 10, y: 20, w: 80, h: 40, rotation: angle }))).toBeCloseTo(3200);
    }
    expect(bearing(0, -1, 0)).toBe(0);
    expect(bearing(1, 0, 90)).toBe(0);
  });
  it("refuses invalid arcs and non-finite input", () => {
    const room = createRoom("Invalid", 100, 100);
    room.outline.points[0].curve = 51;
    expect(() => outlineToPolygon(room.outline)).toThrow();
    expect(() => bearing(NaN, 1, 0)).toThrow();
  });
});

it("preserves every previous room layout for undo and caps the room count", () => {
  const initial = { base_version: 0, rooms: [] };
  const room = createRoom("Main room", 1000, 700);
  const added = addRoom(initial, room);
  const changed = replaceRoom(added, { ...room, name: "Terrace" });
  expect(initial.rooms).toEqual([]);
  expect(added.rooms[0].name).toBe("Main room");
  expect(changed.rooms[0].name).toBe("Terrace");
  let five = added;
  for (let n = 1; n < 5; n++) five = addRoom(five, createRoom(`Room ${n}`, 1000, 700));
  expect(() => addRoom(five, createRoom("Sixth", 1000, 700))).toThrow();
});
