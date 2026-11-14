// Step 3 (v3): one card per table, a key that follows the hold, a suggestion in another room, and the
// chair request that lives inside the details form.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerDinerMap } from "../../../api/restaurant";
import type { MapRoom } from "../../../api/types";
import BookingPage from "../BookingPage";
import { INFO, SLOTS, VENUE, dinerMap, heldTable } from "./fixtures";
import { mockApi } from "./mockApi";

const API = `/api/r/${VENUE}`;
const OUTLINE = { points: [{ x: 0, y: 0, curve: 0 }, { x: 600, y: 0, curve: 0 }, { x: 600, y: 300, curve: 0 }, { x: 0, y: 300, curve: 0 }] };

function room(id: number, name: string): MapRoom {
  return { id, name, is_outdoor: false, north_deg: 0, outline: OUTLINE, width: 600, height: 300, openings: [], fixtures: [], sun: null, sun_patches: [], night: false };
}

/** Tables 7 and 8 in the Main room, 9 and 10 on the Terrace; 9 is booked and 10 is too small, so the Terrace has nothing to offer. */
function roomsMap(): ServerDinerMap {
  const base = dinerMap();
  return { ...base, rooms: [room(1, "Main room"), room(2, "Terrace")], tables: base.tables.map((t) => ({ ...t, room_id: t.id <= 8 ? 1 : 2, is_active: true, ambience: null })) };
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

const routes = (map: () => ServerDinerMap = roomsMap) => ({
  [`GET ${API}`]: () => INFO,
  [`GET ${API}/slots`]: () => SLOTS,
  [`GET ${API}/map`]: map,
  [`POST ${API}/hold`]: () => heldTable(7, "7"),
});

afterEach(() => vi.unstubAllGlobals());

describe("One card per table", () => {
  it("shows the suggested table once, as Recommended, with its room and the one action", async () => {
    mockApi(routes());
    await reachTableStep();
    const cards = screen.getAllByRole("region", { name: /^Table \d/ });
    expect(cards).toHaveLength(1);
    expect(within(cards[0]).getByText("Recommended")).toBeTruthy();
    expect(within(cards[0]).getByRole("heading", { name: /Table 7/ })).toBeTruthy();
    expect(within(cards[0]).getByText("Main room")).toBeTruthy();
    expect(within(cards[0]).getByRole("button", { name: "Hold 7 & continue" })).toBeTruthy();
    expect(screen.queryByText("Our suggestion")).toBeNull();
    // "Choose for me" is still there, but as the quiet alternative.
    expect(screen.getByRole("button", { name: "Choose for me" })).toBeTruthy();
  });

  it("offers our suggestion again when the diner chose another table, and takes it back on a tap", async () => {
    mockApi(routes());
    await reachTableStep();
    fireEvent.click(screen.getByRole("option", { name: /Table 8,/ }));
    expect(within(screen.getByRole("region", { name: /^Table 8/ })).queryByText("Recommended")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Use suggested table 7" }));
    expect(within(screen.getByRole("region", { name: /^Table 7/ })).getByText("Recommended")).toBeTruthy();
    expect(screen.getByRole("option", { name: /Table 7,/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("describes a table of the room on screen, and links to a suggestion in another room", async () => {
    mockApi(routes());
    await reachTableStep();
    fireEvent.click(within(screen.getByRole("tablist", { name: "Rooms" })).getByRole("tab", { name: /Terrace/ }));
    // Nothing of ours is on the Terrace: no card for a table from the Main room.
    expect(screen.queryByRole("region", { name: /^Table 7/ })).toBeNull();
    // Another room's table is never offered for holding from here: only a way to go and look at it.
    expect(screen.getByText("Table 7 is in Main room")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show Table 7 in Main room" }));
    expect(within(screen.getByRole("tablist", { name: "Rooms" })).getByRole("tab", { name: /Main room/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("region", { name: /^Table 7/ })).toBeTruthy();
  });
});

describe("The key follows the hold", () => {
  it("says Selected while the diner looks, and Held for you once a table is held", async () => {
    mockApi(routes());
    await reachTableStep();
    const names = () => within(screen.getByRole("list", { name: "Map key" })).getAllByRole("listitem").map((li) => li.querySelector("strong")?.textContent);
    expect(names()).toEqual(["Available", "Selected", "Unavailable"]);
    fireEvent.click(screen.getByRole("button", { name: "Hold 7 & continue" }));
    await screen.findByRole("timer");
    expect(names()).toEqual(["Available", "Held for you", "Unavailable"]);
  });
});

describe("The details form beside the plan", () => {
  it("carries the countdown and one line about the booking, so nothing is far from the confirm button", async () => {
    mockApi(routes());
    await reachTableStep();
    fireEvent.click(screen.getByRole("button", { name: "Hold 7 & continue" }));
    const form = await screen.findByRole("form", { name: "Your details" });
    expect(within(form).getByRole("timer")).toBeTruthy();
    expect(within(form).getByText("Table 7 · Main room")).toBeTruthy();
    expect(within(form).getByText(/, 19:30 · 2 guests$/)).toBeTruthy();
    expect(screen.getAllByRole("timer")).toHaveLength(1); // the countdown is not shown twice
    expect(within(form).getByText("Request a chair")).toBeTruthy();
    expect(within(form).getByRole("button", { name: "Confirm booking" })).toBeTruthy();
  });

  it("marks Your details as the current step as soon as the table is held", async () => {
    mockApi(routes());
    await reachTableStep();
    const current = () => screen.getByRole("navigation", { name: "Booking steps" }).querySelector('[aria-current="step"]')?.textContent;
    expect(current()).toContain("Table");
    fireEvent.click(screen.getByRole("button", { name: "Hold 7 & continue" }));
    await screen.findByRole("form", { name: "Your details" });
    expect(current()).toContain("Details");
    expect(screen.getByRole("heading", { name: "Your details" })).toBeTruthy();
    // One main action: no second "continue" bar, and "Change time" sits next to the date.
    expect(screen.queryByRole("button", { name: /Pick a table to continue|Continue with table/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Change date or time" })).toBeTruthy();
  });

  it("has one main action before a hold too: the card's, with no disabled bar under it", async () => {
    mockApi(routes());
    await reachTableStep();
    expect(screen.queryByRole("button", { name: "Pick a table to continue" })).toBeNull();
    expect(screen.getByRole("button", { name: "Hold 7 & continue" })).toBeTruthy();
  });

  it("marks Your details as the current step while the chair is being chosen", async () => {
    mockApi({ ...routes(), [`GET ${API}/seats`]: () => ({ tables: [{ id: 7, label: "7", shape: "rect", x: 40, y: 40, w: 120, h: 60, rotation: 0 }], seats: [{ id: 71, table_id: 7, label: "1", x: 70, y: 30, state: "free", accessible: false, phrase: null }] }) });
    await reachTableStep();
    fireEvent.click(screen.getByRole("button", { name: "Hold 7 & continue" }));
    fireEvent.click(await screen.findByRole("button", { name: "Choose a chair" }));
    await screen.findByRole("heading", { name: /Request a chair/ });
    const steps = screen.getByRole("navigation", { name: "Booking steps" });
    expect(steps.querySelector('[aria-current="step"]')?.textContent).toContain("Details");
  });
});
