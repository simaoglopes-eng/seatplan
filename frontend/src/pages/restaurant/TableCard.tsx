// One card for the table in front of the diner: our suggestion on arrival, the table they pointed
// at, or the one they hold. It says which room, which kind of table, the view, how many it seats
// and the light, and carries the one action for that table. The reasons we give for a suggestion
// sit behind "Why this table", so the card stays short beside the plan.
import type { DinerTable } from "../../api/restaurant";
import { Badge, Button } from "../../design/components";
import { lightWords } from "./ambienceView";
import { tableName } from "./format";
import { partyRange, unavailableReason } from "./tableView";

interface TableCardProps {
  table: DinerTable;
  /** The room the table is in; null for a restaurant with a single room. */
  roomName: string | null;
  /** The zone the table sits in ("Window"), if the restaurant named one. */
  zone: string | null;
  /** True when this is the table we suggest. */
  recommended: boolean;
  /** Why we suggest it, in plain words. Only shown for the suggestion. */
  reasons: string[];
  heldId: number | null;
  busy: boolean;
  onTake: (tableId: number) => void;
}

/** The reasons we give for a suggestion, then what the table is like, without saying the same thing twice. */
function lines(reasons: string[], phrases: string[]): string[] {
  const seen = new Set<string>();
  return [...reasons, ...phrases].filter((line) => {
    const key = line.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function TableCard({ table, roomName, zone, recommended, reasons, heldId, busy, onTake }: TableCardProps) {
  const ambience = table.ambience;
  const reason = unavailableReason(table);
  const held = table.id === heldId && table.state !== "taken";
  const text = lines(recommended ? reasons : [], ambience?.phrases ?? []);
  const meta = [ambience?.view?.text, `Seats ${table.max_party}`, ambience ? lightWords(ambience.light) : null].filter(Boolean).join(" · ");
  return (
    <section className="rb-card rb-table-card" aria-label={`Table ${table.label}, ${partyRange(table)}`}>
      <div className="rb-table-card-head">
        <div>
          {roomName && <p className="rb-table-room">{roomName}</p>}
          <h3 className="rb-table-title">
            {tableName(table.label)}
            {zone ? ` · ${zone} table` : ""}
          </h3>
        </div>
        {recommended && !held && <Badge tone="success">Recommended</Badge>}
      </div>
      <p className="rb-muted rb-table-meta">{meta}</p>
      {ambience?.view?.photo_url && <img className="rb-view-photo" src={ambience.view.photo_url} alt={ambience.view.text || "The view from this table"} loading="lazy" />}
      {held ? (
        <Badge tone="success">Held for you</Badge>
      ) : reason ? (
        <p className="rb-muted rb-table-card-reason">{reason}</p>
      ) : (
        <>
          <Button busy={busy} onClick={() => onTake(table.id)}>
            Hold {table.label} &amp; continue <span aria-hidden="true">{"→"}</span>
          </Button>
          <p className="rb-muted rb-table-note">You will have five minutes to finish after holding the table.</p>
        </>
      )}
      {text.length > 0 && (
        <details className="rb-why">
          <summary>Why this table</summary>
          <ul className="rb-reasons">
            {text.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
