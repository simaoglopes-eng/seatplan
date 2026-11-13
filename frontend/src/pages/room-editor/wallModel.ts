import { bearing, sideLength, sideNormal, sidePoint } from "./geometry";
import type { Point } from "./geometry";
import { newRoomKey } from "./roomModel";
import type { Room, RoomOpening } from "./roomModel";

export const VIEW_TAGS = ["river", "sea", "street", "garden", "courtyard", "monument", "city", "hills", "pool", "square"] as const;

export function checkOpenings(room: Room): void {
  for (const o of room.openings) {
    const length = Number.isInteger(o.side) && o.side >= 0 && o.side < room.outline.points.length ? sideLength(room.outline, o.side) : NaN;
    if (![length, o.offset, o.width, o.top_height].every(Number.isFinite) || o.offset < 0 || o.width < 40 || o.offset + o.width > length + 1e-6) throw new Error("Openings must be at least 40 cm wide and stay within the wall.");
    if (o.kind === "glass_wall" && (o.offset !== 0 || Math.abs(o.width - length) > 1e-6)) throw new Error("A glass wall must cover the whole side.");
    if (o.top_height < 100 || o.top_height > 500) throw new Error("Window top height must be between 100 and 500 cm.");
    if (o.view_text.length > 80 || o.night_view_text.length > 80 || o.view_tags.length > 3 || new Set(o.view_tags).size !== o.view_tags.length || o.view_tags.some(tag => !VIEW_TAGS.some(value => value === tag))) throw new Error("Use up to 80 characters and three view tags.");
    if (o.sun_rule === "between" && (!o.sun_from || !o.sun_until || !/^([01]\d|2[0-3]):[0-5]\d$/.test(o.sun_from) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(o.sun_until) || o.sun_from >= o.sun_until)) throw new Error("Choose a start time before the end time.");
    if (room.openings.some(other => other.key !== o.key && other.side === o.side && o.offset < other.offset + other.width - 1e-6 && other.offset < o.offset + o.width - 1e-6)) throw new Error("Openings on the same wall cannot overlap.");
  }
}

export function addOpening(room: Room, side: number, kind: RoomOpening["kind"]): Room {
  const length = sideLength(room.outline, side), occupied = room.openings.filter(o => o.side === side).sort((a, b) => a.offset - b.offset);
  let offset = 0, width = kind === "glass_wall" ? length : Math.min(kind === "door" ? 100 : 120, length);
  if (kind !== "glass_wall") {
    for (const existing of [...occupied, { offset: length, width: 0 }]) {
      if (existing.offset - offset >= 40) { width = Math.min(width, existing.offset - offset); break; }
      offset = existing.offset + existing.width;
    }
  }
  const opening: RoomOpening = { id: null, key: newRoomKey("o"), kind, side, offset, width, top_height: 220, is_main_entrance: false, view_text: "", night_view_text: "", view_tags: [], sun_rule: "auto", sun_from: null, sun_until: null };
  const next = { ...room, openings: [...room.openings, opening] };
  checkOpenings(next);
  return next;
}

export function updateOpening(room: Room, key: string, change: Partial<RoomOpening>): Room {
  const next = { ...room, openings: room.openings.map(o => o.key === key ? { ...o, ...change, key: o.key, id: o.id } : o) };
  checkOpenings(next);
  return next;
}

export function openingBearing(room: Room, opening: RoomOpening): number | null {
  if (room.north_deg === null) return null;
  const normal = sideNormal(room.outline, opening.side, (opening.offset + opening.width / 2) / sideLength(room.outline, opening.side));
  return bearing(normal.x, normal.y, room.north_deg);
}

/** Closest offset along a circular side; distance is centimetres along the arc. */
export function wallOffset(room: Room, side: number, point: Point): number {
  const distance = (fraction: number) => { const p = sidePoint(room.outline, side, fraction); return Math.hypot(point.x - p.x, point.y - p.y); };
  let closest = 0;
  for (let i = 1; i <= 64; i++) if (distance(i / 64) < distance(closest / 64)) closest = i;
  let low = Math.max(0, (closest - 1) / 64), high = Math.min(1, (closest + 1) / 64);
  for (let i = 0; i < 30; i++) { const a = low + (high - low) / 3, b = high - (high - low) / 3; if (distance(a) < distance(b)) high = b; else low = a; }
  return (low + high) / 2 * sideLength(room.outline, side);
}

export function openingPath(room: Room, opening: RoomOpening): string {
  const length = sideLength(room.outline, opening.side);
  const start = sidePoint(room.outline, opening.side, opening.offset / length);
  const end = sidePoint(room.outline, opening.side, (opening.offset + opening.width) / length);
  const a = room.outline.points[opening.side], b = room.outline.points[(opening.side + 1) % room.outline.points.length];
  if (!a.curve) return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  const chord = Math.hypot(b.x - a.x, b.y - a.y), radius = Math.abs((chord * chord / 4 + a.curve ** 2) / (2 * a.curve));
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 ${a.curve > 0 ? 1 : 0} ${end.x} ${end.y}`;
}
