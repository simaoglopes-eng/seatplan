import { Button, Select } from "../../design/components";
import { sideLength } from "./geometry";
import { insertCorner, moveCorner, removeCorner, setSideCurve, setSideLength } from "./shapeEditing";
import type { Room } from "./roomModel";
import { RoomNumberField } from "./ShapeTools";
import type { ShapeSelection } from "./ShapeTools";

interface Props { room: Room; selection: ShapeSelection; onSelect: (selection: ShapeSelection) => void; onChange: (room: Room) => void; onError: (message: string) => void }

export function RoomProperties({ room, selection, onSelect, onChange, onError }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [selection?.kind, selection?.index]);
  const points = room.outline.points;
  const apply = (change: () => Room) => { try { onChange(change()); } catch (caught) { onError(caught instanceof Error ? caught.message : "Check the wall dimensions."); } };
  const index = selection?.index ?? -1, point = points[index];
  const options = [{ value: "", label: "Choose…" }, ...points.map((_, i) => ({ value: String(i), label: String(i + 1) }))];
  return <div className="room-form">
    <Select label="Selected wall" value={selection?.kind === "side" && point ? String(index) : ""} options={options} onChange={e => onSelect(e.target.value === "" ? null : { kind: "side", index: Number(e.target.value) })} />
    <Select label="Selected corner" value={selection?.kind === "corner" && point ? String(index) : ""} options={options} onChange={e => onSelect(e.target.value === "" ? null : { kind: "corner", index: Number(e.target.value) })} />
    {point && selection?.kind === "side" && <>
      <h3 ref={heading} tabIndex={-1}>Wall {index + 1}</h3>
      <RoomNumberField label="Wall length (m)" value={sideLength(room.outline, index) / 100} decimals={2} min={0.01} onCommit={length => onChange(setSideLength(room, index, length * 100))} />
      <RoomNumberField label="Bulge (cm)" value={point.curve} onCommit={curve => onChange(setSideCurve(room, index, curve))} />
      <Button variant="secondary" onClick={() => apply(() => setSideCurve(room, index, 0))}>Make straight</Button>
      <Button variant="secondary" disabled={points.length >= 60} onClick={() => { apply(() => insertCorner(room, index)); onSelect({ kind: "corner", index: index + 1 }); }}>Add corner at midpoint</Button>
    </>}
    {point && selection?.kind === "corner" && <>
      <h3 ref={heading} tabIndex={-1}>Corner {index + 1}</h3>
      <RoomNumberField label="Corner x (cm)" value={point.x} onCommit={x => onChange(moveCorner(room, index, { x, y: point.y }))} />
      <RoomNumberField label="Corner y (cm)" value={point.y} onCommit={y => onChange(moveCorner(room, index, { x: point.x, y }))} />
      <Button variant="danger" disabled={points.length <= 3} onClick={() => { apply(() => removeCorner(room, index)); onSelect(null); }}>Remove corner</Button>
    </>}
  </div>;
}
import { useEffect, useRef } from "react";
