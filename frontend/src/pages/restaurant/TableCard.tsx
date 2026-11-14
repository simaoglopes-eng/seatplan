// One card for the table in front of the diner: our suggestion on arrival, the table they pointed
// at, or the one they hold. It says which room, how many people, why we suggest it, the light
// and the view, and carries the one action for that table. Replaces the separate "suggestion" and
// "ambience" cards, which showed the same table twice.
import type { DinerTable } from "../../api/restaurant";
import { Badge, Button } from "../../design/components";
import { lightWords } from "./ambienceView";
import { partyRange, unavailableReason } from "./tableView";

interface TableCardProps {
  table: DinerTable;
  /** The room the table is in; null for a restaurant with a single room. */
  roomName: string | null;
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

export function TableCard({ table, roomName, recommended, reasons, heldId, busy, onTake }: TableCardProps) {
  const ambience = table.ambience;
  const reason = unavailableReason(table);
  const held = table.id === heldId && table.state !== "taken";
  const text = lines(recommended ? reasons : [], ambience?.phrases ?? []);
  return (
    <section className="rb-card rb-table-card" aria-label={`Table ${table.label}, ${partyRange(table)}`}>
      <div className="rb-table-card-top">
        {recommended && !held && <Badge tone="warning">Recommended</Badge>}
        {ambience && <p className="rb-eyebrow">{lightWords(ambience.light)}</p>}
      </div>
      <h3 className="rb-suggestion-title">
        Table {table.label}{" "}
        <span className="rb-muted">
          · {roomName ? `${roomName} · ` : ""}
          {partyRange(table)}
        </span>
      </h3>
      {text.length > 0 && (
        <ul className="rb-reasons">
          {text.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {ambience?.view?.photo_url && <img className="rb-view-photo" src={ambience.view.photo_url} alt={ambience.view.text || "The view from this table"} loading="lazy" />}
      {held ? (
        <Badge tone="success">Held for you</Badge>
      ) : reason ? (
        <p className="rb-muted rb-table-card-reason">{reason}</p>
      ) : (
        <Button busy={busy} onClick={() => onTake(table.id)}>
          Hold table {table.label} &amp; continue
        </Button>
      )}
    </section>
  );
}
