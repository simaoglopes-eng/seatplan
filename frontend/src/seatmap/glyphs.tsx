// The visual vocabulary of seats. Each state has its OWN shape, mark or
// pattern, so it can be told apart without seeing colour (WCAG 1.4.1):
//
//   free     open ring
//   held     striped fill with a dashed edge
//   taken    solid disc with a cross
//   mine     solid disc with a tick and a thick edge
//   friend   rounded square with a dotted fill
//   blocked  cross-hatched disc with a bar ("no entry")
//   accessible  extra wheelchair badge, combinable with any state
//
// The map and the legend both draw from this file, so they can never disagree.
import type { SeatState } from "../api/types";
import { SEAT_RADIUS } from "./geometry";

/** Pattern ids must be unique per page; React's useId gives ":r1:", which is not safe in url(#...). */
export function safeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "");
}

/** The three fill patterns. Put once inside each <svg> that draws glyphs. */
export function PatternDefs({ prefix }: { prefix: string }) {
  return (
    <defs>
      <pattern id={`${prefix}-held`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="4" height="4" className="pat-held-bg" />
        <rect width="1.6" height="4" className="pat-held-fg" />
      </pattern>
      <pattern id={`${prefix}-friend`} width="4" height="4" patternUnits="userSpaceOnUse">
        <rect width="4" height="4" className="pat-friend-bg" />
        <circle cx="2" cy="2" r="0.95" className="pat-friend-fg" />
      </pattern>
      <pattern id={`${prefix}-blocked`} width="5" height="5" patternUnits="userSpaceOnUse">
        <rect width="5" height="5" className="pat-blocked-bg" />
        <path d="M0 0L5 5M5 0L0 5" className="pat-blocked-fg" />
      </pattern>
    </defs>
  );
}

/** The mark drawn on top of a shape: a cross, a tick, a bar or nothing. Drawn for radius 10. */
export function StateMark({ state }: { state: SeatState }) {
  switch (state) {
    case "taken":
      return <path d="M-4 -4L4 4M4 -4L-4 4" className="mark mark-taken" />;
    case "mine":
      return <path d="M-4.6 0.4L-1.4 3.6L4.8 -3.4" className="mark mark-mine" />;
    case "blocked":
      return <path d="M-5.5 0H5.5" className="mark mark-blocked" />;
    default:
      return null;
  }
}

/** Small wheelchair badge in the top-right corner of a seat. */
export function AccessibleBadge({ r = SEAT_RADIUS }: { r?: number }) {
  const offset = r * 0.75;
  return (
    <g transform={`translate(${offset} ${-offset})`} className="badge-accessible">
      <circle r="5.4" className="badge-accessible-bg" />
      <circle cx="0.7" cy="-2.7" r="0.95" className="badge-accessible-head" />
      <path d="M0.3 -1.4V0.9H2.4L3 2.7M-0.6 -0.5A2.5 2.5 0 1 0 1.9 2.5" className="badge-accessible-mark" />
    </g>
  );
}

interface SeatGlyphProps {
  state: SeatState;
  accessible: boolean;
  prefix: string;
}

/** One seat, centred on (0, 0). The caller positions it with a transform. */
export function SeatGlyph({ state, accessible, prefix }: SeatGlyphProps) {
  const r = SEAT_RADIUS;
  return (
    <g className={`glyph glyph-${state}`}>
      {state === "friend" ? (
        <rect x={-r * 0.9} y={-r * 0.9} width={r * 1.8} height={r * 1.8} rx="3.5" className="glyph-body" fill={bodyFill(state, prefix)} />
      ) : (
        <circle r={state === "mine" ? r - 0.5 : r - 1} className="glyph-body" fill={bodyFill(state, prefix)} />
      )}
      <StateMark state={state} />
      {accessible && <AccessibleBadge />}
    </g>
  );
}

/** Fill for a seat or table body: a pattern for some states, a CSS class colour for the rest. */
export function bodyFill(state: SeatState, prefix: string): string | undefined {
  if (state === "held") return `url(#${prefix}-held)`;
  if (state === "friend") return `url(#${prefix}-friend)`;
  if (state === "blocked") return `url(#${prefix}-blocked)`;
  return undefined; // colour comes from seatmap.css
}
