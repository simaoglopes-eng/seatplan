// Plain maths for the seat map: no React here, so it is easy to test and read.
import type { MapSeat, MapTable } from "../api/types";

/** Radius of a seat in venue units. Tables and seats share one coordinate system. */
export const SEAT_RADIUS = 10;

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

/** Extra room around a drawn seat that always counts as a tap on it, in venue units. */
export const HIT_PADDING = 4;
/** Smallest tap target the first, fitted view may show (WCAG 2.5.8, target size minimum). */
export const MIN_TARGET_PX = 24;
/** Tap target we aim for wherever the spacing between seats allows (Apple and WCAG 2.5.5). */
export const COMFORT_TARGET_PX = 44;

export interface Point {
  id: number;
  x: number;
  y: number;
}

export type Direction = "up" | "down" | "left" | "right";

/** Where the camera looks: translate by (x, y) screen pixels, then scale by k. */
export interface View {
  x: number;
  y: number;
  k: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Splits an offset into "how far ahead" and "how far to the side" for a direction. */
function aheadAndSideways(dx: number, dy: number, direction: Direction): [number, number] {
  switch (direction) {
    case "right":
      return [dx, Math.abs(dy)];
    case "left":
      return [-dx, Math.abs(dy)];
    case "down":
      return [dy, Math.abs(dx)];
    case "up":
      return [-dy, Math.abs(dx)];
  }
}

/**
 * The seat a person expects when pressing an arrow key: it must lie in that
 * direction, and we prefer seats that are close AND roughly in line. Sideways
 * distance counts double, so "right" does not jump to a seat far below.
 */
export function nearestInDirection(points: Point[], fromId: number, direction: Direction): number | null {
  const from = points.find((p) => p.id === fromId);
  if (!from) return null;
  let bestId: number | null = null;
  let bestCost = Infinity;
  for (const p of points) {
    if (p.id === fromId) continue;
    const [ahead, sideways] = aheadAndSideways(p.x - from.x, p.y - from.y, direction);
    if (ahead <= 0.5) continue; // behind us or level with us
    const cost = ahead + 2 * sideways;
    if (cost < bestCost) {
      bestCost = cost;
      bestId = p.id;
    }
  }
  return bestId;
}

/** Anything with a top-left corner and a size, such as a zone. */
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The smallest box that holds every table, seat and zone, plus a margin. */
export function contentBounds(tables: MapTable[], seats: MapSeat[], margin = 40, zones: Box[] = []): Bounds {
  const bounds: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const grow = (x: number, y: number, r: number): void => {
    bounds.minX = Math.min(bounds.minX, x - r);
    bounds.minY = Math.min(bounds.minY, y - r);
    bounds.maxX = Math.max(bounds.maxX, x + r);
    bounds.maxY = Math.max(bounds.maxY, y + r);
  };
  // A rotated table never reaches further than half its diagonal.
  for (const t of tables) {
    const centre = tableCentre(t);
    grow(centre.x, centre.y, Math.hypot(t.w, t.h) / 2);
  }
  for (const s of seats) grow(s.x, s.y, SEAT_RADIUS);
  // A zone (a stage, a dance floor) is part of the picture people orient by.
  for (const z of zones) {
    grow(z.x, z.y, 0);
    grow(z.x + z.w, z.y + z.h, 0);
  }
  if (!Number.isFinite(bounds.minX)) return { minX: 0, minY: 0, maxX: 400, maxY: 300 };
  return { minX: bounds.minX - margin, minY: bounds.minY - margin, maxX: bounds.maxX + margin, maxY: bounds.maxY + margin };
}

/**
 * The starting view. It shows all of `bounds` when that keeps the zoom at or
 * above `minK`; otherwise it uses `minK` (so seats stay big enough to tap) and
 * centres on `focus`, for example the recommended seat. The person then pans.
 */
export function fitView(bounds: Bounds, width: number, height: number, minK = MIN_ZOOM, focus?: { x: number; y: number }): View {
  const whole = Math.min(width / (bounds.maxX - bounds.minX), height / (bounds.maxY - bounds.minY));
  const k = clamp(Math.max(whole, minK), MIN_ZOOM, MAX_ZOOM);
  const centre = focus ?? { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  return {
    k,
    x: placeAxis(bounds.minX, bounds.maxX, centre.x, k, width),
    y: placeAxis(bounds.minY, bounds.maxY, centre.y, k, height),
  };
}

/**
 * Screen offset along one axis. Content that fits is centred. Content that
 * does not fit is centred on `focus`, but never so far that empty space shows
 * beyond the content's edge (that would waste the small phone screen).
 */
function placeAxis(min: number, max: number, focus: number, k: number, size: number): number {
  const length = (max - min) * k;
  if (length <= size) return (size - length) / 2 - min * k;
  return clamp(size / 2 - focus * k, size - max * k, -min * k);
}

/**
 * Half the distance from each point to its nearest neighbour: the most room
 * its hit area can take without covering the next seat. Comparing every pair
 * is n squared, which is 160,000 steps for 400 seats: instant, and simple.
 */
export function roomAround(points: Point[]): Map<number, number> {
  const room = new Map<number, number>();
  for (const p of points) {
    let nearest = Infinity;
    for (const q of points) {
      if (q.id !== p.id) nearest = Math.min(nearest, Math.hypot(p.x - q.x, p.y - q.y));
    }
    room.set(p.id, nearest / 2);
  }
  return room;
}

/**
 * Radius of a seat's invisible hit area at zoom k, in venue units: as close to
 * 44 px on screen as the room allows, and never smaller than the drawn seat
 * plus padding. Rounded DOWN to half a unit: small zoom steps then do not
 * redraw seats, and rounding can never push a hit area over a neighbour.
 */
export function seatHitRadius(room: number, k: number): number {
  const comfortable = COMFORT_TARGET_PX / 2 / k;
  const radius = Math.max(SEAT_RADIUS + HIT_PADDING, Math.min(comfortable, room));
  return Math.floor(radius * 2) / 2;
}

/** Radius of a whole table's hit area (restaurant maps), in venue units. */
export function tableHitRadius(table: { w: number; h: number }): number {
  return Math.max(table.w, table.h) / 2 + HIT_PADDING;
}

/** The zoom at which a target `size` venue units across is `px` pixels on screen. */
export function zoomForTarget(size: number, px: number): number {
  return clamp(px / size, MIN_ZOOM, MAX_ZOOM);
}

/**
 * Centre of a table. Tables are stored like the backend stores them
 * (models.py): (x, y) is the TOP-LEFT corner of the unrotated box, and
 * rotation turns the box around its centre.
 */
export function tableCentre(table: { x: number; y: number; w: number; h: number }): { x: number; y: number } {
  return { x: table.x + table.w / 2, y: table.y + table.h / 2 };
}

/** Rotates the offset (dx, dy) by `degrees` and adds it to (cx, cy). */
export function rotateOffset(cx: number, cy: number, dx: number, dy: number, degrees: number): { x: number; y: number } {
  const a = (degrees * Math.PI) / 180;
  return { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) };
}

/** Zoom by `factor` while keeping the screen point (px, py) still, like a map app. */
export function zoomAround(view: View, factor: number, px: number, py: number): View {
  const k = clamp(view.k * factor, MIN_ZOOM, MAX_ZOOM);
  const applied = k / view.k;
  return { k, x: px - (px - view.x) * applied, y: py - (py - view.y) * applied };
}
