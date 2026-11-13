import { expect, it } from "vitest";
import { createRoom } from "./roomModel";
import { addTable } from "./tableModel";
import { alignTables, distributeTables, duplicateTables, deleteTables, moveTables, tablesInBox, resizeTableAt, rotationAt } from "./selection";

function threeTables() {
  let room = createRoom("Main", 1000, 700);
  for (const at of [{ x: 100, y: 100 }, { x: 300, y: 200 }, { x: 700, y: 300 }]) room = addTable(room, "square", at);
  return room;
}
it("aligns and distributes table edges while carrying chairs without mutation", () => {
  const original = threeTables(), keys = original.tables.map(t => t.key);
  const aligned = alignTables(original, keys, "top");
  expect(aligned.tables.map(t => t.y)).toEqual([100, 100, 100]);
  expect(original.tables.map(t => t.y)).toEqual([100, 200, 300]);
  const spaced = distributeTables(aligned, keys, "horizontal");
  expect(spaced.tables.map(t => t.x)).toEqual([100, 400, 700]);
  expect(spaced.tables[1].seats[0].x).toBe(420);
  const moved = moveTables(original, keys.slice(0, 2), 10, -5);
  expect(moved.tables.map(t => [t.x, t.y])).toEqual([[110, 95], [310, 195], [700, 300]]);
});

it("resizes from a rotated corner while keeping the opposite corner fixed", () => {
  const room = threeTables(), key = room.tables[0].key;
  room.tables[0].rotation = 90;
  const resized = resizeTableAt(room, key, { x: 60, y: 220 }, false);
  expect(resized.tables[0]).toMatchObject({ x: 60, y: 100, w: 120, h: 120, rotation: 90 });
  expect(rotationAt({ x: 140, y: 140 }, { x: 240, y: 140 }, false)).toBe(90);
  expect(rotationAt({ x: 0, y: 0 }, { x: 10, y: -100 }, false)).toBe(0);
  expect(rotationAt({ x: 0, y: 0 }, { x: 10, y: -100 }, true)).toBeCloseTo(5.710593);
});

it("duplicates all selected ids and chairs into fresh objects and refuses booked deletions", () => {
  const original = threeTables(), keys = original.tables.map(t => t.key);
  original.tables[0].id = 42;
  const copied = duplicateTables(original, keys.slice(0, 2));
  expect(copied.tables).toHaveLength(5);
  expect(copied.tables[3]).toMatchObject({ id: null, label: "Table 1 copy", x: 150, y: 150 });
  expect(copied.tables[3].key).not.toBe(original.tables[0].key);
  expect(copied.tables[3].seats[0].key).not.toBe(original.tables[0].seats[0].key);
  expect(copied.tables[3].seats[0].id).toBeNull();
  expect(() => deleteTables(original, [keys[0]])).toThrow(/unavailable/i);
  const removed = deleteTables(copied, [copied.tables[3].key]);
  expect(removed.tables).toHaveLength(4);
  expect(copied.tables).toHaveLength(5);
});

it("deletes a persisted table only when its loaded booking status explicitly permits it", () => {
  const room = threeTables(), key = room.tables[0].key;
  room.tables[0].id = 42;
  room.tables[0].has_bookings = true;
  expect(() => deleteTables(room, [key])).toThrow(/has bookings/i);
  room.tables[0].has_bookings = false;
  expect(deleteTables(room, [key]).tables).toHaveLength(2);
});

it("selects rotated table bounds inside a selection area and aligns all six edges", () => {
  const room = threeTables(), keys = room.tables.map(t => t.key);
  expect(tablesInBox(room, { x: 290, y: 190 }, { x: 390, y: 290 })).toEqual([keys[1]]);
  expect(alignTables(room, keys, "left").tables.map(t => t.x)).toEqual([100, 100, 100]);
  expect(alignTables(room, keys, "centre").tables.map(t => t.x)).toEqual([400, 400, 400]);
  expect(alignTables(room, keys, "right").tables.map(t => t.x)).toEqual([700, 700, 700]);
  expect(alignTables(room, keys, "middle").tables.map(t => t.y)).toEqual([200, 200, 200]);
  expect(alignTables(room, keys, "bottom").tables.map(t => t.y)).toEqual([300, 300, 300]);
});
