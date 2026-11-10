// The things you can pick on the map: a seat (events) or a whole table
// (restaurants). Both are "options" of the map's listbox, so screen readers
// and the keyboard treat them the same way.
//
// Both components are memoised and receive only simple values, so with 400
// seats a live update or a keyboard move redraws only the seats that changed.
import { memo } from "react";
import type { MapSeat, MapTable, SeatState } from "../api/types";
import { describeItem } from "./describe";
import type { DescribeItem, MapItem } from "./describe";
import { SEAT_RADIUS, seatHitRadius, tableCentre, tableHitRadius } from "./geometry";
import { AccessibleBadge, SeatGlyph, StateMark, bodyFill } from "./glyphs";
import { TableLabel, TableShape } from "./MapLayers";
import type { MotionKind } from "./useSeatChanges";

/** DOM id for a target, used by aria-activedescendant. */
export function targetDomId(mapId: string, id: number): string {
  return `${mapId}-t${id}`;
}

interface TargetFlags {
  domId: string;
  ariaLabel: string;
  selectable: boolean;
  selected: boolean;
  active: boolean;
  highlighted: boolean;
  /** The second highlight, for example "changed by preview". */
  marked: boolean;
  motion: MotionKind | undefined;
  prefix: string;
  onPick: (id: number) => void;
  onHover: (id: number | null) => void;
}

function targetClass(flags: TargetFlags, state: SeatState): string {
  const classes = ["target", `state-${state}`];
  if (flags.selectable) classes.push("is-selectable");
  if (flags.selected) classes.push("is-selected");
  if (flags.active) classes.push("is-active");
  if (flags.highlighted) classes.push("is-highlighted");
  if (flags.marked) classes.push("is-marked");
  return classes.join(" ");
}

/**
 * The rings that sit around a target: recommended halo, second highlight,
 * selection and keyboard cursor. The second highlight is a SQUARE, so it
 * differs from the round recommendation halo in shape, not only in colour.
 */
function Rings({ radius, flags }: { radius: number; flags: TargetFlags }) {
  const square = radius + 7;
  return (
    <>
      {flags.highlighted && <circle r={radius + 5} className="ring-highlight" />}
      {flags.marked && <rect x={-square} y={-square} width={square * 2} height={square * 2} rx="3" className="ring-marked" />}
      {flags.selected && <circle r={radius + 4} className="ring-selected" />}
      {flags.active && <circle r={radius + 8} className="ring-active" />}
    </>
  );
}

/** `hitRadius` grows with zoom-out up to the room around the seat (geometry.ts, seatHitRadius). */
type SeatNodeProps = TargetFlags & { seat: MapSeat; hitRadius: number };

export const SeatNode = memo(function SeatNode({ seat, hitRadius, ...flags }: SeatNodeProps) {
  return (
    <g
      id={flags.domId}
      role="option"
      aria-label={flags.ariaLabel}
      aria-selected={flags.selected}
      aria-disabled={!flags.selectable}
      className={targetClass(flags, seat.state)}
      transform={`translate(${seat.x} ${seat.y})`}
      onClick={() => flags.onPick(seat.id)}
      onPointerEnter={() => flags.onHover(seat.id)}
      onPointerLeave={() => flags.onHover(null)}
    >
      {/* Inner group: CSS animations need an element without its own transform attribute. */}
      <g className="target-inner" data-motion={flags.motion}>
        {/* Invisible, larger hit area so small seats are easier to tap. */}
        <circle r={hitRadius} className="hit-area" />
        <Rings radius={SEAT_RADIUS} flags={flags} />
        <SeatGlyph state={seat.state} accessible={seat.accessible} prefix={flags.prefix} />
      </g>
    </g>
  );
});

type TableNodeProps = TargetFlags & { table: MapTable; seats: MapSeat[] };

export const TableNode = memo(function TableNode({ table, seats, ...flags }: TableNodeProps) {
  const state = table.state ?? "free";
  const radius = Math.max(table.w, table.h) / 2;
  const centre = tableCentre(table);
  return (
    <g
      id={flags.domId}
      role="option"
      aria-label={flags.ariaLabel}
      aria-selected={flags.selected}
      aria-disabled={!flags.selectable}
      className={targetClass(flags, state)}
      onClick={() => flags.onPick(table.id)}
      onPointerEnter={() => flags.onHover(table.id)}
      onPointerLeave={() => flags.onHover(null)}
    >
      {seats.map((seat) => (
        <circle key={seat.id} cx={seat.x} cy={seat.y} r={SEAT_RADIUS - 2} className="table-chair" />
      ))}
      <g transform={`translate(${centre.x} ${centre.y})`}>
        <circle r={tableHitRadius(table)} className="hit-area" />
        <g className="target-inner" data-motion={flags.motion}>
          <Rings radius={radius} flags={flags} />
        </g>
      </g>
      <TableShape table={table} className={`glyph-${state} glyph-body`} fill={bodyFill(state, flags.prefix)} />
      <g transform={`translate(${centre.x} ${centre.y - 7}) scale(1.2)`}>
        <StateMark state={state} />
      </g>
      {table.accessible && (
        <g transform={`translate(${centre.x + radius * 0.7} ${centre.y - radius * 0.7})`}>
          <AccessibleBadge r={0} />
        </g>
      )}
      <TableLabel table={table} dy={hasMark(state) ? 9 : 0} />
    </g>
  );
});

/** States that draw a mark in the middle of the shape. */
function hasMark(state: SeatState): boolean {
  return state === "taken" || state === "mine" || state === "blocked";
}

const NO_SEATS: MapSeat[] = [];

export interface TargetsLayerProps {
  mode: "seats" | "tables";
  mapId: string;
  tables: MapTable[];
  seats: MapSeat[];
  tableById: Map<number, MapTable>;
  seatsByTable: Map<number, MapSeat[]>;
  /** Half the distance to the nearest seat, per seat id (geometry.ts, roomAround). */
  rooms: Map<number, number>;
  zoom: number;
  isSelectable: (id: number) => boolean;
  selectedId: number | null;
  activeId: number | null;
  highlight: ReadonlySet<number>;
  marked: ReadonlySet<number>;
  markedLabel: string;
  describe?: DescribeItem;
  motion: Map<number, MotionKind>;
  onPick: (id: number) => void;
  onHover: (id: number | null) => void;
}

/** The map item behind a target id, in the shape a page's `describe` receives. */
export function itemFor(mode: "seats" | "tables", id: number, p: Pick<TargetsLayerProps, "seats" | "tableById" | "seatsByTable">): MapItem | null {
  if (mode === "tables") {
    const table = p.tableById.get(id);
    return table ? { kind: "table", table, seats: p.seatsByTable.get(id) ?? NO_SEATS } : null;
  }
  const seat = p.seats.find((s) => s.id === id);
  return seat ? { kind: "seat", seat, table: p.tableById.get(seat.table_id) } : null;
}

/**
 * All pickable targets. Memoised separately from the camera, so panning
 * (which changes only the parent transform) never re-runs this loop. Zooming
 * does re-run it, because hit areas depend on the zoom; seats whose hit area
 * did not change are skipped by their own memo.
 */
export const TargetsLayer = memo(function TargetsLayer(p: TargetsLayerProps) {
  const flagsFor = (id: number, item: MapItem) => {
    const flags = {
      domId: targetDomId(p.mapId, id),
      selectable: p.isSelectable(id),
      selected: id === p.selectedId,
      active: id === p.activeId,
      highlighted: p.highlight.has(id),
      marked: p.marked.has(id),
      motion: p.motion.get(id),
      prefix: p.mapId,
      onPick: p.onPick,
      onHover: p.onHover,
    };
    const words = { recommended: flags.highlighted, marked: flags.marked ? p.markedLabel : null, selected: flags.selected };
    return { ...flags, ariaLabel: describeItem(item, words, p.describe) };
  };

  if (p.mode === "tables") {
    return (
      <g>
        {p.tables.map((table) => {
          const seats = p.seatsByTable.get(table.id) ?? NO_SEATS;
          return <TableNode key={table.id} table={table} seats={seats} {...flagsFor(table.id, { kind: "table", table, seats })} />;
        })}
      </g>
    );
  }
  return (
    <g>
      {p.seats.map((seat) => {
        const hitRadius = seatHitRadius(p.rooms.get(seat.id) ?? 0, p.zoom);
        const item: MapItem = { kind: "seat", seat, table: p.tableById.get(seat.table_id) };
        return <SeatNode key={seat.id} seat={seat} hitRadius={hitRadius} {...flagsFor(seat.id, item)} />;
      })}
    </g>
  );
});
