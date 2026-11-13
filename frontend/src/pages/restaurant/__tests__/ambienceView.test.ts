import { describe, expect, it } from "vitest";
import type { AmbienceAnswer, DinerMap, DinerTable } from "../../../api/restaurant";
import type { MapRoom, MapSeat, MapTableAmbience } from "../../../api/types";
import { applyAmbience, cursorSteps, lightWords, roomTabs, seatsInRoom, tablesInRoom } from "../ambienceView";

function ambience(patch: Partial<MapTableAmbience> = {}): MapTableAmbience {
  return {
    light: "sun", phrases: ["Direct sun until 14:00"], sun_minutes: 60, sun_until: "14:00", sun_from: null, sunset_at: null, dark_at: null,
    view: null, near: [], quiet: true, features: ["sun", "quiet"], ...patch,
  };
}

function table(id: number, roomId: number | null, extra: Partial<DinerTable> = {}): DinerTable {
  return {
    id, label: String(id), shape: "rect", x: 0, y: 0, w: 60, h: 60, rotation: 0, state: "free", min_party: 1, max_party: 4,
    high_chair_ok: false, fits_party: true, room_id: roomId, ambience: ambience(), ...extra,
  };
}

function room(id: number | null, name: string, patch: Partial<MapRoom> = {}): MapRoom {
  return {
    id, name, is_outdoor: false, north_deg: 0, outline: { points: [] }, width: 1000, height: 600, openings: [], fixtures: [],
    sun: null, sun_patches: [], night: false, ...patch,
  };
}

function map(tables: DinerTable[], rooms: MapRoom[]): DinerMap {
  return { width: 1000, height: 600, zones: [], tables, seats: [], rooms, recommended: null, stay_start: "13:00", stay_end: "14:30" };
}

describe("roomTabs", () => {
  it("counts the free tables of each room, and only those that suit the party", () => {
    const tables = [table(1, 10), table(2, 10, { state: "taken" }), table(3, 10, { fits_party: false }), table(4, 20)];
    const tabs = roomTabs(map(tables, [room(10, "Main room"), room(20, "Terrace")]));
    expect(tabs).toEqual([
      { id: 10, name: "Main room", free: 1 },
      { id: 20, name: "Terrace", free: 1 },
    ]);
  });

  it("gives no tabs for a single room, since there is nothing to choose", () => {
    expect(roomTabs(map([table(1, null)], [room(null, "Main room")]))).toEqual([]);
    expect(roomTabs(map([], []))).toEqual([]);
  });

  it("treats a table without a room as part of the implicit room", () => {
    const tabs = roomTabs(map([table(1, null), table(2, 20)], [room(null, "Main room"), room(20, "Terrace")]));
    expect(tabs.map((t) => [t.id, t.free])).toEqual([[null, 1], [20, 1]]);
  });
});

describe("tablesInRoom and seatsInRoom", () => {
  const tables = [table(1, 10), table(2, 20), table(3, null)];
  const seats: MapSeat[] = [1, 2, 3].map((t) => ({ id: t * 10, table_id: t, label: "1", x: 0, y: 0, state: "free", accessible: false }));

  it("keeps the tables of one room, the implicit room being room_id null", () => {
    expect(tablesInRoom(tables, 10).map((t) => t.id)).toEqual([1]);
    expect(tablesInRoom(tables, null).map((t) => t.id)).toEqual([3]);
  });

  it("returns everything when no room is chosen (undefined)", () => {
    expect(tablesInRoom(tables, undefined).map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it("keeps only the seats of those tables", () => {
    expect(seatsInRoom(seats, tablesInRoom(tables, 20)).map((s) => s.id)).toEqual([20]);
  });
});

describe("cursorSteps", () => {
  it("lists every 15 minutes from the start to the end of the stay, both included", () => {
    expect(cursorSteps("13:00", "14:30")).toEqual(["13:00", "13:15", "13:30", "13:45", "14:00", "14:15", "14:30"]);
  });

  it("copes with a stay that crosses midnight", () => {
    expect(cursorSteps("23:00", "00:30")).toEqual(["23:00", "23:15", "23:30", "23:45", "00:00", "00:15", "00:30"]);
  });

  it("has just the start for an empty or missing stay", () => {
    expect(cursorSteps("13:00", "13:00")).toEqual(["13:00"]);
    expect(cursorSteps(undefined, undefined)).toEqual([]);
  });
});

describe("applyAmbience", () => {
  const original = map([table(1, 10), table(2, 10)], [room(10, "Main room", { sun_patches: [[{ x: 0, y: 0 }]], night: false })]);
  const answer: AmbienceAnswer = {
    date: "2026-06-21", time: "14:15", stay_start: "13:00", stay_end: "14:30", located: true,
    sun: { sunrise: "06:12", sunset: "21:05", azimuth: 160, altitude: 68 },
    rooms: [{ id: 10, sun_patches: [], night: true }],
    tables: [{ id: 1, light: "shade", phrases: ["In the shade"] }],
  };

  it("moves the sun patches, the night veil and the sun of each room", () => {
    const next = applyAmbience(original, answer);
    expect(next.rooms?.[0]).toMatchObject({ sun_patches: [], night: true, sun: { azimuth: 160 } });
  });

  it("replaces the light and sentences of the tables it knows and keeps their other facts", () => {
    const next = applyAmbience(original, answer);
    expect(next.tables[0].ambience).toMatchObject({ light: "shade", phrases: ["In the shade"], quiet: true, view: null });
    expect(next.tables[1].ambience?.phrases).toEqual(["Direct sun until 14:00"]); // not in the answer: untouched
  });

  it("changes nothing else: tables, states and the recommendation stay the same objects", () => {
    const next = applyAmbience(original, answer);
    expect(next.tables[1]).toBe(original.tables[1]);
    expect(next.recommended).toBe(original.recommended);
    expect(next.seats).toBe(original.seats);
  });

  it("leaves a map without rooms alone", () => {
    const plain = { ...original, rooms: undefined };
    expect(applyAmbience(plain, answer).rooms).toBeUndefined();
  });
});

describe("lightWords", () => {
  it("names each light in plain English for the card", () => {
    expect(lightWords("sun")).toBe("In the sun");
    expect(lightWords("night")).toBe("After dark");
    expect(lightWords("interior")).toBe("Away from the windows");
  });
});
