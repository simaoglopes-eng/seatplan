// The words around the diner's floor map: the suggestion card, the conflict
// message with alternatives, and a plain list of tables (the same choices as
// the map, for people who prefer a list or cannot use the map).
import type { DinerMap, DinerTable } from "../../api/restaurant";
import { Badge, Button } from "../../design/components";
import { tableFeatures, unavailableReason } from "./tableView";

interface SuggestionProps {
  map: DinerMap;
  busy: boolean;
  onTake: (tableId: number) => void;
  onChooseForMe: () => void;
}

export function SuggestionCard({ map, busy, onTake, onChooseForMe }: SuggestionProps) {
  const rec = map.recommended;
  const table = rec ? map.tables.find((t) => t.id === rec.table_ids[0]) : undefined;
  // A big party may get two or three joined tables. A hold names one table, so
  // for a combination we ask the optimiser, which picks this same best choice.
  const labels = rec ? rec.table_ids.map((id) => map.tables.find((t) => t.id === id)?.label ?? String(id)).join(" + ") : "";
  const combined = rec !== null && rec.table_ids.length > 1;
  return (
    <div className="rb-card rb-suggestion">
      {rec && table ? (
        <>
          <p className="rb-eyebrow">Our suggestion</p>
          <h3 className="rb-suggestion-title">{combined ? `Tables ${labels}` : `Table ${table.label}`}</h3>
          <ul className="rb-reasons">
            {rec.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <div className="rb-actions">
            <Button busy={busy} onClick={() => (combined ? onChooseForMe() : onTake(table.id))}>
              {combined ? `Hold tables ${labels}` : `Hold table ${table.label}`}
            </Button>
          </div>
        </>
      ) : (
        <p>Tap a free table on the map, or let us pick the best one for you.</p>
      )}
      <Button variant="secondary" busy={busy} onClick={onChooseForMe}>
        Choose for me
      </Button>
    </div>
  );
}

interface ConflictProps {
  message: string;
  options: DinerTable[];
  busy: boolean;
  onTake: (tableId: number) => void;
}

export function ConflictNotice({ message, options, busy, onTake }: ConflictProps) {
  return (
    <div className="rb-notice rb-notice-warning" role="alert">
      <p>
        <strong>Sorry, that table is gone.</strong> {message}
      </p>
      {options.length > 0 ? (
        <>
          <p>These are still free and fit your party:</p>
          <div className="rb-alternatives">
            {options.map((table) => (
              <Button key={table.id} variant="secondary" busy={busy} onClick={() => onTake(table.id)}>
                Hold table {table.label}
              </Button>
            ))}
          </div>
        </>
      ) : (
        <p>No other table fits your party at this time. Please go back and pick another time.</p>
      )}
    </div>
  );
}

interface TableListProps {
  tables: DinerTable[];
  map: DinerMap;
  heldId: number | null;
  /** The table the card above shows, marked in the list so plan, card and list agree. */
  focusId?: number | null;
  busy: boolean;
  onTake: (tableId: number) => void;
}

/** Every table that suits the party, as a list. Tables that do not suit are counted, not listed, to keep it short. */
export function TableList({ tables, map, heldId, focusId = null, busy, onTake }: TableListProps) {
  const suitable = tables.filter((t) => t.fits_party);
  const hidden = tables.length - suitable.length;
  const recommended = new Set(map.recommended?.table_ids ?? []);
  return (
    <div className="rb-table-list">
      <h3 className="rb-service-title">Tables that suit your party</h3>
      <ul>
        {suitable.map((table) => (
          <li key={table.id} className={`rb-table-row${table.id === focusId ? " is-focus" : ""}`} aria-current={table.id === focusId ? "true" : undefined}>
            <div>
              <strong>Table {table.label}</strong> {recommended.has(table.id) && <Badge tone="warning">Suggested</Badge>}
              <div className="rb-badges">
                {tableFeatures(table, map.zones).map((feature) => (
                  <Badge key={feature} tone={feature === "Accessible" ? "info" : "neutral"}>
                    {feature}
                  </Badge>
                ))}
              </div>
              {table.ambience && table.ambience.phrases.length > 0 && <p className="rb-muted rb-table-light">{table.ambience.phrases.join(" · ")}</p>}
            </div>
            <TableRowAction table={table} heldId={heldId} busy={busy} onTake={onTake} />
          </li>
        ))}
      </ul>
      {hidden > 0 && <p className="rb-muted">{hidden} other tables are too small, too big or missing something you need.</p>}
    </div>
  );
}

function TableRowAction({ table, heldId, busy, onTake }: { table: DinerTable; heldId: number | null; busy: boolean; onTake: (id: number) => void }) {
  if (table.id === heldId && table.state !== "taken") return <Badge tone="success">Held for you</Badge>;
  const reason = unavailableReason(table);
  if (reason) return <span className="rb-muted">{reason}</span>;
  return (
    <Button variant="secondary" busy={busy} onClick={() => onTake(table.id)} aria-label={`Hold table ${table.label}`}>
      Hold
    </Button>
  );
}
