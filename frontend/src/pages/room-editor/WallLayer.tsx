import { useRef } from "react";
import type { PointerEvent } from "react";
import { sideLength, sideNormal, sidePoint } from "./geometry";
import type { Point } from "./geometry";
import type { Room, RoomOpening } from "./roomModel";
import { openingPath, updateOpening, wallOffset } from "./wallModel";

interface Props { room: Room; zoom: number; editing: boolean; selected: string | null; toWorld: (event: { clientX: number; clientY: number }) => Point; onSelect: (key: string) => void; onChange: (room: Room, transient?: boolean) => void; onDragStart: () => void; onError: (message: string) => void }
interface Drag { opening: RoomOpening; base: Room; part: "body" | "start" | "end"; start: number; started: boolean }
export function WallLayer({ room, zoom, editing, selected, toWorld, onSelect, onChange, onDragStart, onError }: Props) {
  const drag = useRef<Drag | null>(null);
  const down = (event: PointerEvent<SVGGElement>, opening: RoomOpening, part: Drag["part"]) => {
    if (!editing) return;
    event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); onSelect(opening.key);
    if (opening.kind !== "glass_wall") drag.current = { opening, part, base: room, start: wallOffset(room, opening.side, toWorld(event)), started: false };
  };
  const move = (event: PointerEvent<SVGGElement>) => {
    const d = drag.current; if (!d) return;
    event.stopPropagation();
    const length = sideLength(d.base.outline, d.opening.side), end = d.opening.offset + d.opening.width;
    const delta = wallOffset(d.base, d.opening.side, toWorld(event)) - d.start;
    if (!d.started && Math.abs(delta) * zoom < 5) return;
    if (!d.started) { onDragStart(); d.started = true; }
    const change = d.part === "body" ? { offset: Math.max(0, Math.min(length - d.opening.width, Math.round(d.opening.offset + delta))) }
      : d.part === "end" ? { width: Math.max(40, Math.min(length, Math.round(end + delta)) - d.opening.offset) }
      : (() => { const offset = Math.max(0, Math.min(end - 40, Math.round(d.opening.offset + delta))); return { offset, width: end - offset }; })();
    try { onChange(updateOpening(d.base, d.opening.key, change), true); }
    catch (caught) { onError(caught instanceof Error ? caught.message : "Keep openings apart."); }
  };
  return <g className="room-openings" onPointerMove={move} onPointerUp={event => { if (editing) event.stopPropagation(); drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onClick={event => { if (editing) event.stopPropagation(); }}>
    {room.openings.map(o => {
      try {
      const length = sideLength(room.outline, o.side), start = sidePoint(room.outline, o.side, o.offset / length), end = sidePoint(room.outline, o.side, (o.offset + o.width) / length);
      const normal = sideNormal(room.outline, o.side, o.offset / length), hinge = { x: start.x - normal.x * o.width, y: start.y - normal.y * o.width };
      const path = openingPath(room, o);
      return <g key={o.key} data-opening={o.key} className={selected === o.key ? "room-opening selected" : "room-opening"}>
        <g data-opening-body={o.key} onPointerDown={event => down(event, o, "body")}>
          <path d={path} className="room-opening-gap" />
          {o.kind === "door" ? <path d={`M ${end.x} ${end.y} A ${o.width} ${o.width} 0 0 1 ${hinge.x} ${hinge.y} L ${start.x} ${start.y}`} className="room-door-arc" /> : <><path d={path} className="room-window" />{o.kind === "window" && <path d={path} className="room-window-middle" />}</>}
          {editing && <path d={path} className="room-opening-hit" strokeWidth={44 / zoom} />}
        </g>
        {editing && selected === o.key && o.kind !== "glass_wall" && ([{ part: "start", point: start }, { part: "end", point: end }] as const).map(({ part, point }) => <g key={part} data-opening-handle={part} onPointerDown={event => down(event, o, part)}><circle cx={point.x} cy={point.y} r={22 / zoom} className="room-handle-hit" /><circle cx={point.x} cy={point.y} r={6 / zoom} className="room-handle" /></g>)}
      </g>;
      } catch { return null; }
    })}
  </g>;
}
