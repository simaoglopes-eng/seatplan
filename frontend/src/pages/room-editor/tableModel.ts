import { seatPositions } from "../../seatmap/seatPositions";
import type { Point } from "./geometry";
import { newRoomKey } from "./roomModel";
import type { Room, RoomSeat, RoomTable } from "./roomModel";

export type TableKind = "round" | "square" | "long" | "counter";
export const TABLE_KINDS: readonly TableKind[] = ["round", "square", "long", "counter"];
export const TABLE_NAMES: Record<TableKind, string> = { round: "Round table", square: "Square table", long: "Long table", counter: "Counter" };

function chairPositions(table: RoomTable, count: number): Point[] {
  return table.shape === "row" ? seatPositions({ ...table, shape: "rect" }, count * 2).slice(0, count) : seatPositions(table, count);
}
function generatedChairs(table: RoomTable, count: number): RoomTable["seats"] {
  return chairPositions(table, count).map((point, index) => {
    const previous = table.seats[index];
    return previous ? { ...previous, ...point } : { id: null, key: newRoomKey("s"), label: String(index + 1), is_accessible: false, is_blocked: false, ...point };
  });
}
export function addTable(room: Room, kind: TableKind, at: Point): Room {
  if (room.tables.length >= 200 || !TABLE_KINDS.includes(kind) || ![at.x, at.y].every(Number.isFinite)) throw new Error("Choose a table and a finite position. Rooms allow up to 200 tables.");
  let number = 1; while (room.tables.some(t => t.label === `Table ${number}`)) number++;
  const count = kind === "counter" ? 5 : kind === "long" ? 6 : 4;
  if (room.tables.reduce((sum, table) => sum + table.seats.length, count) > 1000) throw new Error("A room can have at most 1000 chairs.");
  const table: RoomTable = { id: null, key: newRoomKey("t"), label: `Table ${number}`, shape: kind === "round" ? "round" : kind === "counter" ? "row" : "rect", x: at.x, y: at.y, w: kind === "round" ? 90 : kind === "square" ? 80 : kind === "long" ? 160 : 300, h: kind === "round" ? 90 : kind === "counter" ? 50 : 80, rotation: 0, min_party: 1, max_party: count, is_accessible: false, high_chair_ok: false, combine_group: null, is_active: true, zone_key: null, seats: [] };
  table.seats = generatedChairs(table, count);
  return { ...room, tables: [...room.tables, table] };
}

function checkTable(room: Room, table: RoomTable): void {
  if (!table.label.trim() || table.label.length > 40 || room.tables.some(t => t.key !== table.key && t.label.trim() === table.label.trim())) throw new Error("Use a table label of 1–40 characters, unique in this room.");
  if (![table.x, table.y, table.w, table.h, table.rotation].every(Number.isFinite) || table.w < 1 || table.h < 1 || table.w > 10000 || table.h > 10000) throw new Error("Use finite positions and sizes from 1 to 10000 cm.");
  if (!Number.isInteger(table.min_party) || !Number.isInteger(table.max_party) || table.min_party < 1 || table.max_party < table.min_party || table.max_party > table.seats.length) throw new Error("Keep party sizes between one and the number of chairs.");
  if (table.combine_group && table.combine_group.length > 40) throw new Error("Use a join group of up to 40 characters.");
  if (table.zone_key !== null && !room.zones.some(z => z.key === table.zone_key)) throw new Error("Choose a zone in this room.");
}

export function editTable(room: Room, key: string, patch: Partial<Omit<RoomTable, "id" | "key" | "seats">>): Room {
  return { ...room, tables: room.tables.map(table => {
    if (table.key !== key) return table;
    const next = { ...table, ...patch };
    next.rotation = ((next.rotation % 360) + 360) % 360;
    if (next.shape === "round") next.w = next.h = patch.w ?? patch.h ?? table.w;
    checkTable(room, next);
    const previousPositions = chairPositions(table, table.seats.length), positions = chairPositions(next, table.seats.length);
    const angle = (next.rotation - table.rotation) * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
    next.seats = table.seats.map((seat, i) => {
      const dx = seat.x - previousPositions[i].x, dy = seat.y - previousPositions[i].y;
      return { ...seat, x: positions[i].x + dx * c - dy * s, y: positions[i].y + dx * s + dy * c };
    });
    return next;
  }) };
}

export function setChairCount(room: Room, key: string, count: number): Room {
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error("Use between one and twenty chairs.");
  const next = { ...room, tables: room.tables.map(table => {
    if (table.key !== key) return table;
    const max = table.max_party === table.seats.length ? count : Math.min(table.max_party, count);
    const changed = { ...table, seats: generatedChairs(table, count), max_party: max, min_party: Math.min(table.min_party, max) };
    checkTable(room, changed);
    return changed;
  }) };
  if (next.tables.reduce((sum, table) => sum + table.seats.length, 0) > 1000) throw new Error("A room can have at most 1000 chairs.");
  return next;
}

export function editChair(room: Room, tableKey: string, chairKey: string, patch: Partial<Omit<RoomSeat, "id" | "key">>): Room {
  return { ...room, tables: room.tables.map(t => t.key !== tableKey ? t : { ...t, seats: t.seats.map(seat => {
    if (seat.key !== chairKey) return seat;
    const next = { ...seat, ...patch };
    if (!next.label.trim() || next.label.length > 40 || ![next.x, next.y].every(Number.isFinite)) throw new Error("Use a chair label of 1–40 characters and finite coordinates.");
    return next;
  }) }) };
}
