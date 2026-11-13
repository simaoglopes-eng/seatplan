// The Light tool's picture on the plan (spec 7.7): striped patches where the sun
// reaches the floor, a dark-blue veil after sunset, and the sun on the edge of
// the plan in the right direction. Scenery only: it never catches a tap.
import { useId } from "react";
import type { AmbienceAnswer } from "../../api/restaurant";
import { RoomDefs } from "../../seatmap/RoomLayers";
import { polygonPath } from "../../seatmap/roomScene";
import "../../seatmap/seatmap.css";
import { outlinePath, outlineToPolygon } from "./geometry";
import { sunDirection } from "./lightModel";
import type { Room } from "./roomModel";

/** Where on the plan's edge the sun sits: from the room's middle, along its direction, just outside the walls. */
function sunSpot(room: Room, direction: { x: number; y: number }, zoom: number): { x: number; y: number } | null {
  let corners;
  try {
    corners = outlineToPolygon(room.outline);
  } catch {
    return null;
  }
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const centre = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  const half = { x: (Math.max(...xs) - Math.min(...xs)) / 2, y: (Math.max(...ys) - Math.min(...ys)) / 2 };
  const reach = Math.min(Math.abs(direction.x) < 1e-9 ? Infinity : half.x / Math.abs(direction.x), Math.abs(direction.y) < 1e-9 ? Infinity : half.y / Math.abs(direction.y));
  const distance = reach + 60 / zoom;
  return { x: centre.x + direction.x * distance, y: centre.y + direction.y * distance };
}

export function LightLayer({ room, light, zoom }: { room: Room; light: AmbienceAnswer | null; zoom: number }) {
  const id = useId().replace(/:/g, "");
  const lit = light?.rooms.find((r) => r.id === room.id);
  if (!light || !lit || room.outline.points.length < 3) return null;
  const outline = outlinePath(room.outline);
  const sun = light.sun;
  const spot = sun && sun.altitude > 0 && room.north_deg !== null ? sunSpot(room, sunDirection(sun.azimuth, room.north_deg), zoom) : null;
  return (
    <g aria-hidden="true" pointerEvents="none" className="room-light">
      <RoomDefs prefix={id} />
      <clipPath id={`${id}-room`}>
        <path d={outline} />
      </clipPath>
      {lit.sun_patches.length > 0 && (
        <g clipPath={`url(#${id}-room)`}>
          {lit.sun_patches.map((patch, i) => (
            <path key={i} d={polygonPath(patch)} fill={`url(#${id}-sun)`} className="room-sun" />
          ))}
        </g>
      )}
      {lit.night && <path d={outline} className="room-night" />}
      {spot && (
        <g className="room-sun-direction" transform={`translate(${spot.x} ${spot.y}) scale(${1 / zoom})`}>
          <circle r="14" />
          {Array.from({ length: 8 }, (_, i) => (
            <line key={i} x1="0" y1="-19" x2="0" y2="-26" transform={`rotate(${i * 45})`} />
          ))}
        </g>
      )}
    </g>
  );
}
