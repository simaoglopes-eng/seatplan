import { useRef } from "react";
import type { PointerEvent } from "react";
import type { Point } from "./geometry";
import type { Room } from "./roomModel";
import { editChair, editTable } from "./tableModel";
import { snappedPoint } from "./shapeModel";

interface Props { room: Room; editing: boolean; selected: string | null; chair: string | null; grid: boolean; zoom: number; toWorld: (event: { clientX: number; clientY: number }) => Point; onSelect: (key: string, chair: string | null) => void; onChange: (room: Room, transient?: boolean) => void; onDragStart: () => void; onError: (message: string) => void }
interface Drag { base: Room; table: string; chair: string | null; start: Point; at: Point; started: boolean }
export function TableLayer({ room, editing, selected, chair, grid, zoom, toWorld, onSelect, onChange, onDragStart, onError }: Props) {
  const drag = useRef<Drag | null>(null);
  const down = (event: PointerEvent<SVGGElement>, table: string, chairKey: string | null, at: Point) => {
    if (!editing) return;
    event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); onSelect(table, chairKey);
    drag.current = { base: room, table, chair: chairKey, start: toWorld(event), at, started: false };
  };
  const move = (event: PointerEvent<SVGGElement>) => {
    const d = drag.current; if (!d) return;
    event.stopPropagation(); const point = toWorld(event), dx = point.x - d.start.x, dy = point.y - d.start.y;
    if (!d.started && Math.hypot(dx, dy) * zoom < 5) return;
    if (!d.started) { onDragStart(); d.started = true; }
    const at = d.chair ? { x: Math.round(d.at.x + dx), y: Math.round(d.at.y + dy) } : snappedPoint({ x: d.at.x + dx, y: d.at.y + dy }, null, grid, false);
    try { onChange(d.chair ? editChair(d.base, d.table, d.chair, at) : editTable(d.base, d.table, at), true); }
    catch (caught) { onError(caught instanceof Error ? caught.message : "Check the table."); }
  };
  return <g style={{ pointerEvents: editing ? "auto" : "none" }} onPointerMove={move} onPointerUp={event => { if (editing) event.stopPropagation(); drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onClick={event => { if (editing) event.stopPropagation(); }}>
    {room.tables.map(table => <g key={table.key} data-room-table={table.key} className={`${selected === table.key ? "room-selected-table" : ""} ${table.is_active ? "" : "room-inactive-table"}`} transform={`translate(${table.x + table.w / 2} ${table.y + table.h / 2}) rotate(${table.rotation})`} onPointerDown={event => down(event, table.key, null, table)}>
      {table.shape === "round" ? <circle r={table.w / 2} className="room-table" /> : <rect x={-table.w / 2} y={-table.h / 2} width={table.w} height={table.h} className="room-table" />}
      <text textAnchor="middle" dominantBaseline="middle" className="room-table-label">{table.label}{table.is_active ? "" : " (off)"}</text>
    </g>)}
    {room.tables.flatMap(table => table.seats.map(seat => <g key={seat.key} data-room-chair={seat.key} onPointerDown={event => down(event, table.key, seat.key, seat)}>
      {editing && <circle cx={seat.x} cy={seat.y} r={22 / zoom} className="room-handle-hit" />}
      <circle cx={seat.x} cy={seat.y} r="9" className={chair === seat.key ? "room-seat room-selected-seat" : "room-seat"} />
      {seat.is_accessible && <circle cx={seat.x} cy={seat.y} r="13" className="room-chair-accessible" />}
      {seat.is_blocked && <path d={`M ${seat.x - 5} ${seat.y - 5} l 10 10 M ${seat.x + 5} ${seat.y - 5} l -10 10`} className="room-chair-blocked" />}
    </g>))}
  </g>;
}
