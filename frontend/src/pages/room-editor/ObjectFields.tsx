import { useEffect, useState } from "react";
import { Field } from "../../design/components";
import type { Box } from "./geometry";
import { RoomNumberField } from "./ShapeTools";

export function ObjectFields({ item, onChange }: { item: { x: number; y: number; w: number; h: number; rotation?: number }; onChange: (patch: Partial<Box>) => void }) {
  return <>
    <RoomNumberField label="Object x (cm)" value={item.x} onCommit={x => onChange({ x })} />
    <RoomNumberField label="Object y (cm)" value={item.y} onCommit={y => onChange({ y })} />
    <RoomNumberField label="Object width (cm)" value={item.w} min={1} max={10000} onCommit={w => onChange({ w })} />
    <RoomNumberField label="Object height (cm)" value={item.h} min={1} max={10000} onCommit={h => onChange({ h })} />
    {item.rotation !== undefined && <RoomNumberField label="Object rotation (degrees)" value={item.rotation} onCommit={rotation => onChange({ rotation })} />}
  </>;
}

export function ObjectTextField({ label, value, maxLength, onCommit }: { label: string; value: string; maxLength: number; onCommit: (value: string) => void }) {
  const [text, setText] = useState(value), [error, setError] = useState("");
  useEffect(() => { setText(value); setError(""); }, [value]);
  return <Field label={label} value={text} maxLength={maxLength} error={error || undefined} onChange={event => { setText(event.target.value); setError(""); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} onBlur={() => {
    if (text === value) return;
    try { onCommit(text); } catch (caught) { setError(caught instanceof Error ? caught.message : "Check this name."); }
  }} />;
}

export const OBJECT_DRAG_TYPE = "application/x-seatplan-room-object";
