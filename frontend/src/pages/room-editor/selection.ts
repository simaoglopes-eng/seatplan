import { rectCorners } from "./geometry";
import type { Point } from "./geometry";
import type { Room, RoomTable } from "./roomModel";
import { newRoomKey } from "./roomModel";
import { editTable } from "./tableModel";

export type AlignEdge = "left" | "centre" | "right" | "top" | "middle" | "bottom";
export function tableBounds(table: RoomTable) {
  const points = rectCorners({ ...table, rotation: table.shape === "round" ? 0 : table.rotation });
  return { left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)) };
}
export function moveTables(room: Room, keys: readonly string[], dx: number, dy: number): Room {
  if (![dx, dy].every(Number.isFinite)) throw new Error("Use a finite movement.");
  return room.tables.filter(t => keys.includes(t.key)).reduce((next, t) => editTable(next, t.key, { x: t.x + dx, y: t.y + dy }), room);
}
export function alignTables(room: Room, keys: readonly string[], edge: AlignEdge): Room {
  const tables = room.tables.filter(t => keys.includes(t.key)); if (tables.length < 2) return room;
  const boxes = tables.map(tableBounds), left = Math.min(...boxes.map(b => b.left)), right = Math.max(...boxes.map(b => b.right)), top = Math.min(...boxes.map(b => b.top)), bottom = Math.max(...boxes.map(b => b.bottom));
  return tables.reduce((next, t, i) => {
    const b = boxes[i];
    const dx = edge === "left" ? left - b.left : edge === "right" ? right - b.right : edge === "centre" ? (left + right - b.left - b.right) / 2 : 0;
    const dy = edge === "top" ? top - b.top : edge === "bottom" ? bottom - b.bottom : edge === "middle" ? (top + bottom - b.top - b.bottom) / 2 : 0;
    return editTable(next, t.key, { x: t.x + dx, y: t.y + dy });
  }, room);
}
export function distributeTables(room: Room, keys: readonly string[], axis: "horizontal" | "vertical"): Room {
  const horizontal = axis === "horizontal", start = horizontal ? "left" : "top", end = horizontal ? "right" : "bottom";
  const tables = room.tables.filter(t => keys.includes(t.key)).map(t => ({ table: t, box: tableBounds(t) })).sort((a, b) => a.box[start] - b.box[start]);
  if (tables.length < 3) return room;
  const first = tables[0].box[start], last = tables.at(-1)!.box[end];
  const sizes = tables.map(({ box }) => box[end] - box[start]), gap = (last - first - sizes.reduce((a, b) => a + b, 0)) / (tables.length - 1);
  if (gap < 0) throw new Error("Move the outer tables further apart before distributing them.");
  let position = first;
  return tables.reduce((next, { table, box }, i) => {
    const delta = position - box[start]; position += sizes[i] + gap;
    return editTable(next, table.key, horizontal ? { x: table.x + delta } : { y: table.y + delta });
  }, room);
}

export function duplicateTables(room: Room, keys: readonly string[]): Room {
  const selected = room.tables.filter(t => keys.includes(t.key));
  if (room.tables.length + selected.length > 200 || [...room.tables, ...selected].reduce((sum, t) => sum + t.seats.length, 0) > 1000) throw new Error("Keep this room within 200 tables and 1000 chairs.");
  const used = new Set(room.tables.map(t => t.label));
  const copies = selected.map(table => {
    let n = 1, label = "";
    do { const suffix = n === 1 ? " copy" : ` copy ${n}`; label = table.label.slice(0, 40 - suffix.length) + suffix; n++; } while (used.has(label));
    used.add(label);
    return { ...table, id: null, key: newRoomKey("t"), has_bookings: false, label, x: table.x + 50, y: table.y + 50, seats: table.seats.map(seat => ({ ...seat, id: null, key: newRoomKey("s"), x: seat.x + 50, y: seat.y + 50 })) };
  });
  return { ...room, tables: [...room.tables, ...copies] };
}
export function deletionProblem(table: RoomTable): string | null {
  if (table.has_bookings) return "This table has bookings. Make it unavailable instead.";
  if (table.id !== null && table.has_bookings !== false) return "Booking status is not loaded. Make this table unavailable instead.";
  return null;
}
export function deleteTables(room: Room, keys: readonly string[]): Room {
  for (const table of room.tables.filter(t => keys.includes(t.key))) { const reason = deletionProblem(table); if (reason) throw new Error(reason); }
  return { ...room, tables: room.tables.filter(t => !keys.includes(t.key)) };
}
export function tablesInBox(room: Room, a: Point, b: Point): string[] {
  const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x), top = Math.min(a.y, b.y), bottom = Math.max(a.y, b.y);
  return room.tables.filter(table => { const box = tableBounds(table); return box.right >= left && box.left <= right && box.bottom >= top && box.top <= bottom; }).map(t => t.key);
}
export function rotateTables(room: Room, keys: readonly string[], degrees = 15): Room {
  return room.tables.filter(t => keys.includes(t.key)).reduce((next, table) => editTable(next, table.key, { rotation: table.rotation + degrees }), room);
}

export function rotationAt(centre: Point, point: Point, free: boolean): number {
  const angle = Math.atan2(point.y - centre.y, point.x - centre.x) * 180 / Math.PI + 90;
  return (((free ? angle : Math.round(angle / 15) * 15) % 360) + 360) % 360;
}
export function resizeTableAt(room: Room, key: string, point: Point, grid: boolean): Room {
  const table = room.tables.find(t => t.key === key); if (!table) return room;
  const angle = table.rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const cx = table.x + table.w / 2, cy = table.y + table.h / 2;
  const anchor = { x: cx - table.w / 2 * c + table.h / 2 * s, y: cy - table.w / 2 * s - table.h / 2 * c };
  const dx = point.x - anchor.x, dy = point.y - anchor.y, step = grid ? 50 : 1;
  let w = Math.max(step, Math.round((dx * c + dy * s) / step) * step), h = Math.max(step, Math.round((-dx * s + dy * c) / step) * step);
  if (table.shape === "round") w = h = Math.max(w, h);
  const x = anchor.x + w / 2 * c - h / 2 * s - w / 2, y = anchor.y + w / 2 * s + h / 2 * c - h / 2;
  return editTable(room, key, { x, y, w, h });
}
