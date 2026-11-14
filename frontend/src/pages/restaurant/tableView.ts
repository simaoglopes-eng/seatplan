// Turns the diner map from the server into what the shared SeatMap draws.
// Pure functions, tested on their own, so the page component stays short.
import type { DinerMap, DinerTable } from "../../api/restaurant";
import type { MapTable, MapZone, SeatState } from "../../api/types";
import type { DescribeItem } from "../../seatmap/describe";

/** "2 to 4 people", or "4 people" when the table takes one size only. */
export function partyRange(table: { min_party: number; max_party: number }): string {
  return table.min_party === table.max_party ? `${table.max_party} people` : `${table.min_party} to ${table.max_party} people`;
}

// The shared map's default words are for event seats ("0 seats", "your seat");
// a diner picks whole tables, so the map reads these words instead.
const DINER_STATE_WORDS: Record<SeatState, string> = {
  free: "free",
  mine: "held for you",
  held: "someone else is choosing it",
  taken: "booked",
  blocked: "does not suit your party",
  friend: "free", // never used on a diner map
};

/**
 * The spoken name of each table on the diner map, e.g. "Table 7, 2 to 4
 * people, held for you, accessible". The map adds "recommended" and
 * "selected" itself.
 */
export function describeDinerTables(map: DinerMap): DescribeItem {
  const byId = new Map(map.tables.map((table) => [table.id, table]));
  return (item) => {
    if (item.kind !== "table") return null;
    const table = byId.get(item.table.id);
    if (!table) return null;
    // The map draws three looks (available, yours, unavailable), but a screen reader keeps the whole story:
    // booked, being chosen by someone else, or not suiting the party. Our own hold is the one thing only the drawn state knows.
    const spoken: SeatState = item.table.state === "mine" ? "mine" : dinerState(table, null);
    const parts = [`Table ${table.label}`, partyRange(table), DINER_STATE_WORDS[spoken]];
    if (table.accessible) parts.push("accessible");
    return parts.join(", ");
  };
}

/**
 * The one state a table shows to this diner. Order matters:
 * - taken beats everything, even our own hold (the hold was lost);
 * - our own hold shows as "mine" (the server only knows it is "held");
 * - a table that does not suit the party uses the "not available" glyph.
 */
export function dinerState(table: DinerTable, heldId: number | null): SeatState {
  if (table.state === "taken") return "taken";
  if (table.id === heldId) return "mine";
  if (table.state === "held") return "held";
  if (!table.fits_party) return "blocked";
  return "free";
}

/**
 * The diner's map draws only three looks: available (open ring), your table (green, ticked) and
 * unavailable (one neutral look for booked, being chosen by someone else, and not suiting the party).
 * The reason stays in the spoken name of the table and in its card, not in more symbols.
 */
export function drawnState(state: SeatState): SeatState {
  return state === "held" || state === "blocked" ? "taken" : state;
}

export function tablesForMap(map: DinerMap, heldId: number | null): MapTable[] {
  return map.tables.map((table) => ({ ...table, state: drawnState(dinerState(table, heldId)) }));
}

/** A table the diner could pick right now. */
export function isPickable(table: DinerTable): boolean {
  return table.state === "free" && table.fits_party;
}

/**
 * Up to `limit` other tables to offer after a conflict: the recommended ones
 * first, then the closest fit (fewest empty chairs).
 */
export function alternatives(map: DinerMap, excludeId: number | null, party: number, limit = 3): DinerTable[] {
  const recommended = new Set(map.recommended?.table_ids ?? []);
  const open = map.tables.filter((t) => isPickable(t) && t.id !== excludeId);
  const ranked = [...open].sort((a, b) => {
    const rankA = recommended.has(a.id) ? 0 : 1;
    const rankB = recommended.has(b.id) ? 0 : 1;
    if (rankA !== rankB) return rankA - rankB;
    return a.max_party - party - (b.max_party - party);
  });
  return ranked.slice(0, limit);
}

export function zoneName(table: MapTable, zones: MapZone[]): string | null {
  return zones.find((zone) => zone.id === table.zone_id)?.name ?? null;
}

/** Plain words that describe a table, e.g. ["Window", "2 to 4 people", "Accessible"]. */
export function tableFeatures(table: DinerTable, zones: MapZone[]): string[] {
  const features: string[] = [];
  const zone = zoneName(table, zones);
  if (zone) features.push(zone);
  features.push(partyRange(table));
  if (table.accessible) features.push("Accessible");
  if (table.high_chair_ok) features.push("High chair OK");
  return features;
}

/** Why a table cannot be picked, in words (shown in the table list). */
export function unavailableReason(table: DinerTable): string | null {
  if (table.state === "taken") return "Booked";
  if (table.state === "held") return "Someone is choosing it";
  if (!table.fits_party) return "Does not suit your party";
  return null;
}
