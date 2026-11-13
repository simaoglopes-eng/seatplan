import { expect, it } from "vitest";
import { createRoom } from "./roomModel";
import { addFixture, editFixture, addZone, editZone, removeZone, FIXTURE_KINDS, ZONE_KINDS } from "./roomObjects";

it("places every fixed element with independent keys and immutable edits", () => {
  const original = createRoom("Main", 1000, 700);
  let room = original;
  for (const kind of FIXTURE_KINDS) room = addFixture(room, kind, { x: 100, y: 100 });
  expect(original.fixtures).toEqual([]);
  expect(room.fixtures).toHaveLength(11);
  expect(new Set(room.fixtures.map(f => f.key)).size).toBe(11);
  const key = room.fixtures[0].key;
  const changed = editFixture(room, key, { x: 200, rotation: 90, label: "Main bar" });
  expect(changed.fixtures[0]).toMatchObject({ x: 200, rotation: 90, label: "Main bar" });
  expect(room.fixtures[0].label).toBe("");
  expect(changed.fixtures[0].key).toBe(key);
  expect(() => editFixture(room, key, { w: 0 })).toThrow();
  expect(() => editFixture(room, key, { label: "x".repeat(41) })).toThrow();
});

it("creates every zone type and removes only links to the deleted zone", () => {
  let room = createRoom("Main", 1000, 700);
  for (const kind of ZONE_KINDS) room = addZone(room, kind, { x: 50, y: 100 });
  expect(room.zones).toHaveLength(7);
  const key = room.zones[0].key;
  const changed = editZone(room, key, { name: "Quiet corner", kind: "quiet", w: 350 });
  expect(changed.zones[0]).toMatchObject({ name: "Quiet corner", kind: "quiet", w: 350 });
  expect(room.zones[0].name).toBe("Zone 1");
  const table = { id: null, key: "t1", zone_key: key, label: "Table 1", shape: "rect" as const, x: 10, y: 10, w: 80, h: 80, rotation: 0, min_party: 1, max_party: 4, is_accessible: false, high_chair_ok: false, combine_group: null, is_active: true, seats: [] };
  const linked = { ...changed, tables: [table, { ...table, key: "t2", zone_key: "another" }] };
  const removed = removeZone(linked, key);
  expect(removed.tables.map(t => t.zone_key)).toEqual([null, "another"]);
  expect(linked.tables[0].zone_key).toBe(key);
  expect(() => editZone(room, key, { name: "" })).toThrow();
  expect(() => editZone(room, key, { h: NaN })).toThrow();
});

it("resizes circles consistently and preserves persisted fixture identifiers", () => {
  const room = addFixture(createRoom("Main", 1000, 700), "column", { x: 100, y: 100 });
  room.fixtures[0].id = 12;
  const key = room.fixtures[0].key;
  expect(editFixture(room, key, { h: 90, rotation: 375, id: 999, key: "other" }).fixtures[0]).toMatchObject({ id: 12, key, w: 90, h: 90, rotation: 15 });
});

it("preserves the existing eighty-character zone name limit while moving", () => {
  const room = addZone(createRoom("Main", 1000, 700), "general", { x: 50, y: 50 });
  room.zones[0].name = "x".repeat(80);
  expect(editZone(room, room.zones[0].key, { x: 100 }).zones[0].name).toHaveLength(80);
});
