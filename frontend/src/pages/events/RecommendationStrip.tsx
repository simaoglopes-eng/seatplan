// "Recommended for you": the top seats from the optimiser, each with the
// plain-language reasons the server sends. Tapping a card shows that seat on
// the map; holding it is a separate, deliberate tap. A card is only called
// "Best match" when it really is near someone the person knows.
import type { SeatRecommendation } from "../../api/events";
import type { MapSeat, MapTable } from "../../api/types";
import { Skeleton } from "../../design/components";
import { seatName } from "./format";

interface RecommendationStripProps {
  recs: SeatRecommendation[] | null;
  failed: boolean;
  seats: MapSeat[];
  tables: MapTable[];
  focusedId: number | null;
  onFocus: (seatId: number) => void;
}

const SHOWN = 3;

function rankLabel(rec: SeatRecommendation, index: number): string {
  return index === 0 && rec.match !== "none" ? "Best match" : `Option ${index + 1}`;
}

export function RecommendationStrip({ recs, failed, seats, tables, focusedId, onFocus }: RecommendationStripProps) {
  if (failed) {
    return <p className="ev-muted">Suggestions are not available right now. Every free seat on the map can still be chosen.</p>;
  }
  if (recs === null) return <Skeleton lines={2} label="Finding good seats for you" />;
  const free = new Set(seats.filter((s) => s.state === "free").map((s) => s.id));
  const top = recs.filter((r) => free.has(r.seat_id)).slice(0, SHOWN);
  if (top.length === 0) {
    return <p className="ev-muted">No suggestions yet. Pick any free seat on the map.</p>;
  }
  return (
    <ol className="ev-recs" aria-label="Recommended for you">
      {top.map((rec, index) => (
        <li key={rec.seat_id}>
          <button type="button" className="ev-rec" aria-pressed={focusedId === rec.seat_id} onClick={() => onFocus(rec.seat_id)}>
            <span className="ev-rec-rank">{rankLabel(rec, index)}</span>
            <strong className="ev-rec-seat">{seatName(rec.seat_id, seats, tables)}</strong>
            {rec.reasons.length > 0 && (
              <ul className="ev-rec-reasons">
                {rec.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
            <span className="ev-rec-cta">Show on map</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
