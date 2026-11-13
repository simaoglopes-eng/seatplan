import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../design/components";
import ManageBookingPage from "../ManageBookingPage";
import { BOOKING, SLOTS, VENUE } from "./fixtures";
import { apiError, callsTo, mockApi } from "./mockApi";

const API = `/api/r/${VENUE}`;

const SEATS = {
  tables: [{ id: 7, label: "7", shape: "rect", x: 40, y: 40, w: 120, h: 60, rotation: 0 }],
  seats: [
    { id: 71, table_id: 7, label: "1", x: 70, y: 30, state: "free", accessible: false, phrase: "Facing the window" },
    { id: 72, table_id: 7, label: "2", x: 130, y: 30, state: "free", accessible: false, phrase: "Back to the window" },
    { id: 73, table_id: 7, label: "3", x: 70, y: 110, state: "blocked", accessible: false, phrase: null },
  ],
};

const SEATED = { ...BOOKING, seat: { id: 71, label: "1", table_id: 7, phrase: "Facing the window" } };

function renderManage(): void {
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/b/tok123"]}>
        <Routes>
          <Route path="/b/:token" element={<ManageBookingPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("Change seat on the manage page", () => {
  it("offers the chairs of the booking's own table and sends the one picked, alone", async () => {
    const calls = mockApi({
      "GET /api/b/tok123": () => SEATED,
      [`GET ${API}/slots`]: () => SLOTS,
      [`GET ${API}/seats`]: () => SEATS,
      "PATCH /api/b/tok123": (call) => ({ ...SEATED, seat: { id: (call.body as { seat_id: number }).seat_id, label: "2", table_id: 7, phrase: "Back to the window" } }),
    });
    renderManage();
    expect(await screen.findByText("You asked for seat 1.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Change seat" }));
    expect(await screen.findByLabelText(/Seat 2 · Back to the window/)).toBeTruthy();
    expect(callsTo(calls, "GET", `${API}/seats`)[0]?.query.get("table_ids")).toBe("7");
    // The chair that cannot be chosen is shown but disabled, and Save waits for a different chair.
    expect((screen.getByLabelText(/Seat 3/) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Save seat" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/Seat 2 · Back to the window/));
    fireEvent.click(screen.getByRole("button", { name: "Save seat" }));
    expect(await screen.findByText("You asked for seat 2.")).toBeTruthy();
    expect(callsTo(calls, "PATCH", "/api/b/tok123")[0]?.body).toEqual({ seat_id: 72 });
  });

  it("takes the choice away with null", async () => {
    const calls = mockApi({
      "GET /api/b/tok123": () => SEATED,
      [`GET ${API}/seats`]: () => SEATS,
      "PATCH /api/b/tok123": () => BOOKING,
    });
    renderManage();
    fireEvent.click(await screen.findByRole("button", { name: "Change seat" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove my choice" }));
    expect(await screen.findByText(/You have not picked a chair/)).toBeTruthy();
    expect(callsTo(calls, "PATCH", "/api/b/tok123")[0]?.body).toEqual({ seat_id: null });
  });

  it("offers Pick a seat when none was chosen, and shows the server's refusal without changing anything", async () => {
    mockApi({
      "GET /api/b/tok123": () => BOOKING,
      [`GET ${API}/seats`]: () => SEATS,
      "PATCH /api/b/tok123": () => apiError(422, "validation", "That chair is not at your table."),
    });
    renderManage();
    fireEvent.click(await screen.findByRole("button", { name: "Pick a seat" }));
    fireEvent.click(await screen.findByLabelText(/Seat 1 · Facing the window/));
    fireEvent.click(screen.getByRole("button", { name: "Save seat" }));
    expect(await screen.findByText("That chair is not at your table.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep as it is" }));
    expect(screen.getByText(/You have not picked a chair/)).toBeTruthy();
  });

  it("is not offered for a cancelled booking", async () => {
    mockApi({ "GET /api/b/tok123": () => ({ ...SEATED, status: "cancelled" }) });
    renderManage();
    await screen.findByText(/This booking is cancelled/);
    expect(screen.queryByRole("button", { name: "Change seat" })).toBeNull();
  });
});
