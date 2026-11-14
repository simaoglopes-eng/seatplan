import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import BookingPage from "../BookingPage";
import { CONFIRMATION, INFO, SLOTS, VENUE, dinerMap, heldTable } from "./fixtures";
import { apiError, callsTo, mockApi } from "./mockApi";

const API = `/api/r/${VENUE}`;

const SEATS = {
  tables: [{ id: 7, label: "7", shape: "rect", x: 40, y: 40, w: 120, h: 60, rotation: 0 }],
  seats: [
    { id: 71, table_id: 7, label: "1", x: 70, y: 30, state: "free", accessible: false, phrase: "Facing the window" },
    { id: 72, table_id: 7, label: "2", x: 130, y: 30, state: "free", accessible: false, phrase: null },
  ],
};

function routes(extra: Record<string, () => unknown> = {}) {
  return {
    [`GET ${API}`]: () => INFO,
    [`GET ${API}/slots`]: () => SLOTS,
    [`GET ${API}/map`]: () => dinerMap(),
    [`POST ${API}/hold`]: () => heldTable(7, "7"),
    [`POST ${API}/bookings`]: () => CONFIRMATION,
    [`GET ${API}/seats`]: () => SEATS,
    ...extra,
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

async function holdTable7(): Promise<void> {
  renderBooking();
  fireEvent.click(await screen.findByRole("button", { name: "See free times" }));
  fireEvent.click(await screen.findByRole("button", { name: /19:30/ }));
  await screen.findByRole("heading", { name: "Choose your table" });
  expect(screen.queryByRole("form", { name: "Your details" })).toBeNull(); // nothing to confirm before a table is held
  fireEvent.click(screen.getAllByRole("button", { name: "Hold table 7" })[0]);
  await screen.findByRole("timer");
}

afterEach(() => vi.unstubAllGlobals());

describe("The details form beside the map", () => {
  it("appears once a table is held, and confirms the booking without leaving the plan", async () => {
    const calls = mockApi(routes());
    await holdTable7();
    const panel = screen.getByRole("form", { name: "Your details" });
    // The plan is still on screen next to the form.
    expect(screen.getByRole("option", { name: /Table 7,/ })).toBeTruthy();
    fireEvent.change(within(panel).getByLabelText("Name for the booking"), { target: { value: "Ana Pereira" } });
    fireEvent.change(within(panel).getByLabelText("Email"), { target: { value: "ana@example.com" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Confirm booking" }));
    expect(await screen.findByRole("heading", { name: "You are booked, Ana" })).toBeTruthy();
    const body = callsTo(calls, "POST", `${API}/bookings`)[0]?.body as Record<string, unknown>;
    expect(body).toMatchObject({ name: "Ana Pereira", email: "ana@example.com", hold_id: "hold-token-41" });
    expect(body.seat_id).toBeUndefined(); // no chair was asked for
  });

  it("checks the fields like the Your details step: an empty name and a bad email move focus to the first problem", async () => {
    const calls = mockApi(routes());
    await holdTable7();
    const panel = screen.getByRole("form", { name: "Your details" });
    fireEvent.click(within(panel).getByRole("button", { name: "Confirm booking" }));
    expect(document.activeElement).toBe(within(panel).getByLabelText("Name for the booking"));
    expect(callsTo(calls, "POST", `${API}/bookings`)).toHaveLength(0);
  });

  it("keeps what was typed when the diner goes on to choose a chair, and books with that chair", async () => {
    const calls = mockApi(routes());
    await holdTable7();
    const panel = screen.getByRole("form", { name: "Your details" });
    fireEvent.change(within(panel).getByLabelText("Name for the booking"), { target: { value: "Ana Pereira" } });
    fireEvent.change(within(panel).getByLabelText("Email"), { target: { value: "ana@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Choose a specific chair (optional)" }));
    fireEvent.click(await screen.findByLabelText(/Seat 1 · Facing the window/));
    fireEvent.click(screen.getByRole("button", { name: /^Continue with seat 1/ }));
    // The Your details step has the same words already in it.
    expect((await screen.findByLabelText("Name for the booking") as HTMLInputElement).value).toBe("Ana Pereira");
    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));
    expect(await screen.findByRole("heading", { name: "You are booked, Ana" })).toBeTruthy();
    expect(callsTo(calls, "POST", `${API}/bookings`)[0]?.body).toMatchObject({ seat_id: 71 });
  });

  it("goes back to the map with a clear message when the hold ended, keeping the details", async () => {
    mockApi(routes({ [`POST ${API}/bookings`]: () => apiError(409, "hold_expired", "That hold ended.") as unknown as never }));
    await holdTable7();
    const panel = screen.getByRole("form", { name: "Your details" });
    fireEvent.change(within(panel).getByLabelText("Name for the booking"), { target: { value: "Ana Pereira" } });
    fireEvent.change(within(panel).getByLabelText("Email"), { target: { value: "ana@example.com" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Confirm booking" }));
    expect(await screen.findByText(/Your hold on table 7 ended before we could book it/)).toBeTruthy();
    expect(screen.queryByRole("form", { name: "Your details" })).toBeNull(); // nothing is held any more
  });
});
