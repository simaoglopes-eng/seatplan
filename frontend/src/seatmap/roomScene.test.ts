import { describe, expect, it } from "vitest";
import type { MapRoom, MapRoomOpening } from "../api/types";
import { doorArcPath, fixtureName, mergeBounds, openingPath, polygonPath, roomsBounds, viewAnchors } from "./roomScene";

const SQUARE = { points: [{ x: 0, y: 0, curve: 0 }, { x: 1000, y: 0, curve: 0 }, { x: 1000, y: 600, curve: 0 }, { x: 0, y: 600, curve: 0 }] };
// The south side (index 2, from (1000, 500) to (0, 500)) bulges outwards by 100.
const BULGING = { points: [{ x: 0, y: 0, curve: 0 }, { x: 1000, y: 0, curve: 0 }, { x: 1000, y: 500, curve: 100 }, { x: 0, y: 500, curve: 0 }] };

function opening(patch: Partial<MapRoomOpening>): MapRoomOpening {
  return { id: 1, side: 0, offset: 100, width: 300, kind: "window", is_main_entrance: false, view_text: "", view_tags: [], night_view_text: "", view_photo_url: "", ...patch };
}

function room(patch: Partial<MapRoom>): MapRoom {
  return {
    id: 1, name: "Main room", is_outdoor: false, north_deg: 0, outline: SQUARE, width: 1000, height: 600,
    openings: [], fixtures: [], sun: null, sun_patches: [], night: false, ...patch,
  };
}

describe("openingPath", () => {
  it("is a straight line along a straight side, by offset and width", () => {
    expect(openingPath(SQUARE, opening({ side: 0, offset: 100, width: 300 }))).toBe("M 100 0 L 400 0");
  });

  it("follows the side's direction (clockwise): the east side runs downwards", () => {
    expect(openingPath(SQUARE, opening({ side: 1, offset: 50, width: 200 }))).toBe("M 1000 50 L 1000 250");
  });

  it("is an arc on a curved side, so it hugs the wall", () => {
    const path = openingPath(BULGING, opening({ side: 2, offset: 300, width: 400 }));
    expect(path.startsWith("M ")).toBe(true);
    expect(path).toMatch(/ A (\d+(\.\d+)?) \1 0 0 1 /); // same radius twice, sweep like the wall
  });

  it("covers the whole side for a glass wall, whatever its offset and width", () => {
    expect(openingPath(SQUARE, opening({ side: 1, kind: "glass_wall", offset: 0, width: 0 }))).toBe("M 1000 0 L 1000 600");
  });
});

describe("doorArcPath", () => {
  it("swings into the room from the hinge", () => {
    const arc = doorArcPath(SQUARE, opening({ side: 0, offset: 100, width: 100, kind: "door" }));
    expect(arc).toContain("A 100 100 0 0 1");
    expect(arc.startsWith("M 200 0")).toBe(true); // from the free end of the door
  });
});

describe("roomsBounds", () => {
  it("is null without rooms", () => {
    expect(roomsBounds([])).toBeNull();
  });

  it("holds the whole bulge of a curved wall, not just the corners", () => {
    const bounds = roomsBounds([room({ outline: BULGING })]);
    expect(bounds).not.toBeNull();
    expect(bounds!.minX).toBeLessThanOrEqual(0);
    expect(bounds!.maxX).toBeGreaterThanOrEqual(1000);
    expect(bounds!.maxY).toBeGreaterThanOrEqual(599); // the arc reaches 600 in the middle
  });

  it("merges with the bounds of tables and seats", () => {
    const merged = mergeBounds({ minX: -40, minY: -40, maxX: 800, maxY: 700 }, roomsBounds([room({})]));
    expect(merged).toEqual({ minX: -40, minY: -40, maxX: 1000 + 40, maxY: 700 });
    expect(mergeBounds({ minX: 1, minY: 2, maxX: 3, maxY: 4 }, null)).toEqual({ minX: 1, minY: 2, maxX: 3, maxY: 4 });
  });
});

describe("small helpers", () => {
  it("writes a polygon as a closed path", () => {
    expect(polygonPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }])).toBe("M 0 0 L 10 0 L 10 5 Z");
    expect(polygonPath([])).toBe("");
  });

  it("names fixtures by their label, else by their kind", () => {
    expect(fixtureName({ id: 1, kind: "bar", shape: "rect", x: 0, y: 0, w: 1, h: 1, rotation: 0, label: "" })).toBe("Bar");
    expect(fixtureName({ id: 1, kind: "bar", shape: "rect", x: 0, y: 0, w: 1, h: 1, rotation: 0, label: "Wine bar" })).toBe("Wine bar");
    expect(fixtureName({ id: 1, kind: "host_stand", shape: "rect", x: 0, y: 0, w: 1, h: 1, rotation: 0, label: "" })).toBe("Host stand");
  });

  it("anchors a view icon just inside each window that has a view", () => {
    const windows = [
      opening({ id: 1, side: 0, offset: 100, width: 300, view_text: "river" }), // north wall, middle at x = 250
      opening({ id: 2, side: 0, offset: 500, width: 100 }), // no view: no icon
      opening({ id: 3, side: 2, offset: 0, width: 200, kind: "door", view_text: "street" }), // a door has no view
    ];
    const anchors = viewAnchors(room({ openings: windows }));
    expect(anchors.map((a) => a.id)).toEqual([1]);
    expect(anchors[0].x).toBeCloseTo(250, 0);
    expect(anchors[0].y).toBeGreaterThan(0); // inside the room, below the north wall
  });
});
