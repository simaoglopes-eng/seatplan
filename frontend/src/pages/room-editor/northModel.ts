import type { Point } from "./geometry";

export function normaliseNorth(degrees: number): number {
  if (!Number.isFinite(degrees)) throw new Error("Use a finite angle.");
  return ((Math.round(degrees) % 360) + 360) % 360;
}
export function northAt(direction: Point): number { return normaliseNorth(Math.atan2(direction.x, -direction.y) * 180 / Math.PI); }
export function compassNorth(event: { alpha?: number | null; absolute?: boolean; webkitCompassHeading?: number }): number | null {
  if (typeof event.webkitCompassHeading === "number" && Number.isFinite(event.webkitCompassHeading) && event.webkitCompassHeading >= 0) return normaliseNorth(-event.webkitCompassHeading);
  if (event.absolute && typeof event.alpha === "number" && Number.isFinite(event.alpha)) return normaliseNorth(event.alpha);
  return null;
}
