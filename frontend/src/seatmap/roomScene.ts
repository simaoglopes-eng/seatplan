// Pure geometry for drawing a restaurant room on the diner map (spec 9.3).
// It only builds SVG path text and bounds from the numbers the API sends; the
// components in RoomLayers.tsx draw them. It reuses the room editor's tested
// outline functions, so the map and the editor bend a wall the same way.
import type { MapRoom, MapRoomFixture, MapRoomOpening } from "../api/types";
import { outlinePath, outlineToPolygon, sideLength, sideNormal, sidePath, sidePoint } from "../pages/room-editor/geometry";
import type { Outline, Point } from "../pages/room-editor/geometry";
import { FIXTURE_NAMES } from "../pages/room-editor/roomObjects";
import type { Bounds } from "./geometry";

export { outlinePath };

/** How far inside a window its view icon sits, in cm. */
const VIEW_ICON_INSET = 28;

/** Numbers in paths are rounded to two decimals so the text is stable and short. */
const n = (value: number): number => Math.round(value * 100) / 100;

function arcRadius(outline: Outline, side: number): number {
  const a = outline.points[side];
  const b = outline.points[(side + 1) % outline.points.length];
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  return Math.abs((chord * chord / 4 + a.curve * a.curve) / (2 * a.curve));
}

/** The stretch of wall an opening covers: straight on a straight side, an arc on a curved one. */
export function openingPath(outline: Outline, opening: Pick<MapRoomOpening, "side" | "offset" | "width" | "kind">): string {
  if (opening.kind === "glass_wall") return sidePath(outline, opening.side);
  const length = sideLength(outline, opening.side);
  const start = sidePoint(outline, opening.side, Math.min(1, opening.offset / length));
  const end = sidePoint(outline, opening.side, Math.min(1, (opening.offset + opening.width) / length));
  const curve = outline.points[opening.side].curve;
  if (!curve) return `M ${n(start.x)} ${n(start.y)} L ${n(end.x)} ${n(end.y)}`;
  const radius = arcRadius(outline, opening.side);
  const large = opening.width / radius > Math.PI ? 1 : 0;
  return `M ${n(start.x)} ${n(start.y)} A ${n(radius)} ${n(radius)} 0 ${large} ${curve > 0 ? 1 : 0} ${n(end.x)} ${n(end.y)}`;
}

/** The swing of a door: from its free end round to the hinge, then back along the wall. */
export function doorArcPath(outline: Outline, opening: Pick<MapRoomOpening, "side" | "offset" | "width">): string {
  const length = sideLength(outline, opening.side);
  const start = sidePoint(outline, opening.side, Math.min(1, opening.offset / length));
  const end = sidePoint(outline, opening.side, Math.min(1, (opening.offset + opening.width) / length));
  const normal = sideNormal(outline, opening.side, Math.min(1, opening.offset / length));
  const hinge = { x: start.x - normal.x * opening.width, y: start.y - normal.y * opening.width };
  const r = n(opening.width);
  return `M ${n(end.x)} ${n(end.y)} A ${r} ${r} 0 0 1 ${n(hinge.x)} ${n(hinge.y)} L ${n(start.x)} ${n(start.y)}`;
}

export function polygonPath(points: readonly Point[]): string {
  if (!points.length) return "";
  return `${points.map((p, i) => `${i ? "L" : "M"} ${n(p.x)} ${n(p.y)}`).join(" ")} Z`;
}

/** The box that holds every room's walls, curves included, plus a margin. Null without rooms. */
export function roomsBounds(rooms: readonly MapRoom[], margin = 40): Bounds | null {
  if (!rooms.length) return null;
  const bounds: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const room of rooms) {
    for (const p of outlineToPolygon(room.outline)) {
      bounds.minX = Math.min(bounds.minX, p.x);
      bounds.minY = Math.min(bounds.minY, p.y);
      bounds.maxX = Math.max(bounds.maxX, p.x);
      bounds.maxY = Math.max(bounds.maxY, p.y);
    }
  }
  return { minX: bounds.minX - margin, minY: bounds.minY - margin, maxX: bounds.maxX + margin, maxY: bounds.maxY + margin };
}

export function mergeBounds(a: Bounds, b: Bounds | null): Bounds {
  if (!b) return a;
  return { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) };
}

export function fixtureName(fixture: MapRoomFixture): string {
  return fixture.label.trim() || (FIXTURE_NAMES as Record<string, string>)[fixture.kind] || fixture.kind;
}

/** Where to put the small "view" icon: just inside the middle of each window that has a view. */
export function viewAnchors(room: MapRoom): { id: number; x: number; y: number }[] {
  const anchors: { id: number; x: number; y: number }[] = [];
  for (const opening of room.openings) {
    if (opening.kind === "door") continue;
    if (!opening.view_text.trim() && !opening.view_tags.length) continue;
    const length = sideLength(room.outline, opening.side);
    const middle = opening.kind === "glass_wall" ? 0.5 : Math.min(1, (opening.offset + opening.width / 2) / length);
    const at = sidePoint(room.outline, opening.side, middle);
    const out = sideNormal(room.outline, opening.side, middle);
    anchors.push({ id: opening.id, x: n(at.x - out.x * VIEW_ICON_INSET), y: n(at.y - out.y * VIEW_ICON_INSET) });
  }
  return anchors;
}
