import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import BookingPage from "../BookingPage";
import { PREF_OPTIONS, prefWords, togglePref } from "../prefs";
import { CONFIRMATION, INFO, SLOTS, VENUE, dinerMap, heldTable } from "./fixtures";
import { callsTo, mockApi } from "./mockApi";

const API = `/api/r/${VENUE}`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("togglePref", () => {
  it("adds and removes a wish, always in the same order", () => {
    expect(togglePref([], "view", true)).toEqual(["view"]);
    expect(togglePref(["view"], "sun", true)).toEqual(["sun", "view"]);
    expect(togglePref(["sun", "view"], "sun", false)).toEqual(["view"]);
    expect(togglePref(undefined, "quiet", true)).toEqual(["quiet"]);
  });

  it("never keeps sun and shade together: the newest one wins", () => {
    expect(togglePref(["sun", "view"], "shade", true)).toEqual(["shade", "view"]);
    expect(togglePref(["shade"], "sun", true)).toEqual(["sun"]);
  });

  it("offers exactly the five wishes the server knows", () => {
    expect(PREF_OPTIONS.map((o) => o.key)).toEqual(["sun", "shade", "view", "quiet", "away_from_wc"]);
  });
});

describe("prefWords", () => {
  it("writes the wishes as a short phrase", () => {
    expect(prefWords(["sun", "view"])).toBe("sunny table, with a view");
    expect(prefWords([])).toBe("");
    expect(prefWords(undefined)).toBe("");
  });
});

function renderBooking(): void {
  render(
    <MemoryRouter initialEntries={[`/r/${VENUE}`]}>
      <Routes>
        <Route path="/r/:venueId" element={<BookingPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Wishes in the booking flow", () => {
  it("ticks wishes on step 1 and carries them to the map, the hold and the booking", async () => {
    const calls = mockApi({
      [`GET ${API}`]: () => INFO,
      [`GET ${API}/slots`]: () => SLOTS,
      [`GET ${API}/map`]: () => dinerMap(),
      [`POST ${API}/hold`]: () => heldTable(7, "7"),
      [`POST ${API}/bookings`]: () => ({ ...CONFIRMATION, booking: { ...CONFIRMATION.booking, prefs: ["sun", "view"] } }),
    });
    renderBooking();
    fireEvent.click(await screen.findByLabelText("Sunny table"));
    fireEvent.click(screen.getByLabelText("With a view"));
    fireEvent.click(screen.getByRole("button", { name: "See free times" }));
    fireEvent.click(await screen.findByRole("button", { name: /19:30/ }));
  fireEvent.click(screen.getByRole("button", {name:"Choose a table at 19:30"}));
    await screen.findByRole("heading", { name: "Choose your table" });
    expect(callsTo(calls, "GET", `${API}/map`)[0]?.query.get("prefs")).toBe("sun,view");

    fireEvent.click(screen.getAllByRole("button", { name: "Hold table 7" })[0]);
    await screen.findByRole("timer");
    expect(callsTo(calls, "POST", `${API}/hold`)[0]?.body).toMatchObject({ table_id: 7, prefs: ["sun", "view"] });
    await screen.findByRole("heading", { name: "Your details" });
    fireEvent.change(screen.getByLabelText("Name for the booking"), { target: { value: "Ana Pereira" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));
    await screen.findByRole("heading", { name: "You are booked, Ana" });
    expect(callsTo(calls, "POST", `${API}/bookings`)[0]?.body).toMatchObject({ prefs: ["sun", "view"] });
    expect(screen.getByText("sunny table, with a view")).toBeTruthy();
  });

  it("sends nothing about wishes when none were ticked", async () => {
    const calls = mockApi({
      [`GET ${API}`]: () => INFO,
      [`GET ${API}/slots`]: () => SLOTS,
      [`GET ${API}/map`]: () => dinerMap(),
      [`POST ${API}/hold`]: () => heldTable(7, "7"),
    });
    renderBooking();
    fireEvent.click(await screen.findByRole("button", { name: "See free times" }));
    fireEvent.click(await screen.findByRole("button", { name: /19:30/ }));
  fireEvent.click(screen.getByRole("button", {name:"Choose a table at 19:30"}));
    await screen.findByRole("heading", { name: "Choose your table" });
    expect(callsTo(calls, "GET", `${API}/map`)[0]?.query.has("prefs")).toBe(false);
    fireEvent.click(screen.getAllByRole("button", { name: "Hold table 7" })[0]);
    await screen.findByRole("timer");
    expect(callsTo(calls, "POST", `${API}/hold`)[0]?.body).not.toHaveProperty("prefs");
  });

  it("unticks sunny when shade is chosen, since a table cannot be both", async () => {
    mockApi({ [`GET ${API}`]: () => INFO, [`GET ${API}/slots`]: () => SLOTS });
    renderBooking();
    const sunny = (await screen.findByLabelText("Sunny table")) as HTMLInputElement;
    const shade = screen.getByLabelText("In the shade") as HTMLInputElement;
    fireEvent.click(sunny);
    expect(sunny.checked).toBe(true);
    fireEvent.click(shade);
    expect([sunny.checked, shade.checked]).toEqual([false, true]);
  });
});
