// Converts between the API's flat lists (backend/app/routers/venues.py) and
// the editor's nested layout. Only listed fields are copied: the backend
// rejects unknown fields, and GET returns a few the PUT does not accept.
import type { LayoutPayload, SeatRow, TableIn, TableRow, VenueDetail, ZoneRow } from "../../api/types";
import type { LayoutSeat, LayoutTable, LayoutZone, VenueLayout } from "./layoutModel";

function zoneFromRow(row: ZoneRow): LayoutZone {
  return { id: row.id, key: row.key, name: row.name, kind: row.kind, x: row.x, y: row.y, w: row.w, h: row.h };
}

function seatFromRow(row: SeatRow): LayoutSeat {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    x: row.x,
    y: row.y,
    is_accessible: row.is_accessible,
    is_blocked: row.is_blocked,
    reserved_tag: row.reserved_tag,
  };
}

function tableFromRow(row: TableRow, zoneKeyById: Map<number, string>, seats: LayoutSeat[]): LayoutTable {
  return {
    id: row.id,
    key: row.key,
    zone_key: row.zone_id === null ? null : (zoneKeyById.get(row.zone_id) ?? null),
    label: row.label,
    shape: row.shape,
    x: row.x,
    y: row.y,
    w: row.w,
    h: row.h,
    rotation: row.rotation,
    min_party: row.min_party,
    max_party: row.max_party,
    is_accessible: row.is_accessible,
    high_chair_ok: row.high_chair_ok,
    combine_group: row.combine_group,
    seats,
  };
}

/** API answer -> editor layout (seats nested under their table). */
export function layoutFromVenue(detail: VenueDetail): VenueLayout {
  const zoneKeyById = new Map(detail.zones.map((z) => [z.id, z.key]));
  const tables = detail.tables.map((row) =>
    tableFromRow(row, zoneKeyById, detail.seats.filter((s) => s.table_id === row.id).map(seatFromRow)),
  );
  return { zones: detail.zones.map(zoneFromRow), tables };
}

/** One table for the PUT body: every field except the nested seats. */
function tableIn(table: LayoutTable): TableIn {
  return {
    id: table.id,
    key: table.key,
    zone_key: table.zone_key,
    label: table.label,
    shape: table.shape,
    x: table.x,
    y: table.y,
    w: table.w,
    h: table.h,
    rotation: table.rotation,
    min_party: table.min_party,
    max_party: table.max_party,
    is_accessible: table.is_accessible,
    high_chair_ok: table.high_chair_ok,
    combine_group: table.combine_group,
  };
}

/** Editor layout -> PUT body (three flat lists linked by key). */
export function payloadFromLayout(layout: VenueLayout): LayoutPayload {
  const tables = layout.tables.map(tableIn);
  const seats = layout.tables.flatMap((table) => table.seats.map((seat) => ({ ...seat, table_key: table.key })));
  return { zones: layout.zones, tables, seats };
}
