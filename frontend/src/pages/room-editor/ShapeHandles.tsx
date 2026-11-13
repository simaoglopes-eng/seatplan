import { useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { sideLength, sidePath, sidePoint } from "./geometry";
import type { Point } from "./geometry";
import { insertCorner, moveCorner, setSideCurve } from "./shapeEditing";
import { snappedPoint } from "./shapeModel";
import type { Room } from "./roomModel";
import type { ShapeSelection } from "./ShapeTools";

interface Props {
  room: Room; zoom: number; grid: boolean; selection: ShapeSelection;
  toWorld: (event: { clientX: number; clientY: number }) => Point;
  onSelect: (selection: ShapeSelection) => void; onChange: (room: Room, transient?: boolean) => void;
  onDragStart: () => void; onError: (message: string) => void;
}
interface Drag { kind: "corner" | "side"; index: number; start: Point; base: Room; started: boolean }

export function ShapeHandles(props: Props) {
  const { room, zoom, grid, selection, toWorld, onSelect, onChange, onDragStart, onError } = props;
  const drag = useRef<Drag | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef({ side: -1, at: 0 });
  useEffect(() => {
    lastTap.current = { side: -1, at: 0 };
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [room]);
  const apply = (change: () => Room, transient = false) => { try { onChange(change(), transient); } catch (caught) { onError(caught instanceof Error ? caught.message : "Check the wall."); } };
  const down = (event: ReactPointerEvent<SVGGElement>, kind: "corner" | "side", index: number) => {
    event.stopPropagation(); event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { kind, index, start: toWorld(event), base: room, started: false };
    onSelect({ kind, index });
  };
  const move = (event: ReactPointerEvent<SVGGElement>) => {
    const active = drag.current;
    if (!active) return;
    event.stopPropagation();
    const point = toWorld(event), distance = Math.hypot(point.x - active.start.x, point.y - active.start.y) * zoom;
    if (!active.started && distance < 5) return;
    if (!active.started) { onDragStart(); active.started = true; }
    if (active.kind === "corner") apply(() => moveCorner(active.base, active.index, snappedPoint(point, null, grid, false)), true);
    else {
      const a = active.base.outline.points[active.index], b = active.base.outline.points[(active.index + 1) % active.base.outline.points.length];
      const dx = b.x - a.x, dy = b.y - a.y, chord = Math.hypot(dx, dy);
      const curve = a.curve + (point.x - active.start.x) * dy / chord - (point.y - active.start.y) * dx / chord;
      apply(() => setSideCurve(active.base, active.index, Math.max(-chord / 2, Math.min(chord / 2, Math.round(curve)))), true);
    }
  };
  const up = (event: ReactPointerEvent<SVGGElement>) => {
    event.stopPropagation();
    const active = drag.current; drag.current = null;
    if (!active || active.started || active.kind !== "side") return;
    const now = Date.now();
    if (lastTap.current.side === active.index && now - lastTap.current.at < 350) {
      if (timer.current) clearTimeout(timer.current);
      lastTap.current = { side: -1, at: 0 };
      apply(() => setSideCurve(room, active.index, 0));
    } else {
      lastTap.current = { side: active.index, at: now };
      timer.current = setTimeout(() => { apply(() => insertCorner(room, active.index)); onSelect({ kind: "corner", index: active.index + 1 }); }, 350);
    }
  };
  return <g className="shape-handles" onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; }} onClick={e => e.stopPropagation()}>
    {room.outline.points.map((_, i) => <path key={`wall-${i}`} d={sidePath(room.outline, i)} className="room-wall-hit" strokeWidth={24 / zoom} onPointerDown={e => { e.stopPropagation(); onSelect({ kind: "side", index: i }); }} />)}
    {room.outline.points.map((_, i) => {
      const mid = sidePoint(room.outline, i, 0.5), selected = selection?.index === i;
      return <g key={i}>
        <text x={mid.x} y={mid.y - 18 / zoom} textAnchor="middle" fontSize={12 / zoom} className="room-ruler">{(sideLength(room.outline, i) / 100).toFixed(2).replace(".", ",")} m</text>
        <g data-shape-handle={`side-${i}`} onPointerDown={e => down(e, "side", i)}>
          <circle cx={mid.x} cy={mid.y} r={22 / zoom} className="room-handle-hit" />
          <rect x={mid.x - 5 / zoom} y={mid.y - 5 / zoom} width={10 / zoom} height={10 / zoom} transform={`rotate(45 ${mid.x} ${mid.y})`} className={selected && selection?.kind === "side" ? "room-handle selected" : "room-handle"} />
        </g>
      </g>;
    })}
    {room.outline.points.map((point, i) => <g key={`corner-${i}`} data-shape-handle={`corner-${i}`} onPointerDown={e => down(e, "corner", i)}>
      <circle cx={point.x} cy={point.y} r={22 / zoom} className="room-handle-hit" />
      <circle cx={point.x} cy={point.y} r={6 / zoom} className={selection?.kind === "corner" && selection.index === i ? "room-handle selected" : "room-handle"} />
    </g>)}
  </g>;
}
