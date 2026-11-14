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

/**
 * The key for the diner's table map: three looks and no more ("Selected" while exploring, "Held for you" after the hold). The wheelchair badge sits on the
 * tables that are accessible and needs no entry of its own; why a table is unavailable is said in its
 * card and to screen readers.
 */
export const DINER_KEY: KeyEntry[] = [
  { state: "free", name: "Available", hint: "Tap a table to see it, then hold it for 5 minutes" },
  { state: "mine", name: "Selected", hint: "The table you are looking at" },
  { state: "taken", name: "Unavailable", hint: "Booked, being chosen by someone else, or not right for your party" },
];

/** The same key once a table is held: the middle look now means the table is reserved for the diner. */
export const DINER_KEY_HELD: KeyEntry[] = [
  DINER_KEY[0],
  { state: "mine", name: "Held for you", hint: "Reserved for you while you finish the booking" },
  DINER_KEY[2],
];

/** What the sun, the night and the view icon mean; said once, next to the light preview, not in the key. */
export const SCENE_NOTE = "On the plan, striped yellow is where the sun reaches the floor, dark blue is after sunset, and an eye marks a window with a view.";

/** Kept for the staff and owner screens that still list the room layers in a key. */
export const ROOM_KEY: SceneEntry[] = [
  { scene: "sun", name: "Direct sun", hint: "Striped areas: the sun reaches the floor" },
  { scene: "night", name: "After dark", hint: "The room is shaded dark blue once the sun has set" },
  { scene: "view", name: "View", hint: "A window with a view worth looking at" },
];
