import type { Point } from "./geometry";
import { normaliseNorth } from "./northModel";
import { newRoomKey } from "./roomModel";
import type { FixtureKind, Room, RoomFixture, RoomZone } from "./roomModel";
import type { ZoneKind } from "../../api/types";

export const FIXTURE_KINDS: readonly FixtureKind[] = ["bar", "kitchen", "wc", "column", "stairs", "plant", "stage", "fireplace", "tv", "host_stand", "awning"];
export const FIXTURE_NAMES: Record<FixtureKind, string> = { bar: "Bar", kitchen: "Open kitchen", wc: "WC", column: "Column", stairs: "Stairs", plant: "Plant", stage: "Stage", fireplace: "Fireplace", tv: "TV", host_stand: "Host stand", awning: "Awning" };
export const FIXTURE_ICONS: Record<FixtureKind, string> = { bar: "▱", kitchen: "♨", wc: "WC", column: "●", stairs: "▤", plant: "♧", stage: "♫", fireplace: "♨", tv: "▣", host_stand: "◆", awning: "☂" };
export const ZONE_KINDS: readonly ZoneKind[] = ["general", "window", "terrace", "bar", "quiet", "vip", "accessible"];

export function addFixture(room: Room, kind: FixtureKind, at: Point): Room {
  if (!FIXTURE_KINDS.includes(kind)) throw new Error("Choose a fixed element from the palette.");
  const circle = kind === "plant" || kind === "column";
  const fixture: RoomFixture = { id: null, key: newRoomKey("f"), kind, shape: circle ? "circle" : "rect", x: at.x, y: at.y, w: circle ? 50 : kind === "awning" ? 300 : 150, h: circle ? 50 : kind === "awning" ? 200 : 80, rotation: 0, label: "" };
  checkFixture(fixture);
  return { ...room, fixtures: [...room.fixtures, fixture] };
}

function checkFixture(f: RoomFixture): void {
  if (![f.x, f.y, f.w, f.h, f.rotation].every(Number.isFinite) || f.w <= 0 || f.h <= 0 || f.w > 10000 || f.h > 10000) throw new Error("Use finite positions and positive sizes up to 10000 cm.");
  if (f.label.length > 40) throw new Error("Use a label of up to 40 characters.");
  if (f.shape === "circle" && f.w !== f.h) throw new Error("A circle needs equal width and height.");
}

export function editFixture(room: Room, key: string, patch: Partial<RoomFixture>): Room {
  return { ...room, fixtures: room.fixtures.map(f => {
    if (f.key !== key) return f;
    const next = { ...f, ...patch, id: f.id, key: f.key };
    if (next.shape === "circle") { const diameter = patch.w ?? patch.h ?? f.w; next.w = diameter; next.h = diameter; }
    next.rotation = normaliseNorth(next.rotation);
    checkFixture(next);
    return next;
  }) };
}

export function addZone(room: Room, kind: ZoneKind, at: Point): Room {
  if (!ZONE_KINDS.includes(kind)) throw new Error("Choose a zone type from the palette.");
  let number = 1;
  while (room.zones.some(z => z.name === `Zone ${number}`)) number++;
  const zone: RoomZone = { id: null, key: newRoomKey("z"), name: `Zone ${number}`, kind, x: at.x, y: at.y, w: 200, h: 150 };
  const next = { ...room, zones: [...room.zones, zone] };
  return editZone(next, zone.key, {});
}

export function editZone(room: Room, key: string, patch: Partial<RoomZone>): Room {
  return { ...room, zones: room.zones.map(z => {
    if (z.key !== key) return z;
    const next = { ...z, ...patch, key: z.key, id: z.id };
    if (![next.x, next.y, next.w, next.h].every(Number.isFinite) || next.w <= 0 || next.h <= 0 || next.w > 10000 || next.h > 10000) throw new Error("Use finite positions and positive sizes up to 10000 cm.");
    if (!next.name.trim() || next.name.length > 80) throw new Error("Use a zone name of 1 to 80 characters.");
    return next;
  }) };
}

export function removeZone(room: Room, key: string): Room {
  return { ...room, zones: room.zones.filter(z => z.key !== key), tables: room.tables.map(t => t.zone_key === key ? { ...t, zone_key: null } : t) };
}
