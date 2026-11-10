// Words for seats and tables. Every seat on screen also exists as a sentence,
// because a seat map that only works with eyes excludes people.
import type { MapSeat, MapTable, SeatState } from "../api/types";

/** Short text used in aria-labels and in the legend. */
export const STATE_TEXT: Record<SeatState, string> = {
  free: "free",
  held: "on hold",
  taken: "taken",
  mine: "your seat",
  friend: "friend",
  blocked: "not available",
};

/** Longer explanation shown next to each glyph in the legend. */
export const STATE_HINT: Record<SeatState, string> = {
  free: "You can choose it",
  held: "Someone is choosing it right now",
  taken: "Already chosen",
  mine: "Where you are sitting",
  friend: "Someone you know sits here",
  blocked: "Closed by the organiser",
};

/** "Table 4" for tables, "Row B" for theatre rows. */
export function tableName(table: MapTable | undefined): string {
  if (!table) return "Unassigned";
  return table.shape === "row" ? `Row ${table.label}` : `Table ${table.label}`;
}

interface DescribeOptions {
  recommended?: boolean;
  /** Words for the second highlight, for example "changed by preview". */
  marked?: string | null;
  selected?: boolean;
}

/** One thing on the map, as a page's own `describe` function receives it. */
export type MapItem = { kind: "seat"; seat: MapSeat; table: MapTable | undefined } | { kind: "table"; table: MapTable; seats: MapSeat[] };

/** A page's override for an accessible name. Returning null keeps the default words. */
export type DescribeItem = (item: MapItem) => string | null | undefined;

/** The flags every name ends with, in a fixed order so screen readers sound consistent. */
function withFlags(parts: string[], options: DescribeOptions): string {
  if (options.recommended) parts.push("recommended");
  if (options.marked) parts.push(options.marked);
  if (options.selected) parts.push("selected");
  return parts.join(", ");
}

/** For example: "Table 4, seat 3, taken, Ana P., accessible, recommended". */
export function describeSeat(seat: MapSeat, table: MapTable | undefined, options: DescribeOptions = {}): string {
  const parts = [tableName(table), `seat ${seat.label}`, STATE_TEXT[seat.state]];
  if (seat.occupant && seat.state !== "free") parts.push(seat.occupant);
  if (seat.accessible) parts.push("accessible");
  return withFlags(parts, options);
}

/** For restaurant maps where the whole table is the thing you pick. */
export function describeTable(table: MapTable, seatCount: number, options: DescribeOptions = {}): string {
  const parts = [tableName(table), `${seatCount} seats`, STATE_TEXT[table.state ?? "free"]];
  if (table.accessible) parts.push("accessible");
  return withFlags(parts, options);
}

/** The full name of one map item: the page's own words if it gave some, then the flags. */
export function describeItem(item: MapItem, options: DescribeOptions, override?: DescribeItem): string {
  const custom = override?.(item);
  if (custom) return withFlags([custom], options);
  return item.kind === "seat" ? describeSeat(item.seat, item.table, options) : describeTable(item.table, item.seats.length, options);
}

/** A seat and the table it belongs to, or null when the id is not on this map. */
export function findSeat(seats: MapSeat[], tables: MapTable[], id: number): { seat: MapSeat; table: MapTable | undefined } | null {
  const seat = seats.find((s) => s.id === id);
  if (!seat) return null;
  return { seat, table: tables.find((t) => t.id === seat.table_id) };
}
