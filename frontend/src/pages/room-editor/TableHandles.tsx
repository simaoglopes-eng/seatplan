import { useRef } from "react";
import type { PointerEvent } from "react";
import type { Point } from "./geometry";
import type { Room, RoomTable } from "./roomModel";
import { resizeTableAt, rotationAt } from "./selection";
import { editTable } from "./tableModel";

interface Props { room: Room; table: RoomTable; grid: boolean; zoom: number; toWorld: (event: { clientX: number; clientY: number }) => Point; onChange: (room: Room, transient?: boolean) => void; onDragStart: () => void; onError: (message: string) => void }
export function TableHandles({ room, table, grid, zoom, toWorld, onChange, onDragStart, onError }: Props) {
  const drag = useRef<{ kind: "rotate" | "resize"; base: Room; start: Point; started: boolean } | null>(null);
  const a = table.rotation * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), cx = table.x + table.w / 2, cy = table.y + table.h / 2;
  const at = (x: number, y: number) => ({ x: cx + x * c - y * s, y: cy + x * s + y * c });
  const rotation = at(0, -table.h / 2 - 42 / zoom), resize = at(table.w / 2, table.h / 2), top = at(0, -table.h / 2);
  const down = (event: PointerEvent<SVGGElement>, kind: "rotate" | "resize") => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { kind, base: room, start: toWorld(event), started: false }; };
  const move = (event: PointerEvent<SVGGElement>) => {
    const d = drag.current; if (!d) return;
    event.stopPropagation(); const point = toWorld(event);
    if (!d.started && Math.hypot(point.x - d.start.x, point.y - d.start.y) * zoom < 5) return;
    if (!d.started) { onDragStart(); d.started = true; }
    const baseTable = d.base.tables.find(t => t.key === table.key)!;
    try { onChange(d.kind === "resize" ? resizeTableAt(d.base, table.key, point, grid) : editTable(d.base, table.key, { rotation: rotationAt({ x: baseTable.x + baseTable.w / 2, y: baseTable.y + baseTable.h / 2 }, point, event.altKey) }), true); }
    catch (caught) { onError(caught instanceof Error ? caught.message : "Check the table."); }
  };
  return <g onPointerMove={move} onPointerUp={event => { event.stopPropagation(); drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
    <line x1={top.x} y1={top.y} x2={rotation.x} y2={rotation.y} className="room-transform-line" />
    {([{ kind: "rotate", point: rotation }, { kind: "resize", point: resize }] as const).map(({ kind, point }) => <g key={kind} data-table-handle={kind} onPointerDown={event => down(event, kind)}><circle cx={point.x} cy={point.y} r={22 / zoom} className="room-handle-hit" />{kind === "rotate" ? <circle cx={point.x} cy={point.y} r={6 / zoom} className="room-handle" /> : <rect x={point.x - 6 / zoom} y={point.y - 6 / zoom} width={12 / zoom} height={12 / zoom} className="room-handle" />}</g>)}
  </g>;
}
