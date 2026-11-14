import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerDinerMap } from "../../../api/restaurant";
import type { MapRoom, MapTableAmbience } from "../../../api/types";
import BookingPage from "../BookingPage";
import { INFO, SLOTS, VENUE, dinerMap, heldTable } from "./fixtures";
import { callsTo, mockApi } from "./mockApi";

const API = `/api/r/${VENUE}`;
const OUTLINE = { points: [{ x: 0, y: 0, curve: 0 }, { x: 600, y: 0, curve: 0 }, { x: 600, y: 300, curve: 0 }, { x: 0, y: 300, curve: 0 }] };

function ambience(patch: Partial<MapTableAmbience> = {}): MapTableAmbience {
  return {
    light: "sun", phrases: ["Direct sun until 14:00", "View of the river"], sun_minutes: 60, sun_until: "14:00", sun_from: null,
    sunset_at: null, dark_at: null, view: { text: "river", tags: ["river"], night_text: "", photo_url: "/api/photos/abc", distance_cm: 80 },
    near: [], quiet: true, features: ["sun", "view", "quiet"], ...patch,
  };
}

function room(id: number, name: string, patch: Partial<MapRoom> = {}): MapRoom {
  return {
    id, name, is_outdoor: false, north_deg: 0, outline: OUTLINE, width: 600, height: 300, openings: [], fixtures: [],
    sun: { sunrise: "06:12", sunset: "21:05", azimuth: 150, altitude: 70 },
    sun_patches: [[{ x: 10, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 90 }]], night: false, ...patch,
  };
}

/** The standard map (tables 7, 8, 9, 10) with two rooms: 7 and 8 inside, 9 and 10 on the terrace. */
function roomsMap(): ServerDinerMap {
  const base = dinerMap();
  return {
    ...base,
    stay_start: "13:00",
    stay_end: "14:30",
    rooms: [room(1, "Main room"), room(2, "Terrace", { is_outdoor: true })],
    tables: base.tables.map((t) => ({ ...t, room_id: t.id <= 8 ? 1 : 2, is_active: true, ambience: ambience() })),
  };
}

function renderBooking(): void {
  render(
    <MemoryRouter initialEntries={[`/r/${VENUE}`]}>
      <Routes>
        <Route path="/r/:venueId" element={<BookingPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function reachTableStep(): Promise<void> {
  renderBooking();
  fireEvent.click(await screen.findByRole("button", { name: "See free times" }));
  fireEvent.click(await screen.findByRole("button", { name: /19:30/ }));
  await screen.findByRole("heading", { name: "Choose your table" });
}

function answer(patch: object = {}) {
  return {
    date: "2026-11-12", time: "14:15", stay_start: "13:00", stay_end: "14:30", located: true,
    sun: { sunrise: "06:12", sunset: "21:05", azimuth: 170, altitude: 66 },
    rooms: [{ id: 1, sun_patches: [], night: true }, { id: 2, sun_patches: [], night: true }],
    tables: [{ id: 7, light: "shade", phrases: ["In the shade"] }],
    ...patch,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Table step with rooms", () => {
  it("offers a tab per room with the free tables of each, and shows one room at a time", async () => {
    mockApi({ [`GET ${API}`]: () => INFO, [`GET ${API}/slots`]: () => SLOTS, [`GET ${API}/map`]: () => roomsMap() });
    await reachTableStep();
    const tabs = screen.getByRole("tablist", { name: "Rooms" });
    expect(within(tabs).getByRole("tab", { name: /Main room.*2 free/ }).getAttribute("aria-selected")).toBe("true");
    expect(within(tabs).getByRole("tab", { name: /Terrace.*0 free/ })).toBeTruthy(); // 9 is booked, 10 is too small
    const map = screen.getByRole("listbox", { name: /Floor plan/ });
    expect(within(map).getByRole("option", { name: /Table 7,/ })).toBeTruthy();
    expect(within(map).queryByRole("option", { name: /Table 9,/ })).toBeNull();
    fireEvent.click(within(tabs).getByRole("tab", { name: /Terrace/ }));
    expect(within(screen.getByRole("listbox", { name: /Floor plan/ })).getByRole("option", { name: /Table 9,/ })).toBeTruthy();
    expect(within(screen.getByRole("listbox", { name: /Floor plan/ })).queryByRole("option", { name: /Table 7,/ })).toBeNull();
  });

  it("shows no tabs when there is only one room, and no room at all for an old answer", async () => {
    const single = { ...roomsMap(), rooms: [room(1, "Main room")] };
    mockApi({ [`GET ${API}`]: () => INFO, [`GET ${API}/slots`]: () => SLOTS, [`GET ${API}/map`]: () => single });
    await reachTableStep();
    expect(screen.queryByRole("tablist", { name: "Rooms" })).toBeNull();
    expect(screen.getByRole("option", { name: /Table 9,/ })).toBeTruthy(); // every table of the one room
  });

  it("leaves the map exactly as before when the answer has no rooms", async () => {
    mockApi({ [`GET ${API}`]: () => INFO, [`GET ${API}/slots`]: () => SLOTS, [`GET ${API}/map`]: () => dinerMap() });
    await reachTableStep();
    expect(screen.queryByRole("tablist", { name: "Rooms" })).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
    expect(document.querySelector("[data-room]")).toBeNull();
  });

  it("follows a hold into another room, keeping the hold", async () => {
    mockApi({
      [`GET ${API}`]: () => INFO,
      [`GET ${API}/slots`]: () => SLOTS,
      [`GET ${API}/map`]: () => roomsMap(),
      [`POST ${API}/hold`]: () => heldTable(8, "8"),
    });
    await reachTableStep();
    fireEvent.click(within(screen.getByRole("tablist", { name: "Rooms" })).getByRole("tab", { name: /Terrace/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "Hold table 8" })[0]); // from the list, which shows every room
    expect(await screen.findByRole("timer")).toBeTruthy();
    expect(within(screen.getByRole("tablist", { name: "Rooms" })).getByRole("tab", { name: /Main room/ }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("Ambience card", () => {
  it("describes the suggested table with its sentences and photo, and holds it from the card", async () => {
    const calls = mockApi({
      [`GET ${API}`]: () => INFO,
      [`GET ${API}/slots`]: () => SLOTS,
      [`GET ${API}/map`]: () => roomsMap(),
      [`POST ${API}/hold`]: () => heldTable(7, "7"),
    });
    await reachTableStep();
    const card = screen.getByRole("region", { name: /Table 7/ });
    expect(within(card).getByText("Direct sun until 14:00")).toBeTruthy();
    expect(within(card).getByText("View of the river")).toBeTruthy();
    expect(within(card).getByRole("img", { name: "river" }).getAttribute("src")).toBe("/api/photos/abc");
    fireEvent.click(within(card).getByRole("button", { name: "Hold this table" }));
    expect(await screen.findByRole("timer")).toBeTruthy();
    expect(callsTo(calls, "POST", `${API}/hold`)[0]?.body).toMatchObject({ table_id: 7 });
  });

  it("switches to the table the pointer is over", async () => {
    mockApi({ [`GET ${API}`]: () => INFO, [`GET ${API}/slots`]: () => SLOTS, [`GET ${API}/map`]: () => roomsMap() });
    await reachTableStep();
    fireEvent.pointerEnter(screen.getByRole("option", { name: /Table 8,/ }));
    expect(screen.getByRole("region", { name: /Table 8/ })).toBeTruthy();
  });

  it("shows no card, and so no claim about light, for tables without ambience", async () => {
    const plain = roomsMap();
    plain.tables = plain.tables.map((t) => ({ ...t, ambience: null }));
    mockApi({ [`GET ${API}`]: () => INFO, [`GET ${API}/slots`]: () => SLOTS, [`GET ${API}/map`]: () => plain });
    await reachTableStep();
    expect(screen.queryByRole("region", { name: /Table 7/ })).toBeNull();
  });
});

describe("Light cursor", () => {
  it("steps through the stay and redraws the light once things settle, without touching the hold", async () => {
    const calls = mockApi({
      [`GET ${API}`]: () => INFO,
      [`GET ${API}/slots`]: () => SLOTS,
      [`GET ${API}/map`]: () => roomsMap(),
      [`POST ${API}/hold`]: () => heldTable(7, "7"),
      [`GET ${API}/ambience`]: () => answer(),
    });
    await reachTableStep();
    fireEvent.click(screen.getAllByRole("button", { name: "Hold table 7" })[0]);
    await screen.findByRole("timer");
    const mapCalls = callsTo(calls, "GET", `${API}/map`).length;

    const slider = screen.getByRole("slider", { name: /Preview room light.*does not change booking time/i }) as HTMLInputElement;
    expect([slider.min, slider.max, slider.step]).toEqual(["0", "6", "1"]); // 13:00 ... 14:30 in 15-minute steps
    expect(slider.getAttribute("aria-valuetext")).toContain("13:00");
    expect(document.querySelector(".room-night")).toBeNull();

    fireEvent.change(slider, { target: { value: "3" } });
    fireEvent.change(slider, { target: { value: "5" } }); // quick second move: only the last one is asked for
    await waitFor(() => expect(callsTo(calls, "GET", `${API}/ambience`)).toHaveLength(1));
    const asked = callsTo(calls, "GET", `${API}/ambience`)[0].query;
    expect([asked.get("time"), asked.get("moment"), asked.get("party")]).toEqual(["19:30", "14:15", "2"]);

    await waitFor(() => expect(document.querySelector(".room-night")).not.toBeNull());
    expect(screen.getByRole("timer")).toBeTruthy(); // the hold survived
    expect(callsTo(calls, "GET", `${API}/map`)).toHaveLength(mapCalls); // and the map was not fetched again
    expect(slider.getAttribute("aria-valuetext")).toContain("14:15");
  });

  it("is not offered when the restaurant has no coordinates, so no sun can be shown", async () => {
    const unlocated = roomsMap();
    unlocated.rooms = unlocated.rooms?.map((r) => ({ ...r, sun: null, sun_patches: [] }));
    mockApi({ [`GET ${API}`]: () => INFO, [`GET ${API}/slots`]: () => SLOTS, [`GET ${API}/map`]: () => unlocated });
    await reachTableStep();
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("says so, and keeps the last picture, when the light cannot be loaded", async () => {
    mockApi({
      [`GET ${API}`]: () => INFO,
      [`GET ${API}/slots`]: () => SLOTS,
      [`GET ${API}/map`]: () => roomsMap(),
      [`GET ${API}/ambience`]: () => new Response(JSON.stringify({ error: { code: "x", message: "down" } }), { status: 500 }),
    });
    await reachTableStep();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "2" } });
    expect(await screen.findByText(/could not update the light/i)).toBeTruthy();
    expect(document.querySelector("[data-room]")).not.toBeNull();
    await act(async () => undefined);
  });
});

describe("Map key", () => {
  it("shows three looks and no more: available, your table and unavailable", async () => {
    mockApi({ [`GET ${API}`]: () => INFO, [`GET ${API}/slots`]: () => SLOTS, [`GET ${API}/map`]: () => roomsMap() });
    await reachTableStep();
    const key = screen.getByRole("list", { name: "Map key" });
    expect(within(key).getAllByRole("listitem").map((li) => li.querySelector("strong")?.textContent)).toEqual(["Available", "Your table", "Unavailable"]);
  });

  it("explains sun, night and the view once, in a sentence by the plan, only when there are rooms", async () => {
    mockApi({ [`GET ${API}`]: () => INFO, [`GET ${API}/slots`]: () => SLOTS, [`GET ${API}/map`]: () => roomsMap() });
    await reachTableStep();
    expect(screen.getByText(/striped yellow is where the sun reaches the floor, dark blue is after sunset/)).toBeTruthy();
  });

  it("says nothing about sun when there are no rooms", async () => {
    mockApi({ [`GET ${API}`]: () => INFO, [`GET ${API}/slots`]: () => SLOTS, [`GET ${API}/map`]: () => dinerMap() });
    await reachTableStep();
    expect(screen.queryByText(/striped yellow/)).toBeNull();
    expect(within(screen.getByRole("list", { name: "Map key" })).getAllByRole("listitem")).toHaveLength(3);
  });

  it("draws booked, being chosen and not-suiting tables with one look, but still names each reason to a screen reader", async () => {
    const map = dinerMap({ 9: { state: "held" }, 10: { state: "taken" } });
    mockApi({ [`GET ${API}`]: () => INFO, [`GET ${API}/slots`]: () => SLOTS, [`GET ${API}/map`]: () => map });
    await reachTableStep();
    for (const [table, words] of [["9", "someone else is choosing it"], ["10", "booked"]] as const) {
      const option = screen.getByRole("option", { name: new RegExp(`^Table ${table},`) });
      expect(option.getAttribute("aria-label")).toContain(words);
      expect(option.getAttribute("class")).toContain("state-taken");
    }
  });
});

describe("Choosing a table on the map", () => {
  it("a tap only chooses the table and shows its card; holding is a second, deliberate step", async () => {
    const calls = mockApi({
      [`GET ${API}`]: () => INFO,
      [`GET ${API}/slots`]: () => SLOTS,
      [`GET ${API}/map`]: () => roomsMap(),
      [`POST ${API}/hold`]: () => heldTable(8, "8"),
    });
    await reachTableStep();
    fireEvent.click(screen.getByRole("option", { name: /Table 8,/ }));
    expect(callsTo(calls, "POST", `${API}/hold`)).toHaveLength(0);
    expect(await screen.findByText(/Table 8 selected\. Use Hold this table to reserve it\./)).toBeTruthy();
    const card = screen.getByRole("region", { name: /Table 8/ });
    fireEvent.click(within(card).getByRole("button", { name: "Hold this table" }));
    expect(await screen.findByRole("timer")).toBeTruthy();
    expect(callsTo(calls, "POST", `${API}/hold`)[0]?.body).toMatchObject({ table_id: 8 });
  });

  it("still lets the diner hold a chosen table when the restaurant has no ambience to tell", async () => {
    const plain = roomsMap();
    plain.tables = plain.tables.map((t) => ({ ...t, ambience: null }));
    const calls = mockApi({
      [`GET ${API}`]: () => INFO,
      [`GET ${API}/slots`]: () => SLOTS,
      [`GET ${API}/map`]: () => plain,
      [`POST ${API}/hold`]: () => heldTable(7, "7"),
    });
    await reachTableStep();
    expect(screen.queryByRole("region", { name: /Table 7/ })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: /Table 7,/ }));
    const card = await screen.findByRole("region", { name: /Table 7/ });
    expect(within(card).queryByText(/sun|shade|dark/i)).toBeNull(); // nothing is claimed about the light
    fireEvent.click(within(card).getByRole("button", { name: "Hold this table" }));
    expect(await screen.findByRole("timer")).toBeTruthy();
    expect(callsTo(calls, "POST", `${API}/hold`)).toHaveLength(1);
  });
});


describe("Step 2: suggested table already selected, and an unambiguous light preview", () => {
  it("opens with the best table selected, ticked and announced, and its card showing why", async () => {
    mockApi({ [`GET ${API}`]: () => INFO, [`GET ${API}/slots`]: () => SLOTS, [`GET ${API}/map`]: () => roomsMap() });
    await reachTableStep();
    const suggested = screen.getByRole("option", { name: /Table 7,/ });
    expect(suggested.getAttribute("aria-selected")).toBe("true");
    expect(suggested.querySelector(".selected-tick")).not.toBeNull(); // outlined and ticked, not drawn as held
    expect(screen.getByRole("option", { name: /Table 8,/ }).getAttribute("aria-selected")).toBe("false");
    expect(await screen.findByText(/Table 7 is suggested for you and already selected\. Use Hold this table to reserve it\./)).toBeTruthy();
    expect(screen.queryByRole("timer")).toBeNull(); // nothing is held until the diner says so
  });

  it("reserves the suggested table in one tap on the card, and gives way to whatever the diner points at", async () => {
    const calls = mockApi({
      [`GET ${API}`]: () => INFO,
      [`GET ${API}/slots`]: () => SLOTS,
      [`GET ${API}/map`]: () => roomsMap(),
      [`POST ${API}/hold`]: () => heldTable(7, "7"),
    });
    await reachTableStep();
    fireEvent.pointerEnter(screen.getByRole("option", { name: /Table 8,/ }));
    expect(screen.getByRole("region", { name: /Table 8/ })).toBeTruthy();
    fireEvent.pointerLeave(screen.getByRole("option", { name: /Table 8,/ }));
    fireEvent.click(within(screen.getByRole("region", { name: /Table 7/ })).getByRole("button", { name: "Hold this table" }));
    expect(await screen.findByRole("timer")).toBeTruthy();
    expect(callsTo(calls, "POST", `${API}/hold`)[0]?.body).toMatchObject({ table_id: 7 });
  });

  it("keeps a table the diner chose, even when the pointer leaves for another", async () => {
    mockApi({ [`GET ${API}`]: () => INFO, [`GET ${API}/slots`]: () => SLOTS, [`GET ${API}/map`]: () => roomsMap() });
    await reachTableStep();
    fireEvent.click(screen.getByRole("option", { name: /Table 8,/ }));
    fireEvent.pointerEnter(screen.getByRole("option", { name: /Table 7,/ }));
    expect(screen.getByRole("region", { name: /Table 8/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Table 8,/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("option", { name: /Table 7,/ }).getAttribute("aria-selected")).toBe("false");
  });

  it("says the preview does not change the booking time, shows the booked stay and where the sun sets", async () => {
    mockApi({ [`GET ${API}`]: () => INFO, [`GET ${API}/slots`]: () => SLOTS, [`GET ${API}/map`]: () => roomsMap(), [`GET ${API}/ambience`]: () => answer() });
    await reachTableStep();
    const slider = screen.getByRole("slider", { name: "Preview room light (does not change booking time)" }) as HTMLInputElement;
    expect(screen.getByText("Your booking 13:00 → 14:30")).toBeTruthy();
    expect(screen.getByText(/Showing the room at 13:00\. Your booking is at 19:30\./)).toBeTruthy();
    fireEvent.change(slider, { target: { value: "3" } });
    expect(screen.getByText(/Previewing the room at 13:45\. Your booking is at 19:30\./)).toBeTruthy();
  });
});
