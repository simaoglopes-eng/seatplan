// What the diner map needs for rooms and light, as pure functions (tested on
// their own): the room tabs with their free counts, the tables and chairs of
// one room, the steps of the light cursor and the merge of the cursor's answer
// into the map. Nothing here fetches or touches the DOM.
import type { AmbienceAnswer, DinerMap } from "../../api/restaurant";
import type { MapSeat, RoomLight } from "../../api/types";
import { fromMinutes, toMinutes } from "./format";
import { isPickable } from "./tableView";

export interface RoomTab {
  /** null is the implicit room of a restaurant that never saved one. */
  id: number | null;
  name: string;
  /** Tables of this room the party could pick right now. */
  free: number;
}

const roomOf = (table: { room_id?: number | null }): number | null => table.room_id ?? null;

/** One tab per room, with its free tables. A single room needs no tabs. */
export function roomTabs(map: DinerMap): RoomTab[] {
  const rooms = map.rooms ?? [];
  if (rooms.length < 2) return [];
  return rooms.map((room) => ({
    id: room.id,
    name: room.name,
    free: map.tables.filter((table) => roomOf(table) === room.id && isPickable(table)).length,
  }));
}

/** The tables of one room (null: the implicit room). `undefined` means every room. */
export function tablesInRoom<T extends { room_id?: number | null }>(tables: T[], roomId: number | null | undefined): T[] {
  return roomId === undefined ? tables : tables.filter((table) => roomOf(table) === roomId);
}

export function seatsInRoom(seats: MapSeat[], tables: { id: number }[]): MapSeat[] {
  const ids = new Set(tables.map((table) => table.id));
  return seats.filter((seat) => ids.has(seat.table_id));
}

const DAY = 24 * 60;
const STEP = 15;

/** Every 15 minutes from the start to the end of the stay, both included ("13:00" ... "14:30"). */
export function cursorSteps(start: string | undefined, end: string | undefined): string[] {
  if (!start || !end) return [];
  const from = toMinutes(start);
  let to = toMinutes(end);
  if (to < from) to += DAY; // a stay that runs past midnight
  const steps: string[] = [];
  for (let minutes = from; minutes <= to; minutes += STEP) steps.push(fromMinutes(minutes % DAY));
  return steps;
}

/** The cursor's answer laid over the map: where the sun falls, whether it is dark, and each table's light. */
export function applyAmbience(map: DinerMap, answer: AmbienceAnswer): DinerMap {
  if (!map.rooms) return map;
  const byRoom = new Map(answer.rooms.map((room) => [room.id, room]));
  const byTable = new Map(answer.tables.map((table) => [table.id, table]));
  return {
    ...map,
    rooms: map.rooms.map((room) => {
      const lit = byRoom.get(room.id);
      return lit ? { ...room, sun_patches: lit.sun_patches, night: lit.night, sun: answer.sun ?? room.sun } : room;
    }),
    tables: map.tables.map((table) => {
      const found = byTable.get(table.id);
      if (!found || !table.ambience) return table;
      return { ...table, ambience: { ...table.ambience, light: found.light, phrases: found.phrases } };
    }),
  };
}

/** The room a diner should see first: the one with the table we suggest, else the first. */
export function defaultRoom(map: DinerMap, tabs: RoomTab[]): number | null {
  const suggested = map.recommended ? map.tables.find((table) => table.id === map.recommended?.table_ids[0]) : undefined;
  if (suggested && tabs.some((tab) => tab.id === roomOf(suggested))) return roomOf(suggested);
  return tabs[0]?.id ?? null;
}

const LIGHT_WORDS: Record<RoomLight, string> = {
  sun: "In the sun",
  sunset: "Sunset light",
  shade: "In the shade",
  daylight: "Daylight from the windows",
  interior: "Away from the windows",
  night: "After dark",
};

export function lightWords(light: RoomLight): string {
  return LIGHT_WORDS[light];
}
