import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RoomEditorPage from "./RoomEditorPage";
import { roomPayload } from "../../api/rooms";

const VENUE = { public_id: "rest", kind: "restaurant", name: "Test Restaurant", timezone: "Europe/Lisbon", width: 1000, height: 700, zones: [], tables: [], seats: [] };
const ROOMS = "/api/owner/restaurants/rest/rooms";

function layout(version: number, name = "Dining room") {
  return {
    version,
    base_version: version,
    problems: [],
    rooms: [
      {
        id: 12, key: "r12", name, is_outdoor: false, north_deg: null, position: 0,
        outline: { points: [{ x: 0, y: 0, curve: 0 }, { x: 1000, y: 0, curve: 0 }, { x: 1000, y: 700, curve: 0 }, { x: 0, y: 700, curve: 0 }] },
        openings: [], fixtures: [], zones: [],
        tables: [{
          id: 40, key: "t40", zone_key: null, label: "T1", shape: "rect", x: 100, y: 100, w: 80, h: 80, rotation: 0, min_party: 1, max_party: 4,
          is_accessible: false, high_chair_ok: false, combine_group: null, is_active: true, has_bookings: true, seats: [],
        }],
      },
    ],
  };
}

interface Server {
  puts: { base_version: number; rooms: { name: string; tables: Record<string, unknown>[] }[] }[];
  gets: number;
}

/** A fake backend: GET returns `current`, PUT answers with whatever `onPut` says. */
function fakeServer(current: () => unknown, onPut: (body: Server["puts"][number]) => Response): Server {
  const server: Server = { puts: [], gets: 0 };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), "http://localhost").pathname;
    const method = init?.method ?? "GET";
    if (path === ROOMS && method === "GET") {
      server.gets += 1;
      return new Response(JSON.stringify(current()));
    }
    if (path === ROOMS && method === "PUT") {
      const body = JSON.parse(String(init?.body)) as Server["puts"][number];
      server.puts.push(body);
      return onPut(body);
    }
    if (path === "/api/venues/rest") return new Response(JSON.stringify(VENUE));
    return new Response(JSON.stringify({ error: { code: "not_found", message: "No mock" } }), { status: 404 });
  }));
  return server;
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

function open(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={["/owner/rest/rooms"]}>
      <Routes>
        <Route path="/owner/:venueId/rooms" element={<RoomEditorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The name in the "Selected room name" field (the same words also appear in the room list). */
const shownName = (): string => (screen.getByLabelText("Selected room name") as HTMLInputElement).value;

async function rename(name: string): Promise<void> {
  fireEvent.change(await screen.findByLabelText("Selected room name"), { target: { value: name } });
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("roomPayload", () => {
  it("sends only what the server accepts: no version echo, no booking flag", () => {
    const body = roomPayload({ base_version: 3, rooms: layout(3).rooms as never });
    expect(Object.keys(body)).toEqual(["base_version", "rooms"]);
    expect(body.rooms[0].tables[0]).not.toHaveProperty("has_bookings");
    expect(body.rooms[0].tables[0].label).toBe("T1");
  });
});

describe("Room editor persistence", () => {
  it.each([{}, { layout: { rooms: [] } }, { base_version: 5, saved_at: "2026-11-13T10:00:00Z", layout: { base_version: 5, rooms: [{ name: "Damaged" }] } }])("ignores damaged local data and still opens the saved rooms (%j)", async damaged => {
    fakeServer(() => layout(5), () => json({}));
    window.localStorage.setItem("seatplan.room-draft.rest", JSON.stringify(damaged));
    open();
    await screen.findByRole("heading", { name: "Room editor" });
    expect(shownName()).toBe("Dining room");
    expect(screen.queryByText(/unsaved changes from this device/i)).toBeNull();
  });
  it("explains when an invalid edit has taken a published restaurant back to draft", async () => {
    fakeServer(() => ({ ...layout(5), status: "published" }), () => json({ ...layout(6, "Changed"), status: "draft" }));
    open();
    await rename("Changed");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/saved as a draft.*new bookings/i)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Saved");
  });
  it("opens the saved layout and keeps Save off until something changes", async () => {
    fakeServer(() => layout(5), () => json({}));
    open();
    await screen.findByRole("heading", { name: "Room editor" });
    await waitFor(() => expect(shownName()).toBe("Dining room"));
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toBe("Saved");
    await rename("Garden room");
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("status").textContent).toBe("Unsaved");
  });

  it("saves the whole layout at its base version and shows the new version as saved", async () => {
    const server = fakeServer(() => layout(5), () => json(layout(6, "Garden room")));
    open();
    await rename("Garden room");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Saved"));
    expect(server.puts).toHaveLength(1);
    expect(server.puts[0].base_version).toBe(5);
    expect(server.puts[0].rooms[0].name).toBe("Garden room");
    expect(server.puts[0].rooms[0].tables[0]).not.toHaveProperty("has_bookings");
    expect(window.localStorage.getItem("seatplan.room-draft.rest")).toBeNull();
    // The next save builds on version 6.
    await rename("Garden room 2");
    server.puts.length = 0;
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(server.puts).toHaveLength(1));
    expect(server.puts[0].base_version).toBe(6);
  });

  it("keeps unsaved work on this device and offers it back after a reload", async () => {
    fakeServer(() => layout(5), () => json({}));
    const first = open();
    await rename("Half finished");
    await waitFor(() => expect(window.localStorage.getItem("seatplan.room-draft.rest")).toContain("Half finished"));
    first.unmount();

    open();
    expect(await screen.findByText(/unsaved changes from this device/i)).toBeTruthy();
    expect(shownName()).toBe("Dining room"); // the saved layout is on screen until the owner chooses
    fireEvent.click(screen.getByRole("button", { name: "Restore my changes" }));
    await waitFor(() => expect(shownName()).toBe("Half finished"));
    expect(screen.queryByText(/unsaved changes from this device/i)).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Unsaved");
  });

  it("can throw the local draft away", async () => {
    fakeServer(() => layout(5), () => json({}));
    const first = open();
    await rename("Not wanted");
    await waitFor(() => expect(window.localStorage.getItem("seatplan.room-draft.rest")).not.toBeNull());
    first.unmount();
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Discard my changes" }));
    expect(window.localStorage.getItem("seatplan.room-draft.rest")).toBeNull();
    expect(shownName()).toBe("Dining room");
  });

  it("does not offer a draft that equals the saved layout", async () => {
    fakeServer(() => layout(5), () => json({}));
    window.localStorage.setItem("seatplan.room-draft.rest", JSON.stringify({ base_version: 5, saved_at: "2026-11-13T10:00:00Z", layout: { base_version: 5, rooms: layout(5).rooms } }));
    open();
    await waitFor(() => expect(shownName()).toBe("Dining room"));
    expect(screen.queryByText(/unsaved changes from this device/i)).toBeNull();
  });
});

describe("A second tab saved first", () => {
  const stale = () => json({ error: { code: "stale_layout", message: "This layout was changed in another tab or device." } }, 409);

  it("keeps the owner's work, says why, and keeps it on this device", async () => {
    fakeServer(() => layout(7, "Other tab's name"), () => stale());
    open();
    await rename("My work");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/changed in another tab or device/i)).toBeTruthy();
    expect(shownName()).toBe("My work");
    expect(window.localStorage.getItem("seatplan.room-draft.rest")).toContain("My work");
  });

  it("can load the latest version and drop the draft", async () => {
    let current = layout(5);
    fakeServer(() => current, () => stale());
    open();
    await rename("My work");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(/changed in another tab or device/i);
    current = layout(7, "Other tab's name");
    fireEvent.click(screen.getByRole("button", { name: "Discard mine and load the latest" }));
    await waitFor(() => expect(shownName()).toBe("Other tab's name"));
    expect(window.localStorage.getItem("seatplan.room-draft.rest")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Saved");
  });

  it("can save the owner's version on top of the latest one", async () => {
    let current = layout(5);
    let attempts = 0;
    const server = fakeServer(() => current, () => (++attempts === 1 ? stale() : json(layout(8, "My work"))));
    open();
    await rename("My work");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(/changed in another tab or device/i);
    current = layout(7, "Other tab's name");
    fireEvent.click(screen.getByRole("button", { name: "Save mine over it" }));
    await waitFor(() => expect(server.puts).toHaveLength(2));
    expect(server.puts[1].base_version).toBe(7); // rebased on what the other tab saved
    expect(server.puts[1].rooms[0].name).toBe("My work");
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Saved"));
  });
});

describe("Tables with bookings", () => {
  it("names the table and points to Available for booking instead of losing work", async () => {
    fakeServer(() => layout(5), () => json({ error: { code: "conflict", message: "This table has bookings. Make it unavailable instead.", tables: [{ id: 40, label: "T1" }] } }, 409));
    open();
    await rename("Changed");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByText(/Table T1 has bookings/);
    expect(alert.textContent).toMatch(/Available for booking/);
    expect(shownName()).toBe("Changed"); // nothing was lost
    await act(async () => undefined);
  });
});
