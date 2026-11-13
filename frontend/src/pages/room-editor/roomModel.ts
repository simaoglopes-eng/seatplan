import type { TableShape, ZoneKind } from "../../api/types";
import type { Box, Outline } from "./geometry";

export interface RoomItem { id: number | null; key: string }
export interface RoomSeat extends RoomItem { label: string; x: number; y: number; is_accessible: boolean; is_blocked: boolean }
export interface RoomTable extends RoomItem, Box {
  has_bookings?: boolean;
  zone_key: string | null; label: string; shape: TableShape;
  min_party: number; max_party: number; is_accessible: boolean; high_chair_ok: boolean;
  combine_group: string | null; is_active: boolean; seats: RoomSeat[];
}
export interface RoomZone extends RoomItem { name: string; kind: ZoneKind; x: number; y: number; w: number; h: number }
export type FixtureKind = "bar" | "kitchen" | "wc" | "column" | "stairs" | "plant" | "stage" | "fireplace" | "tv" | "host_stand" | "awning";
export interface RoomFixture extends RoomItem, Box { kind: FixtureKind; shape: "rect" | "circle"; label: string }
export interface RoomOpening extends RoomItem {
  side: number; offset: number; width: number; kind: "window" | "door" | "glass_wall";
  top_height: number; is_main_entrance: boolean; view_text: string; view_tags: string[];
  night_view_text: string; sun_rule: "auto" | "never" | "between"; sun_from: string | null; sun_until: string | null;
}
export interface Room extends RoomItem {
  name: string; is_outdoor: boolean; north_deg: number | null; outline: Outline; position: number;
  openings: RoomOpening[]; fixtures: RoomFixture[]; zones: RoomZone[]; tables: RoomTable[];
}
export interface RoomLayout { base_version: number; rooms: Room[] }

export function newRoomKey(prefix: string): string { return `${prefix.slice(0, 2)}-${crypto.randomUUID()}`; }

export function createRoom(name: string, width: number, height: number, outdoor = false): Room {
  if (![width, height].every(n => Number.isFinite(n) && n > 0)) throw new Error("Room dimensions must be positive.");
  return {
    id: null, key: newRoomKey("r"), name, is_outdoor: outdoor, north_deg: null, position: 0,
    outline: { points: [{ x: 0, y: 0, curve: 0 }, { x: width, y: 0, curve: 0 }, { x: width, y: height, curve: 0 }, { x: 0, y: height, curve: 0 }] },
    openings: [], fixtures: [], zones: [], tables: [],
  };
}

export function addRoom(layout: RoomLayout, room: Room): RoomLayout {
  if (layout.rooms.length >= 5) throw new Error("A restaurant can have at most five rooms.");
  return { ...layout, rooms: [...layout.rooms, { ...room, position: layout.rooms.length }] };
}

export function replaceRoom(layout: RoomLayout, room: Room): RoomLayout {
  return { ...layout, rooms: layout.rooms.map(existing => existing.key === room.key ? room : existing) };
}
