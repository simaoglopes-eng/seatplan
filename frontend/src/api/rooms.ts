// The owner's room layout: read it, replace it in one go (spec 6.10).
// PUT is all or nothing and carries the version the layout was opened at; a
// 409 "stale_layout" means someone saved in between and nothing was changed.
import type { RoomLayout } from "../pages/room-editor/roomModel";
import { api, ApiError } from "./client";
import type { AmbienceAnswer } from "./restaurant";

/** What the server answers to GET and PUT: the layout with real ids, its version and the problems it found. */
export interface RoomsAnswer extends RoomLayout {
  version: number;
  problems: unknown[];
}

const url = (venueId: string): string => `/owner/restaurants/${encodeURIComponent(venueId)}/rooms`;

export function getRooms(venueId: string): Promise<RoomsAnswer> {
  return api.get<RoomsAnswer>(url(venueId));
}

export function putRooms(venueId: string, layout: RoomLayout): Promise<RoomsAnswer> {
  return api.put<RoomsAnswer>(url(venueId), roomPayload(layout));
}

/** The light of the SAVED rooms on a date and time, for the editor's Light tool. */
export function getLightPreview(venueId: string, date: string, time: string): Promise<AmbienceAnswer> {
  return api.get<AmbienceAnswer>(`${url(venueId).replace(/rooms$/, "ambience-preview")}?${new URLSearchParams({ date, time })}`);
}

/** The layout as the server accepts it: only base_version and rooms, and none of the read-only flags. */
export function roomPayload(layout: RoomLayout): RoomLayout {
  return {
    base_version: layout.base_version,
    rooms: layout.rooms.map((room) => ({
      ...room,
      tables: room.tables.map(({ has_bookings: _read, ...table }) => table),
    })),
  };
}

/** The layout part of an answer. */
export function layoutOf(answer: RoomsAnswer): RoomLayout {
  return { base_version: answer.version, rooms: answer.rooms };
}

/** Tables that block a save because they have bookings (409 "conflict" with a table list), else []. */
export function blockedTables(error: unknown): { id: number; label: string }[] {
  if (!(error instanceof ApiError) || error.status !== 409) return [];
  const tables = error.details?.tables;
  return Array.isArray(tables) ? (tables as { id: number; label: string }[]) : [];
}
