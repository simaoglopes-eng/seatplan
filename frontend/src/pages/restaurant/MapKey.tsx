// A legend with words chosen by the page. The shared <Legend> uses the
// events wording ("Closed by the organiser"); diners and staff need their own
// words for the same glyphs. We still draw the glyphs with the shared
// SeatGlyph, so the key can never show a different symbol than the map.
import { useId } from "react";
import type { SeatState } from "../../api/types";
import { SEAT_RADIUS } from "../../seatmap/geometry";
import { PatternDefs, SeatGlyph, safeId } from "../../seatmap/glyphs";
import { RoomDefs } from "../../seatmap/RoomLayers";

export interface KeyEntry {
  state: SeatState;
  name: string;
  hint: string;
  accessible?: boolean;
  /** Draws the brass "recommended" halo around the glyph. */
  halo?: boolean;
}

/** What the room layers add to the map: sun, darkness and a window with a view. */
export interface SceneEntry {
  scene: "sun" | "night" | "view";
  name: string;
  hint: string;
}

function SceneSwatch({ scene, id }: { scene: SceneEntry["scene"]; id: string }) {
  if (scene === "sun") {
    return (
      <svg className="legend-swatch" viewBox="-14 -14 28 28" aria-hidden="true">
        <RoomDefs prefix={id} />
        <rect x="-12" y="-12" width="24" height="24" rx="3" fill={`url(#${id}-sun)`} className="legend-scene-sun" />
      </svg>
    );
  }
  if (scene === "night") {
    return (
      <svg className="legend-swatch" viewBox="-14 -14 28 28" aria-hidden="true">
        <rect x="-12" y="-12" width="24" height="24" rx="3" className="legend-scene-floor" />
        <rect x="-12" y="-12" width="24" height="24" rx="3" className="legend-scene-night" />
      </svg>
    );
  }
  return (
    <svg className="legend-swatch" viewBox="-14 -14 28 28" aria-hidden="true">
      <g className="room-view-icon">
        <circle r="11" />
        <path d="M-7 0Q0 -6 7 0Q0 6 -7 0Z" />
        <circle r="2.2" className="room-view-pupil" />
      </g>
    </svg>
  );
}

export function MapKey({ entries, scenes = [], label = "Map key" }: { entries: KeyEntry[]; scenes?: SceneEntry[]; label?: string }) {
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
      {scenes.map((entry) => {
        const id = `${prefix}-scene-${entry.scene}`;
        return (
          <li key={id} className="legend-item">
            <SceneSwatch scene={entry.scene} id={id} />
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

/** Added to the key when the map shows rooms. */
export const ROOM_KEY: SceneEntry[] = [
  { scene: "sun", name: "Direct sun", hint: "Striped areas: the sun reaches the floor" },
  { scene: "night", name: "After dark", hint: "The room is shaded dark blue once the sun has set" },
  { scene: "view", name: "View", hint: "A window with a view worth looking at" },
];
