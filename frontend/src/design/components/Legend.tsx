// The key to the seat map. It draws the SAME glyphs as the map (from
// seatmap/glyphs.tsx), so the legend can never show a different symbol.
import { useId } from "react";
import type { ReactNode } from "react";
import type { SeatState } from "../../api/types";
import { STATE_HINT, STATE_TEXT } from "../../seatmap/describe";
import { SEAT_RADIUS } from "../../seatmap/geometry";
import { PatternDefs, SeatGlyph, safeId } from "../../seatmap/glyphs";
// The glyph styles live with the map; import them so the legend also works on a page without a map.
import "../../seatmap/seatmap.css";

interface LegendProps {
  /** Which states to explain. Only list what this screen can actually show. */
  states: SeatState[];
  showAccessible?: boolean;
  showRecommended?: boolean;
  /** Explains the map's second highlight (SeatMap `marked`), e.g. "Changed by this preview". */
  markedLabel?: string;
}

/** A tiny standalone SVG around one glyph. */
function Swatch({ children, prefix }: { children: ReactNode; prefix: string }) {
  const half = SEAT_RADIUS + 6;
  return (
    <svg className="legend-swatch" viewBox={`${-half} ${-half} ${half * 2} ${half * 2}`} aria-hidden="true">
      <PatternDefs prefix={prefix} />
      {children}
    </svg>
  );
}

export function Legend({ states, showAccessible = false, showRecommended = false, markedLabel }: LegendProps) {
  const prefix = safeId(useId());
  return (
    <ul className="legend" aria-label="Map legend">
      {states.map((state) => (
        <li key={state} className="legend-item">
          <Swatch prefix={`${prefix}-${state}`}>
            <SeatGlyph state={state} accessible={false} prefix={`${prefix}-${state}`} />
          </Swatch>
          <span>
            <strong className="legend-name">{capitalise(STATE_TEXT[state])}</strong>
            <span className="legend-hint">{STATE_HINT[state]}</span>
          </span>
        </li>
      ))}
      {showAccessible && (
        <li className="legend-item">
          <Swatch prefix={`${prefix}-acc`}>
            <SeatGlyph state="free" accessible={true} prefix={`${prefix}-acc`} />
          </Swatch>
          <span>
            <strong className="legend-name">Accessible</strong>
            <span className="legend-hint">Step-free, room for a wheelchair</span>
          </span>
        </li>
      )}
      {showRecommended && (
        <li className="legend-item">
          <Swatch prefix={`${prefix}-rec`}>
            <circle r={SEAT_RADIUS + 5} className="ring-highlight legend-static" />
            <SeatGlyph state="free" accessible={false} prefix={`${prefix}-rec`} />
          </Swatch>
          <span>
            <strong className="legend-name">Recommended</strong>
            <span className="legend-hint">A good match for you</span>
          </span>
        </li>
      )}
      {markedLabel && <MarkedItem prefix={`${prefix}-mark`} label={markedLabel} />}
    </ul>
  );
}

/** The same square outline SeatMap draws around `marked` targets, sized to fit the swatch. */
function MarkedItem({ prefix, label }: { prefix: string; label: string }) {
  const square = SEAT_RADIUS + 5;
  return (
    <li className="legend-item">
      <Swatch prefix={prefix}>
        <rect x={-square} y={-square} width={square * 2} height={square * 2} rx="3" className="ring-marked" />
        <SeatGlyph state="free" accessible={false} prefix={prefix} />
      </Swatch>
      <span>
        <strong className="legend-name">{label}</strong>
        <span className="legend-hint">Square outline</span>
      </span>
    </li>
  );
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
