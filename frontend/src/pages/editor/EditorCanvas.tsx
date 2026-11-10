// The drawing surface of the editor. Drag the floor to pan, scroll or pinch
// to zoom (same hook as the seat map), drag a table or zone to move it,
// click a seat to edit it.
//
// The SVG is hidden from screen readers on purpose: the side panel lists
// every table and zone as buttons, which is the accessible way in.
import { useMemo, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { LayoutTable, LayoutZone, VenueLayout } from "./layoutModel";
import { SEAT_RADIUS } from "../../seatmap/geometry";
import type { Bounds } from "../../seatmap/geometry";
import { PatternDefs, SeatGlyph } from "../../seatmap/glyphs";
import { MapControls } from "../../seatmap/MapControls";
import { TableLabel, TableShape } from "../../seatmap/MapLayers";
import { usePanZoom } from "../../seatmap/usePanZoom";
import type { Selection } from "./layoutModel";
import "../../seatmap/seatmap.css";

// A small grid makes tables line up without fiddling.
const SNAP = 5;

interface EditorCanvasProps {
  layout: VenueLayout;
  width: number;
  height: number;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onDragStart: () => void;
  onDragMove: (selection: NonNullable<Selection>, x: number, y: number) => void;
}

interface DragState {
  pointerId: number;
  target: NonNullable<Selection>;
  /** What a press without movement selects: the seat under the pointer, or the item itself. */
  clickTarget: NonNullable<Selection>;
  startClient: { x: number; y: number };
  startPos: { x: number; y: number };
  started: boolean;
}

function snap(value: number): number {
  return Math.round(value / SNAP) * SNAP;
}

export function EditorCanvas(props: EditorCanvasProps) {
  const { layout, width, height, selection } = props;
  const viewportRef = useRef<HTMLDivElement>(null);
  const leaveRef = useRef<HTMLButtonElement>(null);
  const bounds = useMemo<Bounds>(() => ({ minX: -40, minY: -40, maxX: width + 40, maxY: height + 40 }), [width, height]);
  const panZoom = usePanZoom(viewportRef, bounds);
  const drag = useRef<DragState | null>(null);

  const startDrag = (event: ReactPointerEvent<SVGGElement>, target: NonNullable<Selection>, at: { x: number; y: number }): void => {
    event.stopPropagation(); // the floor must not pan while an item is dragged
    // Chairs cover most of a theatre row, so pressing a chair must still drag
    // its table; only a press WITHOUT movement selects the chair itself.
    const seatKey = (event.target as Element).closest("[data-seat-key]")?.getAttribute("data-seat-key");
    const clickTarget: NonNullable<Selection> = seatKey ? { kind: "seat", key: seatKey } : target;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { pointerId: event.pointerId, target, clickTarget, startClient: { x: event.clientX, y: event.clientY }, startPos: at, started: false };
  };

  const moveDrag = (event: ReactPointerEvent<SVGGElement>): void => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    // Screen pixels become venue units by dividing by the zoom.
    const dx = (event.clientX - d.startClient.x) / panZoom.view.k;
    const dy = (event.clientY - d.startClient.y) / panZoom.view.k;
    if (!d.started && Math.hypot(dx, dy) < 3) return;
    if (!d.started) {
      d.started = true;
      props.onDragStart();
    }
    props.onDragMove(d.target, snap(d.startPos.x + dx), snap(d.startPos.y + dy));
  };

  const endDrag = (event: ReactPointerEvent<SVGGElement>): void => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    if (!d.started) props.onSelect(d.clickTarget); // no movement: it was a click
    drag.current = null;
  };

  const dragHandlers = { onPointerMove: moveDrag, onPointerUp: endDrag, onPointerCancel: endDrag };
  const { view } = panZoom;

  return (
    <div className="editor-canvas-wrap">
      <div
        ref={viewportRef}
        className="editor-canvas"
        tabIndex={0}
        role="region"
        aria-label="Floor plan canvas. Choose an item in the side panel, then use the arrow keys to move it."
        {...panZoom.pointerHandlers}
      >
        <svg width="100%" height="100%" aria-hidden="true">
          <PatternDefs prefix="editor" />
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            <rect
              width={width}
              height={height}
              className="editor-floor"
              onClick={() => {
                if (!panZoom.wasDragged()) props.onSelect(null);
              }}
            />
            {layout.zones.map((zone) => (
              <ZoneItem key={zone.key} zone={zone} selected={isSelected(selection, "zone", zone.key)} {...dragHandlers}
                onPointerDown={(e) => startDrag(e, { kind: "zone", key: zone.key }, zone)} />
            ))}
            {layout.tables.map((table) => (
              <TableItem key={table.key} table={table} selection={selection} {...dragHandlers}
                onPointerDown={(e) => startDrag(e, { kind: "table", key: table.key }, table)} />
            ))}
          </g>
        </svg>
      </div>
      <MapControls leaveRef={leaveRef} onZoomIn={() => panZoom.zoomBy(1.25)} onZoomOut={() => panZoom.zoomBy(0.8)} onFit={panZoom.fit} />
    </div>
  );
}

function isSelected(selection: Selection, kind: "table" | "seat" | "zone", key: string): boolean {
  return selection?.kind === kind && selection.key === key;
}

interface ItemHandlers {
  onPointerDown: (event: ReactPointerEvent<SVGGElement>) => void;
  onPointerMove: (event: ReactPointerEvent<SVGGElement>) => void;
  onPointerUp: (event: ReactPointerEvent<SVGGElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<SVGGElement>) => void;
}

function ZoneItem({ zone, selected, ...handlers }: { zone: LayoutZone; selected: boolean } & ItemHandlers) {
  return (
    <g className={`editor-zone zone-${zone.kind} ${selected ? "is-selected" : ""}`} {...handlers}>
      <rect x={zone.x} y={zone.y} width={zone.w} height={zone.h} rx="14" className="zone-area" />
      <text x={zone.x + 12} y={zone.y + 20} className="zone-label">
        {zone.name}
      </text>
    </g>
  );
}

type TableItemProps = { table: LayoutTable; selection: Selection } & ItemHandlers;

function TableItem({ table, selection, ...handlers }: TableItemProps) {
  const selected = isSelected(selection, "table", table.key);
  // TableShape draws map tables, which have a numeric id; the drawing does not use it.
  const drawable = { ...table, id: 0 };
  return (
    <g className={`editor-table ${selected ? "is-selected" : ""}`} {...handlers}>
      <TableShape table={drawable} />
      <TableLabel table={drawable} />
      {table.seats.map((seat) => (
        <g
          key={seat.key}
          transform={`translate(${seat.x} ${seat.y})`}
          className="editor-seat"
          data-seat-key={seat.key}
        >
          {isSelected(selection, "seat", seat.key) && <circle r={SEAT_RADIUS + 4} className="ring-selected" />}
          <SeatGlyph state={seat.is_blocked ? "blocked" : "free"} accessible={seat.is_accessible} prefix="editor" />
          {seat.reserved_tag && (
            <text className="editor-seat-tag" textAnchor="middle" dominantBaseline="central">
              {seat.reserved_tag.charAt(0).toUpperCase()}
            </text>
          )}
        </g>
      ))}
    </g>
  );
}
