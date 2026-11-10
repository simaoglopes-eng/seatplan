// The side panel: edit whatever is selected, or pick an item from the list.
// Every change goes through `onChange`, which records an undo step.
import { useEffect, useRef } from "react";
import type { ChangeEvent, RefObject } from "react";
import type { ReservedTag, ZoneKind } from "../../api/types";
import { Button, Checkbox, Field, Select } from "../../design/components";
import type { SelectOption } from "../../design/components";
import { MAX_SEATS, findSeat, findTable, reshapeTable, replaceSeat, replaceTable, replaceZone, setSeatCount } from "./layoutModel";
import type { LayoutTable, LayoutZone, Selection, VenueLayout } from "./layoutModel";

interface PanelProps {
  layout: VenueLayout;
  selection: Selection;
  onChange: (next: VenueLayout) => void;
  onSelect: (selection: Selection) => void;
  onDelete: () => void;
}

const ZONE_KINDS: ZoneKind[] = ["general", "window", "terrace", "bar", "quiet", "vip", "accessible", "stage"];
const ROTATIONS = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165];
const RESERVED: SelectOption[] = [
  { value: "", label: "Not reserved" },
  { value: "vip", label: "VIP" },
  { value: "family", label: "Family" },
  { value: "speaker", label: "Speaker" },
];

/** Builds a change handler that passes on whole numbers and ignores half-typed values such as "". */
function onInt(apply: (value: number) => void) {
  return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>): void => {
    const value = Number.parseInt(event.target.value, 10);
    if (!Number.isNaN(value)) apply(value);
  };
}

/**
 * Choosing an item swaps the whole panel, so the button that had focus
 * disappears and focus falls to <body>, outside the editor, where the arrow
 * keys no longer reach it. The new panel's heading catches focus in that case
 * (and a screen reader then says which item is selected). When focus is still
 * somewhere useful, such as the canvas, it is left alone.
 */
function useCatchFocus(ref: RefObject<HTMLHeadingElement>): void {
  useEffect(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) ref.current?.focus();
  }, [ref]);
}

export function PropertiesPanel(props: PanelProps) {
  const { layout, selection } = props;
  if (selection?.kind === "table") {
    const table = findTable(layout, selection.key);
    if (table) return <TablePanel {...props} table={table} />;
  }
  if (selection?.kind === "zone") {
    const zone = layout.zones.find((z) => z.key === selection.key);
    if (zone) return <ZonePanel {...props} zone={zone} />;
  }
  if (selection?.kind === "seat") {
    const found = findSeat(layout, selection.key);
    if (found) return <SeatPanel {...props} seatKey={selection.key} />;
  }
  return <ItemList {...props} />;
}

function TablePanel({ layout, table, onChange, onSelect, onDelete }: PanelProps & { table: LayoutTable }) {
  const update = (change: (t: LayoutTable) => LayoutTable) => onChange(replaceTable(layout, table.key, change));
  const zoneOptions = [{ value: "", label: "No zone" }, ...layout.zones.map((z) => ({ value: z.key, label: z.name }))];
  const noun = table.shape === "row" ? "Row" : "Table";
  return (
    <section className="panel" aria-labelledby="panel-title">
      <PanelHeader title={`${noun} ${table.label}`} onBack={() => onSelect(null)} />
      <Field label="Label" value={table.label} maxLength={12} onChange={(e) => update((t) => ({ ...t, label: e.target.value }))} />
      <Field label="Seats" type="number" min={1} max={MAX_SEATS} value={table.seats.length}
        onChange={onInt((n) => update((t) => setSeatCount(t, n)))} />
      <Select label="Rotation" value={String(table.rotation)} options={ROTATIONS.map((r) => ({ value: String(r), label: `${r} degrees` }))}
        onChange={onInt((n) => update((t) => reshapeTable(t, { rotation: n })))} />
      <Select label="Zone" value={table.zone_key ?? ""} options={zoneOptions}
        onChange={(e) => update((t) => ({ ...t, zone_key: e.target.value || null }))} />
      {table.shape !== "row" && <PartyFields table={table} update={update} />}
      <Checkbox label="Accessible table" hint="Step-free access and room for a wheelchair" checked={table.is_accessible}
        onChange={(e) => update((t) => ({ ...t, is_accessible: e.target.checked }))} />
      <Button variant="danger" onClick={onDelete}>Delete {noun.toLowerCase()}</Button>
      <p className="panel-tip">Tip: click a chair on the canvas to mark it accessible, blocked or reserved.</p>
    </section>
  );
}

/** Restaurant-only settings: who may sit at this table and whether it can join others. */
function PartyFields({ table, update }: { table: LayoutTable; update: (change: (t: LayoutTable) => LayoutTable) => void }) {
  return (
    <fieldset className="panel-group">
      <legend>Restaurant bookings</legend>
      <div className="panel-row">
        <Field label="Smallest party" type="number" min={1} max={table.max_party} value={table.min_party}
          onChange={onInt((n) => update((t) => ({ ...t, min_party: Math.max(1, Math.min(n, t.max_party)) })))} />
        <Field label="Largest party" type="number" min={table.min_party} max={MAX_SEATS} value={table.max_party}
          onChange={onInt((n) => update((t) => ({ ...t, max_party: Math.max(t.min_party, Math.min(n, MAX_SEATS)) })))} />
      </div>
      <Checkbox label="High chairs fit" checked={table.high_chair_ok} onChange={(e) => update((t) => ({ ...t, high_chair_ok: e.target.checked }))} />
      <Field label="Combine group" hint="Tables with the same group name can be pushed together." value={table.combine_group ?? ""} maxLength={20}
        onChange={(e) => update((t) => ({ ...t, combine_group: e.target.value || null }))} />
    </fieldset>
  );
}

function SeatPanel({ layout, seatKey, onChange, onSelect }: PanelProps & { seatKey: string }) {
  const found = findSeat(layout, seatKey);
  if (!found) return null;
  const { table, seat } = found;
  const update = (patch: Parameters<typeof replaceSeat>[2]) => onChange(replaceSeat(layout, seatKey, patch));
  return (
    <section className="panel" aria-labelledby="panel-title">
      <PanelHeader title={`Seat ${seat.label}`} subtitle={`${table.shape === "row" ? "Row" : "Table"} ${table.label}`}
        onBack={() => onSelect({ kind: "table", key: table.key })} backLabel="Back to table" />
      <Field label="Seat label" value={seat.label} maxLength={8} onChange={(e) => update({ label: e.target.value })} />
      <Checkbox label="Accessible seat" hint="Shown with the wheelchair badge" checked={seat.is_accessible} onChange={(e) => update({ is_accessible: e.target.checked })} />
      <Checkbox label="Blocked" hint="Nobody can sit here, for example behind a pillar" checked={seat.is_blocked} onChange={(e) => update({ is_blocked: e.target.checked })} />
      <Select label="Reserved for" value={seat.reserved_tag ?? ""} options={RESERVED}
        onChange={(e) => update({ reserved_tag: (e.target.value || null) as ReservedTag | null })} />
    </section>
  );
}

function ZonePanel({ layout, zone, onChange, onSelect, onDelete }: PanelProps & { zone: LayoutZone }) {
  const update = (patch: Partial<LayoutZone>) => onChange(replaceZone(layout, zone.key, patch));
  return (
    <section className="panel" aria-labelledby="panel-title">
      <PanelHeader title={zone.name || "Zone"} onBack={() => onSelect(null)} />
      <Field label="Name" value={zone.name} maxLength={40} onChange={(e) => update({ name: e.target.value })} />
      <Select label="Kind" value={zone.kind} options={ZONE_KINDS.map((k) => ({ value: k, label: k.charAt(0).toUpperCase() + k.slice(1) }))}
        onChange={(e) => update({ kind: e.target.value as ZoneKind })} />
      <div className="panel-row">
        <Field label="Width" type="number" min={40} value={zone.w} onChange={onInt((n) => update({ w: Math.max(40, n) }))} />
        <Field label="Height" type="number" min={40} value={zone.h} onChange={onInt((n) => update({ h: Math.max(40, n) }))} />
      </div>
      <Button variant="danger" onClick={onDelete}>Delete zone</Button>
    </section>
  );
}

function PanelHeader({ title, subtitle, onBack, backLabel = "All items" }: { title: string; subtitle?: string; onBack: () => void; backLabel?: string }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useCatchFocus(headingRef);
  return (
    <div className="panel-header">
      <Button variant="ghost" onClick={onBack} className="panel-back">← {backLabel}</Button>
      <h2 id="panel-title" className="panel-title" ref={headingRef} tabIndex={-1}>{title}</h2>
      {subtitle && <p className="panel-subtitle">{subtitle}</p>}
    </div>
  );
}

/** Keyboard and screen-reader route into the canvas: every item as a button. */
function ItemList({ layout, onSelect }: PanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useCatchFocus(headingRef); // "All items" also unmounts the focused back button
  const empty = layout.tables.length === 0 && layout.zones.length === 0;
  return (
    <section className="panel" aria-labelledby="panel-title">
      <h2 id="panel-title" className="panel-title" ref={headingRef} tabIndex={-1}>Items on the floor</h2>
      {empty && <p className="panel-tip">The floor is empty. Add a table, a row or a zone with the toolbar.</p>}
      <ul className="panel-list">
        {layout.zones.map((z) => (
          <li key={z.key}><button type="button" className="panel-item" onClick={() => onSelect({ kind: "zone", key: z.key })}>Zone: {z.name}</button></li>
        ))}
        {layout.tables.map((t) => (
          <li key={t.key}>
            <button type="button" className="panel-item" onClick={() => onSelect({ kind: "table", key: t.key })}>
              {t.shape === "row" ? "Row" : "Table"} {t.label} <span className="panel-item-meta">{t.seats.length} seats</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="panel-tip">Select an item, then use the arrow keys to move it (hold Shift for bigger steps). Delete removes it. Ctrl or Cmd + Z undoes.</p>
    </section>
  );
}
