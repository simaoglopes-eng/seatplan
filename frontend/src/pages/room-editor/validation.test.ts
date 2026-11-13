import { expect, it } from "vitest";
import { createRoom } from "./roomModel";
import type { Room } from "./roomModel";
import { addTable, editTable } from "./tableModel";
import { addOpening } from "./wallModel";
import { addFixture, editFixture } from "./roomObjects";
import { validateRooms } from "./validation";

const codes = (room: Room, publish = false) => validateRooms([room], publish).map(p => p.code).sort();
function table(room: Room, x: number, y: number, w = 100, h = 100, round = false): Room {
  const next = addTable(room, round ? "round" : "square", { x, y });
  return editTable(next, next.tables.at(-1)!.key, { w, h });
}
it("matches server cases for rotated rectangles and true circle containment", () => {
  let room = table(createRoom("Main", 1000, 700), 0, 0);
  room = editTable(room, room.tables[0].key, { rotation: 45 });
  expect(codes(room)).toEqual(["table_outside"]);
  room = createRoom("Triangle", 1000, 1000);
  room.outline.points = [{ x: 0, y: 0, curve: 0 }, { x: 1000, y: 0, curve: 0 }, { x: 0, y: 1000, curve: 0 }];
  room = table(room, 320, 320, 200, 200, true);
  expect(codes(room)).toEqual([]);
  room.tables[0].shape = "rect";
  expect(codes(room)).toEqual(["table_outside"]);
});
it("uses the same two-centimetre join tolerance and inactive-table rule", () => {
  let room = table(table(createRoom("Main", 1000, 700), 100, 100), 198, 100);
  room.tables.forEach(t => { t.combine_group = "A"; });
  expect(codes(room)).toEqual(["tight_passage"]);
  const previous = JSON.stringify(room);
  validateRooms([room]); expect(JSON.stringify(room)).toBe(previous);
  room.tables[1].x = 197;
  expect(codes(room)).toEqual(["tables_overlap", "tight_passage"]);
  room.tables[1].is_active = false;
  expect(codes(room)).toEqual(["tight_passage"]);
});

it("rejects crossed, degenerate and overcurved outlines", () => {
  let room = createRoom("Main", 1000, 700);
  room.outline.points = [0, 2, 1, 3].map(i => room.outline.points[i]);
  expect(codes(room)).toEqual(["outline_invalid"]);
  room = createRoom("Main", 1000, 700); room.outline.points[0].curve = 501;
  expect(codes(room)).toEqual(["outline_invalid"]);
  room.outline.points = room.outline.points.slice(0, 2);
  expect(codes(room)).toEqual(["outline_invalid"]);
});
it("rejects a rectangle bridging a concave notch even if its centre and corners are inside", () => {
  let room = createRoom("Notch", 600, 600);
  room.outline.points = [[0, 0], [600, 0], [600, 600], [400, 600], [400, 200], [200, 200], [200, 600], [0, 600]].map(([x, y]) => ({ x, y, curve: 0 }));
  room = table(room, 100, 100, 400, 200);
  expect(codes(room)).toEqual(["table_outside"]);
});
it("handles curved walls and actual circle contact with a rectangular fixture", () => {
  let room = createRoom("Curve", 1000, 700); room.outline.points[0].curve = 200;
  room = table(room, 450, -100, 100, 50); expect(codes(room)).toEqual([]);
  room = table(createRoom("Main", 1000, 700), 100, 100, 100, 100, true);
  room = addFixture(room, "bar", { x: 190, y: 190 });
  room = editFixture(room, room.fixtures[0].key, { w: 100, h: 100 });
  expect(codes(room)).toEqual([]);
  room.fixtures[0].x = room.fixtures[0].y = 180;
  expect(codes(room)).toEqual(["fixture_overlap"]);
});
it("keeps publication requirements separate from draft checks and view information", () => {
  let room = addOpening(createRoom("Main", 1000, 700), 0, "window");
  expect(codes(room)).toEqual(["window_no_view"]);
  expect(codes(room, true)).toEqual(["no_north", "no_tables", "window_no_view"]);
  room.openings[0].view_text = "Garden"; room.north_deg = 0;
  room = table(room, 100, 100);
  expect(codes(room, true)).toEqual([]);
});
