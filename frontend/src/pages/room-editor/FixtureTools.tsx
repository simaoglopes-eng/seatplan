import { Button, Select } from "../../design/components";
import { ObjectFields, ObjectTextField, OBJECT_DRAG_TYPE } from "./ObjectFields";
import { editFixture, FIXTURE_KINDS, FIXTURE_NAMES } from "./roomObjects";
import type { Room, RoomFixture } from "./roomModel";

interface Props { room: Room; selected: string | null; placement: string | null; onSelect: (key: string | null) => void; onArm: (kind: string) => void; onCentre: () => void; onChange: (room: Room) => void; onError: (message: string) => void }
export function FixtureTools({ room, selected, placement, onSelect, onArm, onCentre, onChange, onError }: Props) {
  const item = room.fixtures.find(f => f.key === selected);
  const update = (patch: Partial<RoomFixture>) => { if (item) onChange(editFixture(room, item.key, patch)); };
  const safe = (patch: Partial<RoomFixture>) => { try { update(patch); } catch (caught) { onError(caught instanceof Error ? caught.message : "Check the fixed element."); } };
  return <div className="room-form">
    <p>Choose an element, then tap the plan. You can also drag it from this palette.</p>
    <div className="room-object-palette">{FIXTURE_KINDS.map(kind => <button type="button" draggable key={kind} aria-pressed={placement === `fixture:${kind}`} onDragStart={event => { event.dataTransfer.setData(OBJECT_DRAG_TYPE, `fixture:${kind}`); event.dataTransfer.effectAllowed = "copy"; }} onClick={() => onArm(`fixture:${kind}`)}>Place {FIXTURE_NAMES[kind]}</button>)}</div>
    {placement?.startsWith("fixture:") && <Button variant="secondary" onClick={onCentre}>Place selected in room</Button>}
    <p>Awning shade applies to outdoor rooms.</p>
    <Select label="Selected fixed element" value={item?.key ?? ""} options={[{ value: "", label: "Choose an element" }, ...room.fixtures.map((f, i) => ({ value: f.key, label: f.label || `${FIXTURE_NAMES[f.kind]} ${i + 1}` }))]} onChange={e => onSelect(e.target.value || null)} />
    {item && <div key={item.key} className="room-form">
      <ObjectTextField label="Fixture label" value={item.label} maxLength={40} onCommit={label => update({ label })} />
      <Select label="Fixed element shape" value={item.shape} options={[{ value: "rect", label: "Rectangle" }, { value: "circle", label: "Circle" }]} onChange={e => safe({ shape: e.target.value as RoomFixture["shape"] })} />
      <ObjectFields item={item} onChange={update} />
      <Button variant="danger" onClick={() => { onChange({ ...room, fixtures: room.fixtures.filter(f => f.key !== item.key) }); onSelect(null); }}>Remove fixed element</Button>
    </div>}
  </div>;
}
