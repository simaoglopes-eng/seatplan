import { useId, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Button } from "../../design/components";
import { usePanZoom } from "../../seatmap/usePanZoom";
import { outlineToPolygon } from "./geometry";
import type { Point } from "./geometry";
import { snappedPoint } from "./shapeModel";
import type { Room } from "./roomModel";

interface Props { room: Room; drawing: boolean; grid: boolean; onPoint: (point: Point) => void; onCloseShape: () => void }

export function RoomCanvas({ room, drawing, grid, onPoint, onCloseShape }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const patternId = useId();
  const [cursor, setCursor] = useState<Point | null>(null);
  const points = room.outline.points;
  const maxX = Math.max(1000, ...points.map(p => p.x)), maxY = Math.max(700, ...points.map(p => p.y));
  const pan = usePanZoom(viewport, { minX: -100, minY: -100, maxX: maxX + 100, maxY: maxY + 100 });
  const screenPoint = (event: { clientX: number; clientY: number; shiftKey: boolean }): Point => {
    const bounds = viewport.current!.getBoundingClientRect();
    return snappedPoint({ x: (event.clientX - bounds.left - pan.view.x) / pan.view.k, y: (event.clientY - bounds.top - pan.view.y) / pan.view.k }, points.at(-1) ?? null, grid, event.shiftKey);
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => { pan.pointerHandlers.onPointerMove(event); if (drawing) setCursor(screenPoint(event)); };
  const polygon = points.length >= 3 ? outlineToPolygon(room.outline).map(p => `${p.x},${p.y}`).join(" ") : "";
  return <div className="room-canvas-wrap">
    <div ref={viewport} className="room-canvas" {...pan.pointerHandlers} onPointerMove={move} onClick={event => {
      if (!drawing || pan.wasDragged()) return;
      const point = screenPoint(event);
      if (points.length >= 3 && Math.hypot(point.x - points[0].x, point.y - points[0].y) * pan.view.k < 24) onCloseShape();
      else onPoint(point);
    }}>
      <svg width="100%" height="100%" aria-hidden="true">
        <defs><pattern id={patternId} width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" className="room-grid-line" /></pattern></defs>
        <g transform={`translate(${pan.view.x} ${pan.view.y}) scale(${pan.view.k})`}>
          <rect x="-10000" y="-10000" width="20000" height="20000" fill={grid ? `url(#${patternId})` : "transparent"} />
          {Array.from({ length: Math.floor(maxX / 100) + 1 }, (_, i) => <text key={`x${i}`} x={i * 100} y={-35 / pan.view.k} textAnchor="middle" fontSize={11 / pan.view.k} className="room-ruler">{i} m</text>)}
          {Array.from({ length: Math.floor(maxY / 100) + 1 }, (_, i) => <text key={`y${i}`} x={-30 / pan.view.k} y={i * 100} textAnchor="end" fontSize={11 / pan.view.k} className="room-ruler">{i} m</text>)}
          {!drawing && polygon && <polygon points={polygon} className="room-outline" />}
          {drawing && <polyline points={[...points, ...(cursor ? [cursor] : [])].map(p => `${p.x},${p.y}`).join(" ")} className="room-drawing" />}
          {points.map((p, i) => <g key={i}><circle cx={p.x} cy={p.y} r={5 / pan.view.k} className="room-corner" /><text x={p.x + 12 / pan.view.k} y={p.y - 10 / pan.view.k} fontSize={12 / pan.view.k} className="room-ruler">{i + 1}</text></g>)}
          {room.tables.map(table => <g key={table.key} transform={`translate(${table.x + table.w / 2} ${table.y + table.h / 2}) rotate(${table.rotation})`}>
            {table.shape === "round" ? <circle r={table.w / 2} className="room-table" /> : <rect x={-table.w / 2} y={-table.h / 2} width={table.w} height={table.h} className="room-table" />}
            <text textAnchor="middle" dominantBaseline="middle" className="room-table-label">{table.label}</text>
          </g>)}
          {room.tables.flatMap(t => t.seats).map(seat => <circle key={seat.key} cx={seat.x} cy={seat.y} r="9" className="room-seat" />)}
        </g>
      </svg>
    </div>
    <div className="room-zoom"><Button variant="secondary" aria-label="Zoom out" onClick={() => pan.zoomBy(0.8)}>−</Button><Button variant="secondary" onClick={pan.fit}>Fit room</Button><Button variant="secondary" aria-label="Zoom in" onClick={() => pan.zoomBy(1.25)}>+</Button><span>{Math.round(pan.view.k * 100)}%</span></div>
  </div>;
}
