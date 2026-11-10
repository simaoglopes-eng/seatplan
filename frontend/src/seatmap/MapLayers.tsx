// The parts of the map that are scenery: zones on the floor and table shapes.
// They are memoised so panning (which re-renders the parent every frame)
// does not redraw them.
import { memo } from "react";
import type { MapSeat, MapTable, MapZone } from "../api/types";
import { SEAT_RADIUS, rotateOffset, tableCentre } from "./geometry";

interface TableShapeProps {
  table: MapTable;
  className?: string;
  fill?: string;
}

/** One table outline. Drawn around its centre so rotation turns it in place. */
export function TableShape({ table, className = "", fill }: TableShapeProps) {
  const { w, h } = table;
  const centre = tableCentre(table);
  return (
    <g transform={`translate(${centre.x} ${centre.y}) rotate(${table.rotation})`} className={`table-shape table-${table.shape} ${className}`}>
      {table.shape === "round" && <ellipse rx={w / 2} ry={h / 2} fill={fill} />}
      {table.shape === "rect" && <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="6" fill={fill} />}
      {table.shape === "row" && <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} fill={fill} />}
    </g>
  );
}

/** Where a table's name goes: the middle, except for rows, where the middle is full of seats. */
export function labelPosition(table: MapTable): { x: number; y: number } {
  const centre = tableCentre(table);
  if (table.shape !== "row") return centre;
  return rotateOffset(centre.x, centre.y, -table.w / 2 - 18, 0, table.rotation);
}

/** `dy` moves the label down, to make room for a state mark above it. */
export function TableLabel({ table, dy = 0 }: { table: MapTable; dy?: number }) {
  const at = labelPosition(table);
  return (
    <text x={at.x} y={at.y + dy} className={table.shape === "row" ? "table-label table-label-row" : "table-label"} textAnchor="middle" dominantBaseline="central">
      {table.label}
    </text>
  );
}

/** Tables as background scenery (events mode, where seats are the targets). */
export const TablesLayer = memo(function TablesLayer({ tables }: { tables: MapTable[] }) {
  return (
    <g aria-hidden="true">
      {tables.map((table) => (
        <g key={table.id}>
          <TableShape table={table} />
          <TableLabel table={table} />
        </g>
      ))}
    </g>
  );
});

export const ZonesLayer = memo(function ZonesLayer({ zones }: { zones: MapZone[] }) {
  return (
    <g aria-hidden="true">
      {zones.map((zone) => (
        <g key={zone.id} className={`zone zone-${zone.kind}`}>
          <rect x={zone.x} y={zone.y} width={zone.w} height={zone.h} rx="14" className="zone-area" />
          {/* "hanging": the text grows downwards into the zone when it is enlarged for small zooms. */}
          <text x={zone.x + 12} y={zone.y + 8} className="zone-label" dominantBaseline="hanging">
            {zone.name}
          </text>
        </g>
      ))}
    </g>
  );
});

/**
 * Who sits where, written under each seat (organiser map). Only drawn when
 * zoomed in far enough to read; the names are also in each seat's
 * accessible name, so this layer is hidden from screen readers.
 */
export const NamesLayer = memo(function NamesLayer({ seats }: { seats: MapSeat[] }) {
  return (
    <g aria-hidden="true" className="occupant-names">
      {seats
        .filter((seat) => seat.occupant && seat.state !== "free")
        .map((seat) => (
          <text key={seat.id} x={seat.x} y={seat.y + SEAT_RADIUS + 3} className="occupant-name" textAnchor="middle" dominantBaseline="hanging">
            {seat.occupant}
          </text>
        ))}
    </g>
  );
});
