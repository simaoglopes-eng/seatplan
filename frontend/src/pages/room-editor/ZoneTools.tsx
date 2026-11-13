import { Button, Select } from "../../design/components";
import type { ZoneKind } from "../../api/types";
import { ObjectFields, ObjectTextField, OBJECT_DRAG_TYPE } from "./ObjectFields";
import { editZone, removeZone, ZONE_KINDS } from "./roomObjects";
import type { Room, RoomZone } from "./roomModel";

interface Props { room: Room; selected: string | null; placement: string | null; onSelect: (key: string | null) => void; onArm: (kind: string) => void; onCentre: () => void; onChange: (room: Room) => void }
export function ZoneTools({ room, selected, placement, onSelect, onArm, onCentre, onChange }: Props) {
  const zone = room.zones.find(z => z.key === selected);
  const update = (patch: Partial<RoomZone>) => { if (zone) onChange(editZone(room, zone.key, patch)); };
  return <div className="room-form">
    <p>Choose a zone type, then tap the plan, drag it onto the plan, or use the placement button.</p>
    <div className="room-object-palette">{ZONE_KINDS.map(kind => <button type="button" draggable key={kind} aria-pressed={placement === `zone:${kind}`} onDragStart={event => { event.dataTransfer.setData(OBJECT_DRAG_TYPE, `zone:${kind}`); event.dataTransfer.effectAllowed = "copy"; }} onClick={() => onArm(`zone:${kind}`)}>Place {kind} zone</button>)}</div>
    {placement?.startsWith("zone:") && <Button variant="secondary" onClick={onCentre}>Place selected in room</Button>}
    <Select label="Selected zone" value={zone?.key ?? ""} options={[{ value: "", label: "Choose a zone" }, ...room.zones.map(z => ({ value: z.key, label: z.name }))]} onChange={e => onSelect(e.target.value || null)} />
    {zone && <div key={zone.key} className="room-form">
      <ObjectTextField label="Zone name" value={zone.name} maxLength={80} onCommit={name => update({ name })} />
      <Select label="Zone type" value={zone.kind} options={[...ZONE_KINDS, ...(zone.kind === "stage" ? ["stage" as const] : [])].map(value => ({ value, label: value }))} onChange={e => update({ kind: e.target.value as ZoneKind })} />
      <ObjectFields item={zone} onChange={update} />
      <Button variant="danger" onClick={() => { onChange(removeZone(room, zone.key)); onSelect(null); }}>Remove zone</Button>
    </div>}
  </div>;
}
