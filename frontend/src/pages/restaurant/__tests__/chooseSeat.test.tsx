import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import BookingPage from "../BookingPage";
import { CONFIRMATION, INFO, SLOTS, VENUE, dinerMap, heldTable } from "./fixtures";
import { callsTo, mockApi } from "./mockApi";

const API = `/api/r/${VENUE}`;

const SEATS = {
  tables: [{ id: 7, label: "7", shape: "rect", x: 40, y: 40, w: 120, h: 60, rotation: 0 }],
  seats: [
    { id: 71, table_id: 7, label: "1", x: 70, y: 30, state: "free", accessible: false, phrase: "Facing the window" },
    { id: 72, table_id: 7, label: "2", x: 130, y: 30, state: "free", accessible: false, phrase: "Back to the window" },
    { id: 73, table_id: 7, label: "3", x: 70, y: 110, state: "blocked", accessible: false, phrase: null },
  ],
};

const WITH_SEAT = { ...CONFIRMATION, booking: { ...CONFIRMATION.booking, seat: { id: 72, label: "2", table_id: 7, phrase: "Back to the window" } } };

function renderBooking(): void {
  render(
    <MemoryRouter initialEntries={[`/r/${VENUE}`]}>
      <Routes>
        <Route path="/r/:venueId" element={<BookingPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Steps 1 to 3 and the hold of table 7; ends on the chair step. */
async function holdTable7(): Promise<void> {
  renderBooking();
  fireEvent.click(await screen.findByRole("button", { name: "See free times" }));
  fireEvent.click(await screen.findByRole("button", { name: /19:30/ }));
  await screen.findByRole("heading", { name: "Choose your table" });
  fireEvent.click(screen.getAllByRole("button", { name: "Hold table 7" })[0]);
  await screen.findByRole("timer");
  fireEvent.click(screen.getByRole("button", { name: "Choose a chair" }));
}

async function fillDetailsAndBook(): Promise<void> {
  await screen.findByRole("heading", { name: "Your details" });
  fireEvent.change(screen.getByLabelText("Name for the booking"), { target: { value: "Ana Pereira" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));
}

const ROUTES = {
  [`GET ${API}`]: () => INFO,
  [`GET ${API}/slots`]: () => SLOTS,
  [`GET ${API}/map`]: () => dinerMap(),
  [`POST ${API}/hold`]: () => heldTable(7, "7"),
  [`GET ${API}/seats`]: () => SEATS,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Where would you like to sit?", () => {
  it("lists the chairs of the held table with their sentences, and books the chosen one", async () => {
    const calls = mockApi({ ...ROUTES, [`POST ${API}/bookings`]: () => WITH_SEAT });
    await holdTable7();
    await screen.findByRole("heading", { name: /Where would you like to sit/ });
    expect(callsTo(calls, "GET", `${API}/seats`)[0]?.query.get("table_ids")).toBe("7");

    const group = screen.getByRole("radiogroup", { name: /Chair/ });
    expect(within(group).getByLabelText(/Seat 1.*Facing the window/)).toBeTruthy();
    expect((within(group).getByLabelText(/Seat 3/) as HTMLInputElement).disabled).toBe(true); // blocked
    fireEvent.click(within(group).getByLabelText(/Seat 2.*Back to the window/));
    fireEvent.click(screen.getByRole("button", { name: "Continue with seat 2" }));

    // Back at the plan, the chair is a request inside the form: it can be changed or taken back.
    expect(await screen.findByText("Chair requested: 7-2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove request" })).toBeTruthy();
    await fillDetailsAndBook();
    await screen.findByRole("heading", { name: "You are booked, Ana" });
    expect(callsTo(calls, "POST", `${API}/bookings`)[0]?.body).toMatchObject({ seat_id: 72 });
    expect(screen.getByText(/Seat 2, back to the window/i)).toBeTruthy();
  });

  it("can be skipped: no chair is sent and the booking is for the table", async () => {
    const calls = mockApi({ ...ROUTES, [`POST ${API}/bookings`]: () => CONFIRMATION });
    await holdTable7();
    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
    await fillDetailsAndBook();
    await screen.findByRole("heading", { name: "You are booked, Ana" });
    expect(callsTo(calls, "POST", `${API}/bookings`)[0]?.body).not.toHaveProperty("seat_id");
  });

  it("goes straight to the details when the table has no chairs, or they cannot be loaded", async () => {
    mockApi({ ...ROUTES, [`GET ${API}/seats`]: () => ({ tables: SEATS.tables, seats: [] }) });
    await holdTable7();
    expect(await screen.findByRole("heading", { name: "Your details" })).toBeTruthy();
  });

  it("falls back to the details when the chairs cannot be loaded", async () => {
    const routes: Record<string, () => unknown> = { ...ROUTES };
    delete routes[`GET ${API}/seats`];
    mockApi(routes);
    await holdTable7();
    expect(await screen.findByRole("heading", { name: "Your details" })).toBeTruthy();
  });

  it("takes the chair request back from the form, and the booking is for the table alone", async () => {
    const calls = mockApi({ ...ROUTES, [`POST ${API}/bookings`]: () => CONFIRMATION });
    await holdTable7();
    fireEvent.click(await screen.findByLabelText(/Seat 1.*Facing the window/));
    fireEvent.click(screen.getByRole("button", { name: "Continue with seat 1" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove request" }));
    expect(screen.queryByText(/Chair requested/)).toBeNull();
    expect(screen.getByRole("button", { name: "Choose a chair" })).toBeTruthy();
    await fillDetailsAndBook();
    await screen.findByRole("heading", { name: "You are booked, Ana" });
    expect(callsTo(calls, "POST", `${API}/bookings`)[0]?.body).not.toHaveProperty("seat_id");
  });

  it("lets the diner go back to the map without losing the hold", async () => {
    mockApi(ROUTES);
    await holdTable7();
    fireEvent.click(await screen.findByRole("button", { name: "Back to the map" }));
    expect(await screen.findByRole("heading", { name: "Choose your table" })).toBeTruthy();
    expect(screen.getByRole("timer")).toBeTruthy();
  });

  it("forgets the chair when another table is held", async () => {
    mockApi({ ...ROUTES, [`POST ${API}/bookings`]: () => CONFIRMATION });
    await holdTable7();
    fireEvent.click(await screen.findByLabelText(/Seat 1/));
    fireEvent.click(screen.getByRole("button", { name: "Back to the map" }));
    await screen.findByRole("heading", { name: "Choose your table" });
    fireEvent.click(screen.getAllByRole("button", { name: "Hold table 8" })[0]);
    await screen.findByRole("timer");
    fireEvent.click(screen.getByRole("button", { name: "Choose a chair" }));
    // The new table has to be asked again: nothing is pre-selected.
    expect(await screen.findByRole("heading", { name: /Where would you like to sit/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Continue with seat 1/ })).toBeNull();
  });
});
