// How the staff floor shows table status. Staff statuses reuse the shared
// map glyphs, so each status has its own pattern or mark, never colour alone:
//
//   free       open outline             (glyph "free")
//   reserved   diagonal stripes         (glyph "held")
//   seated     solid with a cross       (glyph "taken")
//   finishing  dotted, rounded square   (glyph "friend")
import type { BookingStatus, FloorStatus, StaffBooking, StaffFloor, StaffTable } from "../../api/restaurant";
import type { MapTable, SeatState } from "../../api/types";
import type { DescribeItem } from "../../seatmap/describe";
import type { KeyEntry } from "./MapKey";
import { toMinutes } from "./format";
import { partyRange } from "./tableView";

export const FLOOR_LOOK: Record<FloorStatus, { glyph: SeatState; label: string; hint: string }> = {
  free: { glyph: "free", label: "Free", hint: "Ready to seat" },
  reserved: { glyph: "held", label: "Reserved", hint: "Booking due at this time" },
  seated: { glyph: "taken", label: "Seated", hint: "Guests at the table" },
  finishing: { glyph: "friend", label: "Finishing", hint: "Dessert or bill, free soon" },
};

export const FLOOR_ORDER: FloorStatus[] = ["free", "reserved", "seated", "finishing"];

export const STAFF_KEY: KeyEntry[] = FLOOR_ORDER.map((status) => ({ state: FLOOR_LOOK[status].glyph, name: FLOOR_LOOK[status].label, hint: FLOOR_LOOK[status].hint }));

/** The floor tables with the glyph state the shared map understands. */
export function staffMapTables(tables: StaffTable[]): MapTable[] {
  return tables.map((table) => ({ ...table, state: FLOOR_LOOK[table.status].glyph }));
}

/**
 * The spoken name of each table on the staff map, in staff words, e.g.
 * "Table 2, 2 to 4 people, reserved, Rui Costa, party of 2". Without it the
 * shared map would say the events words of the glyph ("taken", "friend").
 */
export function describeStaffTables(tables: StaffTable[]): DescribeItem {
  const byId = new Map(tables.map((table) => [table.id, table]));
  return (item) => {
    if (item.kind !== "table") return null;
    const table = byId.get(item.table.id);
    if (!table) return null;
    const parts = [`Table ${table.label}`, partyRange(table), FLOOR_LOOK[table.status].label.toLowerCase()];
    if (table.name) parts.push(table.name);
    if (table.party_size !== null) parts.push(`party of ${table.party_size}`);
    if (table.accessible) parts.push("accessible");
    return parts.join(", ");
  };
}

/** How many tables are in each status: the glanceable line at the top of the floor. */
export function countByStatus(tables: StaffTable[]): Record<FloorStatus, number> {
  const counts: Record<FloorStatus, number> = { free: 0, reserved: 0, seated: 0, finishing: 0 };
  for (const table of tables) counts[table.status] += 1;
  return counts;
}

/** Bookings still to arrive, earliest first. */
export function upcomingArrivals(bookings: StaffBooking[]): StaffBooking[] {
  return bookings.filter((b) => b.status === "confirmed").sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
}

export function bookingOnTable(floor: StaffFloor, table: StaffTable): StaffBooking | null {
  return floor.bookings.find((b) => b.id === table.booking_id) ?? null;
}

/** Which next steps make sense for a booking in this status, in the order staff use them. */
export function nextActions(status: BookingStatus): { status: BookingStatus; label: string }[] {
  switch (status) {
    case "confirmed":
      return [
        { status: "seated", label: "Seat now" },
        { status: "no_show", label: "No-show" },
      ];
    case "seated":
      return [
        { status: "finishing", label: "Finishing" },
        { status: "completed", label: "Complete" },
      ];
    case "finishing":
      return [{ status: "completed", label: "Complete, table free" }];
    default:
      return [];
  }
}

/** Plain-language check before moving a booking to some tables. Null means fine. */
export function moveProblem(tables: StaffTable[], party: number): string | null {
  if (tables.length === 0) return "Choose at least one table.";
  const seats = tables.reduce((sum, t) => sum + t.max_party, 0);
  if (seats < party) return `These tables seat ${seats}; the party is ${party}.`;
  if (tables.length > 1) {
    const group = tables[0]?.combine_group;
    if (!group || tables.some((t) => t.combine_group !== group)) return "These tables cannot be pushed together. Pick tables from the same group.";
  }
  return null;
}
