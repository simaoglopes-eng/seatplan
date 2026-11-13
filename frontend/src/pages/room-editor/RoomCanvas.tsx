import { useEffect, useId, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Button } from "../../design/components";
import { usePanZoom } from "../../seatmap/usePanZoom";
import { outlinePath, outlineToPolygon, sidePath } from "./geometry";
import type { Point } from "./geometry";
import { snappedPoint } from "./shapeModel";
import type { Room } from "./roomModel";
import { ShapeHandles } from "./ShapeHandles";
import type { ShapeSelection } from "./ShapeTools";
import { WallLayer } from "./WallLayer";
import { NorthDial } from "./NorthTools";
import { ObjectLayer } from "./ObjectLayer";
import { OBJECT_DRAG_TYPE } from "./ObjectFields";
import { TableLayer } from "./TableLayer";
import { tablesInBox } from "./selection";
import type { RoomProblem } from "./validation";

interface Props {
  room: Room; drawing: boolean; grid: boolean; onPoint: (point: Point) => void; onCloseShape: () => void;
  selection: ShapeSelection; onSelect: (selection: ShapeSelection) => void;
  onChange: (room: Room, transient?: boolean) => void; onDragStart: () => void; onError: (message: string) => void;
  tool: string; opening: string | null; onOpening: (key: string) => void;
  placement: string | null; object: string | null; onObject: (key: string) => void; onPlace: (point: Point, kind: string) => void;
  chair: string | null; onTableSelect: (key: string, chair: string | null, multiple?: boolean, long?: boolean) => void;
  tableKeys: string[]; multiple: boolean; areaMode: boolean; onArea: (keys: string[]) => void;
  problems: RoomProblem[]; focusTarget: { roomKey: string; point: Point; serial: number } | null;
}

export function RoomCanvas({ room, drawing, grid, onPoint, onCloseShape, selection, onSelect, onChange, onDragStart, onError, tool, opening, onOpening, placement, object, onObject, onPlace, chair, onTableSelect, tableKeys, multiple, areaMode, onArea, problems, focusTarget }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const patternId = useId();
  const [cursor, setCursor] = useState<Point | null>(null);
  const areaDrag = useRef<{ start: Point; now: Point } | null>(null), suppressClick = useRef(false);
  const [areaBox, setAreaBox] = useState<{ start: Point; now: Point } | null>(null);
  const points = room.outline.points;
  let boundsPoints: Point[] = points;
  try { if (points.length >= 3) boundsPoints = outlineToPolygon(room.outline); } catch { /* Keep invalid drafts repairable. */ }
  const maxX = Math.max(drawing || !points.length ? 1000 : 100, ...boundsPoints.map(p => p.x));
  const maxY = Math.max(drawing || !points.length ? 700 : 100, ...boundsPoints.map(p => p.y));
  const pan = usePanZoom(viewport, { minX: Math.min(0, ...boundsPoints.map(p => p.x)) - 100, minY: Math.min(0, ...boundsPoints.map(p => p.y)) - 100, maxX: maxX + 100, maxY: maxY + 100 });
  useEffect(() => { if (focusTarget?.roomKey === room.key) { pan.focusOn(focusTarget.point.x, focusTarget.point.y, 0.75); viewport.current?.scrollIntoView({ block: "center" }); } }, [focusTarget, room.key, pan.focusOn]);
  const toWorld = (event: { clientX: number; clientY: number }): Point => {
    const bounds = viewport.current!.getBoundingClientRect();
    return { x: (event.clientX - bounds.left - pan.view.x) / pan.view.k, y: (event.clientY - bounds.top - pan.view.y) / pan.view.k };
  };
  const screenPoint = (event: { clientX: number; clientY: number; shiftKey: boolean }) => snappedPoint(toWorld(event), points.at(-1) ?? null, grid, event.shiftKey);
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (areaDrag.current) { areaDrag.current = { ...areaDrag.current, now: toWorld(event) }; setAreaBox(areaDrag.current); return; }
    pan.pointerHandlers.onPointerMove(event); if (drawing) setCursor(screenPoint(event));
  };
  return <div className="room-canvas-wrap">
    <div ref={viewport} className="room-canvas" tabIndex={0} role="region" aria-label="Room plan" {...pan.pointerHandlers} onPointerDown={event => {
      if (tool === "Tables" && !placement && (areaMode || event.shiftKey)) { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); const start = toWorld(event); areaDrag.current = { start, now: start }; setAreaBox(areaDrag.current); }
      else pan.pointerHandlers.onPointerDown(event);
    }} onPointerUp={event => {
      if (areaDrag.current) { onArea(tablesInBox(room, areaDrag.current.start, toWorld(event))); areaDrag.current = null; setAreaBox(null); suppressClick.current = true; }
      else pan.pointerHandlers.onPointerUp(event);
    }} onPointerCancel={event => { areaDrag.current = null; setAreaBox(null); pan.pointerHandlers.onPointerCancel(event); }} onPointerMove={move} onDragOver={event => { if (event.dataTransfer.types.includes(OBJECT_DRAG_TYPE)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }} onDrop={event => { const kind = event.dataTransfer.getData(OBJECT_DRAG_TYPE); if (kind) { event.preventDefault(); onPlace(snappedPoint(toWorld(event), null, grid, false), kind); } }} onClick={event => {
      if (suppressClick.current) { suppressClick.current = false; return; }
      if (placement && !pan.wasDragged()) { onPlace(snappedPoint(toWorld(event), null, grid, false), placement); return; }
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
          {!drawing && points.length >= 3 && <path d={outlinePath(room.outline)} className={problems.some(p => p.code === "outline_invalid") ? "room-outline room-outline-invalid" : "room-outline"} />}
          {drawing && <polyline points={[...points, ...(cursor ? [cursor] : [])].map(p => `${p.x},${p.y}`).join(" ")} className="room-drawing" />}
          {points.map((p, i) => <text key={i} x={p.x + 12 / pan.view.k} y={p.y - 10 / pan.view.k} fontSize={12 / pan.view.k} className="room-ruler">{i + 1}</text>)}
          {!drawing && <ObjectLayer room={room} kind="zone" editing={tool === "Zones" && !placement} selected={object} grid={grid} zoom={pan.view.k} toWorld={toWorld} onSelect={onObject} onChange={onChange} onDragStart={() => { pan.zoomBy(1); onDragStart(); }} />}
          {!drawing && <ObjectLayer room={room} kind="fixture" editing={tool === "Fixed" && !placement} selected={object} grid={grid} zoom={pan.view.k} toWorld={toWorld} onSelect={onObject} onChange={onChange} onDragStart={() => { pan.zoomBy(1); onDragStart(); }} />}
          <TableLayer room={room} editing={tool === "Tables" && !placement} selected={object} keys={tableKeys} multiple={multiple} chair={chair} grid={grid} zoom={pan.view.k} toWorld={toWorld} onSelect={onTableSelect} onChange={onChange} onDragStart={() => { pan.zoomBy(1); onDragStart(); }} onError={onError} invalidKeys={problems.filter(p => p.level === "error").flatMap(p => p.table_keys)} />
          {areaBox && <rect x={Math.min(areaBox.start.x, areaBox.now.x)} y={Math.min(areaBox.start.y, areaBox.now.y)} width={Math.abs(areaBox.now.x - areaBox.start.x)} height={Math.abs(areaBox.now.y - areaBox.start.y)} className="room-selection-box" />}
          {!drawing && points.length >= 3 && tool === "Shape" && <ShapeHandles room={room} zoom={pan.view.k} grid={grid} selection={selection} toWorld={toWorld} onSelect={onSelect} onChange={onChange} onDragStart={() => { pan.zoomBy(1); onDragStart(); }} onError={onError} />}
          {!drawing && tool === "Walls" && points.map((_, i) => <path key={`select-${i}`} d={sidePath(room.outline, i)} className="room-wall-hit" strokeWidth={44 / pan.view.k} onPointerDown={event => { event.stopPropagation(); onSelect({ kind: "side", index: i }); }} />)}
          {!drawing && <WallLayer room={room} zoom={pan.view.k} editing={tool === "Walls"} selected={opening} toWorld={toWorld} onSelect={onOpening} onChange={onChange} onDragStart={() => { pan.zoomBy(1); onDragStart(); }} onError={onError} />}
        </g>
      </svg>
    </div>
    {tool === "North" && !drawing && <NorthDial north={room.north_deg} onCommit={north_deg => onChange({ ...room, north_deg })} />}
    <div className="room-zoom"><Button variant="secondary" aria-label="Zoom out" onClick={() => pan.zoomBy(0.8)}>−</Button><Button variant="secondary" onClick={pan.fit}>Fit room</Button><Button variant="secondary" aria-label="Zoom in" onClick={() => pan.zoomBy(1.25)}>+</Button><span>{Math.round(pan.view.k * 100)}%</span></div>
  </div>;
}
