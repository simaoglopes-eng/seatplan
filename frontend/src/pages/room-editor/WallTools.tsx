import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button, Checkbox, Field, Select } from "../../design/components";
import { sideLength } from "./geometry";
import type { Room, RoomOpening } from "./roomModel";
import { RoomNumberField } from "./ShapeTools";
import type { ShapeSelection } from "./ShapeTools";
import { addOpening, openingBearing, updateOpening, VIEW_TAGS } from "./wallModel";

interface Props { room: Room; selection: ShapeSelection; selected: string | null; onSelect: (key: string | null) => void; onSide: (selection: ShapeSelection) => void; onChange: (room: Room) => void; onError: (message: string) => void }
export function WallTools({ room, selection, selected, onSelect, onSide, onChange, onError }: Props) {
  const side = selection?.kind === "side" && selection.index < room.outline.points.length ? selection.index : 0;
  const opening = room.openings.find(o => o.key === selected);
  const apply = (change: () => Room) => { try { onChange(change()); } catch (caught) { onError(caught instanceof Error ? caught.message : "Check the opening."); } };
  return <div className="room-form">
    <Select label="Wall for opening" value={String(side)} options={room.outline.points.map((_, i) => ({ value: String(i), label: `Wall ${i + 1}` }))} onChange={e => onSide({ kind: "side", index: Number(e.target.value) })} />
    <h3>Add on this wall</h3>
    {(["window", "door", "glass_wall"] as const).map(kind => <Button key={kind} variant="secondary" onClick={() => apply(() => { const next = addOpening(room, side, kind); onSelect(next.openings.at(-1)!.key); return next; })}>{kind === "window" ? "Add window" : kind === "door" ? "Add door" : "Add glass wall"}</Button>)}
    <Select label="Selected opening" value={opening?.key ?? ""} options={[{ value: "", label: "Choose an opening" }, ...room.openings.map((o, i) => ({ value: o.key, label: `${o.kind === "glass_wall" ? "Glass wall" : o.kind === "door" ? "Door" : "Window"} ${i + 1} · Wall ${o.side + 1}` }))]} onChange={e => onSelect(e.target.value || null)} />
    {opening && <OpeningFields key={opening.key} room={room} opening={opening} onUpdate={change => apply(() => updateOpening(room, opening.key, change))} onNumberUpdate={change => { try { onChange(updateOpening(room, opening.key, change)); } catch (caught) { onError(caught instanceof Error ? caught.message : "Check the opening."); throw caught; } }} />}
    {opening && <Button variant="danger" onClick={() => { onChange({ ...room, openings: room.openings.filter(o => o.key !== opening.key) }); onSelect(null); }}>Remove opening</Button>}
  </div>;
}

function OpeningFields({ room, opening: o, onUpdate, onNumberUpdate }: { room: Room; opening: RoomOpening; onUpdate: (change: Partial<RoomOpening>) => void; onNumberUpdate: (change: Partial<RoomOpening>) => void }) {
  const { venueId = "" } = useParams();
  const direction = openingBearing(room, o);
  const names = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  return <>
    <h3>{o.kind === "door" ? "Door" : o.kind === "glass_wall" ? "Glass wall" : "Window"} properties</h3>
    {o.kind !== "glass_wall" && <>
      <RoomNumberField label="Opening offset (cm)" value={o.offset} min={0} max={sideLength(room.outline, o.side) - o.width} onCommit={offset => onNumberUpdate({ offset })} />
      <RoomNumberField label="Opening width (cm)" value={o.width} min={40} max={sideLength(room.outline, o.side) - o.offset} onCommit={width => onNumberUpdate({ width })} />
    </>}
    {o.kind === "glass_wall" && <p>Width: {Math.round(o.width)} cm · Entire wall</p>}
    {o.kind === "door" ? <Checkbox label="Main entrance" checked={o.is_main_entrance} onChange={e => onUpdate({ is_main_entrance: e.target.checked })} /> : <>
      <RoomNumberField label="Window top height (cm)" value={o.top_height} min={100} max={500} onCommit={top_height => onNumberUpdate({ top_height })} />
      <p>{direction === null ? "Set north first" : `Faces ${names[Math.round(direction / 45) % 8]} (${Math.round(direction) % 360}°)`}</p>
      <Field label="View" value={o.view_text} maxLength={80} onChange={e => onUpdate({ view_text: e.target.value })} />
      <fieldset className="room-view-tags"><legend>View tags (up to 3)</legend>{VIEW_TAGS.map(tag => <Checkbox key={tag} label={tag} checked={o.view_tags.includes(tag)} disabled={o.view_tags.length >= 3 && !o.view_tags.includes(tag)} onChange={e => onUpdate({ view_tags: e.target.checked ? [...o.view_tags, tag] : o.view_tags.filter(t => t !== tag) })} />)}</fieldset>
      <Field label="View at night" value={o.night_view_text} maxLength={80} onChange={e => onUpdate({ night_view_text: e.target.value })} />
      {o.id === null ? <p>Save the rooms before adding a view photo.</p> : <Link to={`/owner/${encodeURIComponent(venueId)}/photos?opening=o${o.id}`}>Edit view photo</Link>}
      <Select label="Sun" value={o.sun_rule} options={[{ value: "auto", label: "Work it out for me" }, { value: "never", label: "Never gets direct sun" }, { value: "between", label: "Only between" }]} onChange={e => onUpdate({ sun_rule: e.target.value as RoomOpening["sun_rule"], ...(e.target.value === "between" ? { sun_from: o.sun_from ?? "12:00", sun_until: o.sun_until ?? "16:00" } : { sun_from: null, sun_until: null }) })} />
      {o.sun_rule === "between" && <SunTimes opening={o} onUpdate={onUpdate} />}
    </>}
  </>;
}

function SunTimes({ opening, onUpdate }: { opening: RoomOpening; onUpdate: (change: Partial<RoomOpening>) => void }) {
  const [from, setFrom] = useState(opening.sun_from ?? ""), [until, setUntil] = useState(opening.sun_until ?? "");
  useEffect(() => { setFrom(opening.sun_from ?? ""); setUntil(opening.sun_until ?? ""); }, [opening.sun_from, opening.sun_until]);
  return <><Field label="Sun from" type="time" value={from} onChange={e => setFrom(e.target.value)} onBlur={() => onUpdate({ sun_from: from, sun_until: until })} /><Field label="Sun until" type="time" value={until} onChange={e => setUntil(e.target.value)} onBlur={() => onUpdate({ sun_from: from, sun_until: until })} /></>;
}
