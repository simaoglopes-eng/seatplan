// Where the chairs go around a table. Used by the editor (to place seats when
// someone adds a table) and by the home page sample map.
import type { TableShape } from "../api/types";
import { rotateOffset, tableCentre } from "./geometry";

/** Gap between a table's edge and the centre of its chairs, in venue units. */
export const CHAIR_GAP = 16;
/** Distance between neighbouring seat centres in a theatre row. */
export const ROW_SPACING = 28;

export interface TableGeometry {
  shape: TableShape;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}

/** Seat centres for `count` chairs, in venue coordinates, in reading order. */
export function seatPositions(table: TableGeometry, count: number): { x: number; y: number }[] {
  const offsets = offsetsFor(table, count);
  const centre = tableCentre(table);
  return offsets.map((o) => rotateOffset(centre.x, centre.y, o.x, o.y, table.rotation));
}

/** Offsets from the table centre before rotation. */
function offsetsFor(table: TableGeometry, count: number): { x: number; y: number }[] {
  if (table.shape === "round") return aroundCircle(table.w / 2 + CHAIR_GAP, count);
  if (table.shape === "rect") return alongLongSides(table.w, table.h, count);
  return alongLine(count);
}

/** Evenly around a circle, starting at the top and going clockwise. */
function aroundCircle(radius: number, count: number): { x: number; y: number }[] {
  const points = [];
  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    points.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
  }
  return points;
}

/** Half the chairs along the top edge, the rest along the bottom edge. */
function alongLongSides(w: number, h: number, count: number): { x: number; y: number }[] {
  const top = Math.ceil(count / 2);
  const bottom = count - top;
  return [...spread(top, w, -h / 2 - CHAIR_GAP), ...spread(bottom, w, h / 2 + CHAIR_GAP)];
}

/** `count` points spaced evenly across a width, all at the same y. */
function spread(count: number, width: number, y: number): { x: number; y: number }[] {
  const points = [];
  for (let i = 0; i < count; i++) {
    points.push({ x: -width / 2 + (width * (i + 0.5)) / count, y });
  }
  return points;
}

/** A theatre row: seats side by side on the row's centre line. */
function alongLine(count: number): { x: number; y: number }[] {
  return spread(count, count * ROW_SPACING, 0);
}

/** Size a table so `count` chairs fit comfortably around it. */
export function sizeFor(shape: TableShape, count: number): { w: number; h: number } {
  if (shape === "round") {
    // Circumference must hold the chairs with some elbow room.
    const diameter = Math.max(44, (count * ROW_SPACING) / Math.PI - CHAIR_GAP);
    return { w: Math.round(diameter), h: Math.round(diameter) };
  }
  if (shape === "rect") return { w: Math.max(56, Math.ceil(count / 2) * ROW_SPACING), h: 44 };
  return { w: count * ROW_SPACING, h: 22 };
}
