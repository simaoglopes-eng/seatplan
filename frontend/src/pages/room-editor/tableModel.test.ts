import { expect, it } from "vitest";
import { createRoom } from "./roomModel";
import { addTable, editTable, setChairCount, editChair } from "./tableModel";

it("creates the four specified tables and keeps counter chairs on one side", () => {
  let room = createRoom("Main", 1000, 700);
  for (const kind of ["round", "square", "long", "counter"] as const) room = addTable(room, kind, { x: 100, y: 100 });
  expect(room.tables.map(t => [t.shape, t.w, t.h, t.seats.length])).toEqual([
    ["round", 90, 90, 4], ["rect", 80, 80, 4], ["rect", 160, 80, 6], ["row", 300, 50, 5],
  ]);
  expect(room.tables.map(t => t.label)).toEqual(["Table 1", "Table 2", "Table 3", "Table 4"]);
  expect(room.tables[3].seats.map(s => [s.x, s.y])).toEqual([[130, 84], [190, 84], [250, 84], [310, 84], [370, 84]]);
});

it("edits table geometry and flags without losing seat ids or custom offsets", () => {
  const original = addTable(createRoom("Main", 1000, 700), "round", { x: 100, y: 100 });
  const key = original.tables[0].key;
  original.tables[0].seats[0].id = 12;
  const custom = editChair(original, key, original.tables[0].seats[0].key, { x: 200, label: "Window", is_accessible: true });
  const moved = editTable(custom, key, { x: 200, y: 300, rotation: 90, is_active: false, high_chair_ok: true, combine_group: "A" });
  expect(moved.tables[0].seats[0]).toMatchObject({ id: 12, label: "Window", x: 306, y: 400, is_accessible: true });
  expect(moved.tables[0]).toMatchObject({ is_active: false, high_chair_ok: true, combine_group: "A" });
  expect(original.tables[0].x).toBe(100);
  expect(original.tables[0].seats[0].label).toBe("1");
});

it("changes chair count within 1–20 and preserves existing identifiers and labels", () => {
  const room = addTable(createRoom("Main", 1000, 700), "square", { x: 100, y: 100 });
  const key = room.tables[0].key, chairKey = room.tables[0].seats[0].key;
  const more = setChairCount(room, key, 6);
  expect(more.tables[0].seats).toHaveLength(6);
  expect(more.tables[0].max_party).toBe(6);
  expect(more.tables[0].seats[0].key).toBe(chairKey);
  expect(room.tables[0].seats).toHaveLength(4);
  expect(() => setChairCount(room, key, 0)).toThrow();
  expect(() => setChairCount(room, key, 21)).toThrow();
  expect(() => editTable(room, key, { min_party: 5 })).toThrow();
  expect(() => editTable(room, key, { label: "" })).toThrow();
  expect(() => editChair(room, key, chairKey, { x: Infinity })).toThrow();
});

it("requires table names unique within a room and keeps round dimensions equal", () => {
  const first = addTable(createRoom("Main", 1000, 700), "round", { x: 100, y: 100 });
  const room = addTable(first, "round", { x: 300, y: 100 });
  expect(() => editTable(room, room.tables[1].key, { label: "Table 1" })).toThrow();
  expect(editTable(room, room.tables[0].key, { h: 120 }).tables[0]).toMatchObject({ w: 120, h: 120 });
});
