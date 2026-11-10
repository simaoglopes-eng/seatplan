// Pure functions that change a floor-plan layout. No React, no API: every
// function takes a layout and returns a NEW layout, never editing the old one.
// That is what makes undo and redo trivial (keep the old objects in a list).
import type { SeatIn, TableIn, TableShape, ZoneIn } from "../../api/types";
import { tableCentre } from "../../seatmap/geometry";
import { seatPositions, sizeFor } from "../../seatmap/seatPositions";

// The editor keeps seats INSIDE their table, which makes "move a table and its
// chairs" one change. layoutWire.ts flattens this into the API's lists on save.
export type LayoutSeat = Omit<SeatIn, "table_key">;
export type LayoutTable = TableIn & { seats: LayoutSeat[] };
export type LayoutZone = ZoneIn;
export interface VenueLayout {
  zones: LayoutZone[];
  tables: LayoutTable[];
}

export type Selection = { kind: "table" | "seat" | "zone"; key: string } | null;

export const DEFAULT_SEATS: Record<TableShape, number> = { round: 8, rect: 6, row: 12 };
export const MAX_SEATS = 40;

let keyCounter = 0;

/** A key for something new; never sent to the server as an id. */
export function newKey(prefix: string): string {
  keyCounter += 1;
  return `${prefix}-new-${keyCounter}`;
}

/** Places (or re-places) the seats around a table, keeping each seat's id, label and flags. */
export function layoutSeats(table: LayoutTable, count: number): LayoutSeat[] {
  return seatPositions(table, count).map((point, i) => {
    const existing = table.seats[i];
    const base: LayoutSeat = existing ?? {
      id: null,
      key: newKey("s"),
      label: String(i + 1),
      is_accessible: false,
      is_blocked: false,
      reserved_tag: null,
      x: 0,
      y: 0,
    };
    return { ...base, x: Math.round(point.x), y: Math.round(point.y) };
  });
}

/** Next free label: tables are numbered 1, 2, 3; theatre rows are lettered A, B, C. */
export function nextLabel(layout: VenueLayout, shape: TableShape): string {
  const used = new Set(layout.tables.map((t) => t.label));
  for (let i = 0; i < 200; i++) {
    const label = shape === "row" ? rowLetter(i) : String(i + 1);
    if (!used.has(label)) return label;
  }
  return newKey("T");
}

function rowLetter(index: number): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return index < 26 ? letters[index] : `${letters[Math.floor(index / 26) - 1]}${letters[index % 26]}`;
}

/** A new table whose CENTRE is at `at` (stored as its top-left corner, like the backend). */
export function createTable(layout: VenueLayout, shape: TableShape, at: { x: number; y: number }): LayoutTable {
  const count = DEFAULT_SEATS[shape];
  const size = sizeFor(shape, count);
  const table: LayoutTable = {
    id: null,
    key: newKey("t"),
    zone_key: null,
    label: nextLabel(layout, shape),
    shape,
    x: Math.round(at.x - size.w / 2),
    y: Math.round(at.y - size.h / 2),
    ...size,
    rotation: 0,
    min_party: shape === "row" ? 1 : Math.max(1, Math.floor(count / 2)),
    max_party: count,
    is_accessible: false,
    high_chair_ok: shape !== "row",
    combine_group: null,
    seats: [],
  };
  return { ...table, seats: layoutSeats(table, count) };
}

export function createZone(at: { x: number; y: number }): LayoutZone {
  return { id: null, key: newKey("z"), name: "New zone", kind: "general", x: Math.round(at.x), y: Math.round(at.y), w: 240, h: 160 };
}

/** Changes a table's seat count, resizing the table (around its centre) so the chairs still fit. */
export function setSeatCount(table: LayoutTable, count: number): LayoutTable {
  const safe = Math.min(MAX_SEATS, Math.max(1, Math.round(count)));
  const centre = tableCentre(table);
  const size = sizeFor(table.shape, safe);
  const position = { x: Math.round(centre.x - size.w / 2), y: Math.round(centre.y - size.h / 2) };
  const resized = { ...table, ...size, ...position, max_party: Math.max(table.min_party, safe) };
  return { ...resized, seats: layoutSeats({ ...resized, seats: table.seats.slice(0, safe) }, safe) };
}

/** Applies new geometry (position, rotation) and moves the chairs along. */
export function reshapeTable(table: LayoutTable, patch: Partial<LayoutTable>): LayoutTable {
  const next = { ...table, ...patch };
  return { ...next, seats: layoutSeats(next, next.seats.length) };
}

// ---------- Small helpers that replace one item inside the layout ----------

export function replaceTable(layout: VenueLayout, key: string, change: (t: LayoutTable) => LayoutTable): VenueLayout {
  return { ...layout, tables: layout.tables.map((t) => (t.key === key ? change(t) : t)) };
}

export function replaceZone(layout: VenueLayout, key: string, patch: Partial<LayoutZone>): VenueLayout {
  return { ...layout, zones: layout.zones.map((z) => (z.key === key ? { ...z, ...patch } : z)) };
}

export function replaceSeat(layout: VenueLayout, seatKey: string, patch: Partial<LayoutSeat>): VenueLayout {
  const tables = layout.tables.map((t) => {
    if (!t.seats.some((s) => s.key === seatKey)) return t;
    return { ...t, seats: t.seats.map((s) => (s.key === seatKey ? { ...s, ...patch } : s)) };
  });
  return { ...layout, tables };
}

export function removeItem(layout: VenueLayout, selection: Selection): VenueLayout {
  if (selection?.kind === "table") return { ...layout, tables: layout.tables.filter((t) => t.key !== selection.key) };
  if (selection?.kind === "zone") {
    // Tables in a deleted zone stay, they just no longer belong to a zone.
    const tables = layout.tables.map((t) => (t.zone_key === selection.key ? { ...t, zone_key: null } : t));
    return { zones: layout.zones.filter((z) => z.key !== selection.key), tables };
  }
  return layout; // seats are removed by lowering the table's seat count
}

/** Moves the selected table or zone by (dx, dy). */
export function nudge(layout: VenueLayout, selection: Selection, dx: number, dy: number): VenueLayout {
  if (selection?.kind === "table") {
    return replaceTable(layout, selection.key, (t) => reshapeTable(t, { x: t.x + dx, y: t.y + dy }));
  }
  if (selection?.kind === "zone") {
    const zone = layout.zones.find((z) => z.key === selection.key);
    return zone ? replaceZone(layout, zone.key, { x: zone.x + dx, y: zone.y + dy }) : layout;
  }
  return layout;
}

export function findTable(layout: VenueLayout, key: string): LayoutTable | undefined {
  return layout.tables.find((t) => t.key === key);
}

export function findSeat(layout: VenueLayout, key: string): { table: LayoutTable; seat: LayoutSeat } | undefined {
  for (const table of layout.tables) {
    const seat = table.seats.find((s) => s.key === key);
    if (seat) return { table, seat };
  }
  return undefined;
}
