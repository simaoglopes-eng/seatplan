// The words around the diner's floor map: the suggestion card, the conflict
// message with alternatives, and a plain list of tables (the same choices as
// the map, for people who prefer a list or cannot use the map).
import type { DinerMap, DinerTable } from "../../api/restaurant";
import { Badge, Button } from "../../design/components";
import { lightWords } from "./ambienceView";
import { partyRange, tableFeatures, unavailableReason } from "./tableView";

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

interface AmbienceCardProps {
  table: DinerTable;
  heldId: number | null;
  busy: boolean;
  /** The diner chose this table on the map: show the card even when no ambience is known. */
  chosen?: boolean;
  onTake: (tableId: number) => void;
}

/**
 * What one table is like for the stay: the light, the view with its photo, what
 * is near, and a button to hold it. It describes the table under the pointer or
 * keyboard cursor, else the held one, else our suggestion. Without ambience it
 * is only drawn for a table the diner chose; it never claims anything then.
 */
export function AmbienceCard({ table, heldId, busy, chosen = false, onTake }: AmbienceCardProps) {
  const ambience = table.ambience;
  // Without a location there is no ambience to tell, so the card only appears for a table the diner chose: it still lets them hold it.
  if (!ambience && !chosen) return null;
  const reason = unavailableReason(table);
  return (
    <section className="rb-card rb-ambience" aria-label={`Table ${table.label}, ${partyRange(table)}`}>
      {ambience && <p className="rb-eyebrow">{lightWords(ambience.light)}</p>}
      <h3 className="rb-suggestion-title">
        Table {table.label} <span className="rb-muted">· {partyRange(table)}</span>
      </h3>
      {ambience && ambience.phrases.length > 0 && (
        <ul className="rb-reasons">
          {ambience.phrases.map((phrase) => (
            <li key={phrase}>{phrase}</li>
          ))}
        </ul>
      )}
      {ambience?.view?.photo_url && <img className="rb-view-photo" src={ambience.view.photo_url} alt={ambience.view.text || "The view from this table"} loading="lazy" />}
      {table.id === heldId && table.state !== "taken" ? (
        <Badge tone="success">Held for you</Badge>
      ) : reason ? (
        <span className="rb-muted">{reason}</span>
      ) : (
        <Button busy={busy} onClick={() => onTake(table.id)}>
          Hold this table
        </Button>
      )}
    </section>
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
  busy: boolean;
  onTake: (tableId: number) => void;
}

/** Every table that suits the party, as a list. Tables that do not suit are counted, not listed, to keep it short. */
export function TableList({ tables, map, heldId, busy, onTake }: TableListProps) {
  const suitable = tables.filter((t) => t.fits_party);
  const hidden = tables.length - suitable.length;
  const recommended = new Set(map.recommended?.table_ids ?? []);
  return (
    <div className="rb-table-list">
      <h3 className="rb-service-title">Tables that suit your party</h3>
      <ul>
        {suitable.map((table) => (
          <li key={table.id} className="rb-table-row">
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
