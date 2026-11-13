import { Button, Checkbox } from "../../design/components";
import { alignTables, deletionProblem, deleteTables, distributeTables, duplicateTables, moveTables, rotateTables } from "./selection";
import type { AlignEdge } from "./selection";
import { editTable } from "./tableModel";
import type { Room } from "./roomModel";

interface Props { room: Room; keys: string[]; multiple: boolean; area: boolean; onMultiple: (value: boolean) => void; onArea: (value: boolean) => void; onKeys: (keys: string[]) => void; onChange: (room: Room) => void; onError: (message: string) => void }
export function SelectionTools({ room, keys, multiple, area, onMultiple, onArea, onKeys, onChange, onError }: Props) {
  const selected = room.tables.filter(t => keys.includes(t.key)), count = selected.length;
  const reason = selected.map(deletionProblem).find(Boolean);
  const apply = (fn: () => Room) => { try { onChange(fn()); } catch (caught) { onError(caught instanceof Error ? caught.message : "Check the selected tables."); } };
  return <fieldset className="room-form room-selection-tools"><legend>Selection controls</legend>
    <p role="status">{count} tables selected{multiple ? ". Tap tables to add or remove them." : ""}</p>
    <Button variant="secondary" aria-pressed={multiple} onClick={() => onMultiple(!multiple)}>Multiple selection</Button>
    <Button variant="secondary" aria-pressed={area} onClick={() => onArea(!area)}>Select area</Button>
    <Button variant="secondary" onClick={() => onKeys(room.tables.map(t => t.key))}>Select all tables</Button>
    <Button variant="ghost" disabled={!count} onClick={() => { onKeys([]); onMultiple(false); onArea(false); }}>Clear table selection</Button>
    <details><summary>Choose tables from a list</summary><div className="room-form">{room.tables.map(t => <Checkbox key={t.key} label={`Select ${t.label}`} checked={keys.includes(t.key)} onChange={e => onKeys(e.target.checked ? [...keys, t.key] : keys.filter(k => k !== t.key))} />)}</div></details>
    <div className="room-selection-actions">{(["left", "centre", "right", "top", "middle", "bottom"] as AlignEdge[]).map(edge => <Button key={edge} variant="secondary" disabled={count < 2} onClick={() => apply(() => alignTables(room, keys, edge))}>Align {edge}</Button>)}</div>
    <Button variant="secondary" disabled={count < 3} onClick={() => apply(() => distributeTables(room, keys, "horizontal"))}>Distribute horizontally</Button>
    <Button variant="secondary" disabled={count < 3} onClick={() => apply(() => distributeTables(room, keys, "vertical"))}>Distribute vertically</Button>
    <Button variant="secondary" disabled={!count} onClick={() => apply(() => { const next = duplicateTables(room, keys); onKeys(next.tables.filter(t => !room.tables.some(old => old.key === t.key)).map(t => t.key)); return next; })}>Duplicate selected tables</Button>
    <Button variant="secondary" disabled={!count} onClick={() => apply(() => rotateTables(room, keys))}>Rotate selected +15°</Button>
    <div className="room-selection-actions">{[{ name: "left", dx: -1, dy: 0 }, { name: "right", dx: 1, dy: 0 }, { name: "up", dx: 0, dy: -1 }, { name: "down", dx: 0, dy: 1 }].map(({ name, dx, dy }) => <Button key={name} variant="secondary" disabled={!count} onClick={() => apply(() => moveTables(room, keys, dx, dy))}>Move {name} 1 cm</Button>)}</div>
    {reason && <><p>{reason}</p><Button variant="secondary" onClick={() => apply(() => selected.reduce((next, table) => editTable(next, table.key, { is_active: false }), room))}>Make selection unavailable</Button></>}
    <Button variant="danger" disabled={!count || Boolean(reason)} onClick={() => apply(() => { const next = deleteTables(room, keys); onKeys([]); return next; })}>Delete selected tables</Button>
  </fieldset>;
}
