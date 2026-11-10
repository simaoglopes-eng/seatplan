// A legend with words chosen by the page. The shared <Legend> uses the
// events wording ("Closed by the organiser"); diners and staff need their own
// words for the same glyphs. We still draw the glyphs with the shared
// SeatGlyph, so the key can never show a different symbol than the map.
import { useId } from "react";
import type { SeatState } from "../../api/types";
import { SEAT_RADIUS } from "../../seatmap/geometry";
import { PatternDefs, SeatGlyph, safeId } from "../../seatmap/glyphs";

export interface KeyEntry {
  state: SeatState;
  name: string;
  hint: string;
  accessible?: boolean;
  /** Draws the brass "recommended" halo around the glyph. */
  halo?: boolean;
}

export function MapKey({ entries, label = "Map key" }: { entries: KeyEntry[]; label?: string }) {
  const prefix = safeId(useId());
  const half = SEAT_RADIUS + 6;
  return (
    <ul className="legend" aria-label={label}>
      {entries.map((entry) => {
        const id = `${prefix}-${entry.state}-${entry.accessible ? "a" : "n"}-${entry.halo ? "h" : "n"}`;
        return (
          <li key={id} className="legend-item">
            <svg className="legend-swatch" viewBox={`${-half} ${-half} ${half * 2} ${half * 2}`} aria-hidden="true">
              <PatternDefs prefix={id} />
              {entry.halo && <circle r={SEAT_RADIUS + 5} className="ring-highlight legend-static" />}
              <SeatGlyph state={entry.state} accessible={entry.accessible ?? false} prefix={id} />
            </svg>
            <span>
              <strong className="legend-name">{entry.name}</strong>
              <span className="legend-hint">{entry.hint}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** The key for the diner's table map. */
export const DINER_KEY: KeyEntry[] = [
  { state: "free", name: "Free", hint: "Tap to hold it for 5 minutes" },
  { state: "mine", name: "Yours", hint: "Held for you" },
  { state: "held", name: "Being chosen", hint: "Someone else is choosing it" },
  { state: "taken", name: "Booked", hint: "Already taken for this time" },
  { state: "blocked", name: "Does not suit", hint: "Too small, too big or missing a need" },
  { state: "free", name: "Accessible", hint: "Step-free, room for a wheelchair", accessible: true },
  { state: "free", name: "Suggested", hint: "Our best match for your party", halo: true },
];
