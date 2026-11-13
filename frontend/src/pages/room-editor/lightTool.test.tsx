import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RoomEditorPage from "./RoomEditorPage";

const VENUE = { public_id: "rest", kind: "restaurant", name: "Test Restaurant", timezone: "Europe/Lisbon", width: 1000, height: 700, zones: [], tables: [], seats: [] };
const OUTLINE = { points: [{ x: 0, y: 0, curve: 0 }, { x: 1000, y: 0, curve: 0 }, { x: 1000, y: 700, curve: 0 }, { x: 0, y: 700, curve: 0 }] };
const PREVIEW = "/api/owner/restaurants/rest/ambience-preview";

function rooms(north: number | null = 0) {
  return {
    version: 3, base_version: 3, problems: [],
    rooms: [{
      id: 12, key: "r12", name: "Dining room", is_outdoor: false, north_deg: north, position: 0, outline: OUTLINE,
      openings: [{ id: 1, key: "o1", side: 2, offset: 300, width: 400, kind: "window", top_height: 220, is_main_entrance: false, view_text: "", view_tags: [], night_view_text: "", sun_rule: "auto", sun_from: null, sun_until: null }],
      fixtures: [], zones: [],
      tables: [{ id: 40, key: "t40", zone_key: null, label: "T1", shape: "rect", x: 460, y: 600, w: 80, h: 80, rotation: 0, min_party: 1, max_party: 4, is_accessible: false, high_chair_ok: false, combine_group: null, is_active: true, has_bookings: false, seats: [] }],
    }],
  };
}

function answer(patch: object = {}) {
  return {
    date: "2026-06-21", time: "13:00", stay_start: "13:00", stay_end: "14:30", located: true,
    sun: { sunrise: "06:12", sunset: "21:05", azimuth: 180, altitude: 74 },
    rooms: [{ id: 12, sun_patches: [[{ x: 300, y: 700 }, { x: 700, y: 700 }, { x: 650, y: 500 }, { x: 350, y: 500 }]], night: false }],
    tables: [{ id: 40, light: "sun", phrases: ["Direct sun until 14:00", "View of the river"], sun_minutes: 60, sun_until: "14:00", sun_from: null, sunset_at: null, dark_at: null, view: null, near: [], quiet: true, features: ["sun"] }],
    ...patch,
  };
}

interface Calls { previews: URLSearchParams[] }

function fakeServer(options: { north?: number | null; light?: () => unknown } = {}): Calls {
  const calls: Calls = { previews: [] };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname.endsWith("/rooms")) return new Response(JSON.stringify(rooms(options.north === undefined ? 0 : options.north)));
    if (url.pathname === PREVIEW) {
      calls.previews.push(url.searchParams);
      return new Response(JSON.stringify((options.light ?? answer)()));
    }
    if (url.pathname === "/api/venues/rest") return new Response(JSON.stringify(VENUE));
    return new Response(JSON.stringify({ error: { code: "not_found", message: "No mock" } }), { status: 404 });
  }));
  return calls;
}

function open(): void {
  render(
    <MemoryRouter initialEntries={["/owner/rest/rooms"]}>
      <Routes>
        <Route path="/owner/:venueId/rooms" element={<RoomEditorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openLight(): Promise<void> {
  open();
  fireEvent.click(await screen.findByRole("button", { name: "Light" }));
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("Light tool", () => {
  it("is switched on, asks for the saved rooms' light at lunch and says where the sun is", async () => {
    const calls = fakeServer();
    await openLight();
    const date = (screen.getByLabelText("Date") as HTMLInputElement).value;
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await waitFor(() => expect(calls.previews).toHaveLength(1));
    expect([calls.previews[0].get("date"), calls.previews[0].get("time")]).toEqual([date, "13:00"]);
    expect(await screen.findByText(/the sun is in the south \(180°\), 74° high\. Sunset at 21:05\./)).toBeTruthy();
  });

  it("draws the sun's patches in the room and the sun on the plan's edge", async () => {
    fakeServer();
    await openLight();
    await waitFor(() => expect(document.querySelector("path.room-sun")).not.toBeNull());
    expect(document.querySelector("path.room-sun")?.getAttribute("fill")).toMatch(/^url\(#.*-sun\)$/); // striped, not just coloured
    expect(document.querySelector(".room-sun-direction")).not.toBeNull();
    expect(document.querySelector(".room-night")).toBeNull();
  });

  it("darkens the room after sunset", async () => {
    fakeServer({ light: () => answer({ rooms: [{ id: 12, sun_patches: [], night: true }], sun: { sunrise: "06:12", sunset: "21:05", azimuth: 330, altitude: -9 } }) });
    await openLight();
    await waitFor(() => expect(document.querySelector(".room-night")).not.toBeNull());
    expect(document.querySelector("path.room-sun")).toBeNull();
    expect(screen.getByText(/below the horizon/)).toBeTruthy();
  });

  it("jumps to the shortcut times", async () => {
    const calls = fakeServer();
    await openLight();
    await waitFor(() => expect(calls.previews).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Dinner 20:30" }));
    await waitFor(() => expect(calls.previews).toHaveLength(2));
    expect(calls.previews[1].get("time")).toBe("20:30");
    expect((screen.getByLabelText("Time of day") as HTMLInputElement).getAttribute("aria-valuetext")).toContain("20:30");
    fireEvent.click(screen.getByRole("button", { name: "Sunset" }));
    await waitFor(() => expect(calls.previews).toHaveLength(3));
    expect(calls.previews[2].get("time")).toBe("21:00"); // 21:05 on the 15-minute grid
  });

  it("asks once, 250 ms after the last move of the slider", async () => {
    const calls = fakeServer();
    await openLight();
    await waitFor(() => expect(calls.previews).toHaveLength(1));
    const slider = screen.getByLabelText("Time of day") as HTMLInputElement;
    expect([slider.min, slider.max, slider.step]).toEqual(["0", "71", "1"]);
    fireEvent.change(slider, { target: { value: "10" } });
    fireEvent.change(slider, { target: { value: "20" } }); // 06:00 + 20 x 15 min = 11:00
    await waitFor(() => expect(calls.previews).toHaveLength(2));
    expect(calls.previews[1].get("time")).toBe("11:00");
    await new Promise((r) => setTimeout(r, 400));
    expect(calls.previews).toHaveLength(2);
  });

  it("describes a table at that time with the same sentences diners get", async () => {
    fakeServer();
    await openLight();
    await screen.findByText(/the sun is in the south/);
    fireEvent.change(screen.getByLabelText("Describe table"), { target: { value: "40" } });
    expect(await screen.findByText("Direct sun until 14:00")).toBeTruthy();
    expect(screen.getByText("View of the river")).toBeTruthy();
  });

  it("explains that nothing can be shown while north is not set", async () => {
    fakeServer({ north: null, light: () => answer({ rooms: [{ id: 12, sun_patches: [], night: false }] }) });
    await openLight();
    expect(await screen.findByText(/Set north \(North tool\) to see sunlight in this room/)).toBeTruthy();
  });

  it("says when the picture is of the saved rooms and the plan has unsaved changes", async () => {
    fakeServer();
    open();
    fireEvent.change(await screen.findByLabelText("Selected room name"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(await screen.findByText(/shows your saved rooms/i)).toBeTruthy();
  });
});

describe("Light tool without a location", () => {
  it("tells the owner to add one", async () => {
    fakeServer({ light: () => answer({ located: false, sun: null, tables: [], rooms: [{ id: 12, sun_patches: [], night: false }] }) });
    await openLight();
    expect(await screen.findByText(/no location yet/i)).toBeTruthy();
    expect(document.querySelector("path.room-sun")).toBeNull();
  });
});
