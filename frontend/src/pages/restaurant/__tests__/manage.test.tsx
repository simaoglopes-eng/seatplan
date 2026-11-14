import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import ManageBookingPage from "../ManageBookingPage";
import { BOOKING, SLOTS, VENUE } from "./fixtures";
import { apiError, callsTo, mockApi } from "./mockApi";

function renderManage(token = "tok123"): void {
  render(
    <MemoryRouter initialEntries={[`/b/${token}`]}>
      <Routes>
        <Route path="/b/:token" element={<ManageBookingPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Manage booking page", () => {
  it("cancels only after the confirmation dialog", async () => {
    const calls = mockApi({
      "GET /api/b/tok123": () => BOOKING,
      [`GET /api/r/${VENUE}/slots`]: () => SLOTS,
      "DELETE /api/b/tok123": () => ({ ...BOOKING, status: "cancelled" }),
    });
    renderManage();
    expect(await screen.findByText("Ana Pereira")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancel this booking?" });
    // Keeping the booking closes the dialog without a request.
    // The safe way out is where focus starts, and it closes the dialog without a request.
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Keep booking" }));
    expect(within(dialog).getByText("Casa Linho")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep booking" }));
    expect(callsTo(calls, "DELETE", "/api/b/tok123")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel booking" }));
    expect(await screen.findByText(/This booking is cancelled/)).toBeTruthy();
    expect(callsTo(calls, "DELETE", "/api/b/tok123")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Cancel booking" })).toBeNull();
  });

  it("changes the time through PATCH", async () => {
    const calls = mockApi({
      "GET /api/b/tok123": () => BOOKING,
      [`GET /api/r/${VENUE}/slots`]: () => SLOTS,
      "PATCH /api/b/tok123": () => ({ ...BOOKING, time: "12:30", end_time: "14:30" }),
    });
    renderManage();
    await screen.findByText("Ana Pereira");
    fireEvent.click(screen.getByRole("button", { name: "Change time or party size" }));
    // 20:00 is full, so it is not offered; 12:30 is.
    await screen.findByRole("option", { name: /12:30/ });
    expect(screen.queryByRole("option", { name: /20:00/ })).toBeNull();
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "12:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(/12:30 to 14:30/)).toBeTruthy();
    expect(callsTo(calls, "PATCH", "/api/b/tok123")[0]?.body).toEqual({ time: "12:30", party_size: 4 });
  });

  it("offers party sizes up to the restaurant's real limit from the booking link", async () => {
    mockApi({ "GET /api/b/tok123": () => BOOKING, [`GET /api/r/${VENUE}/slots`]: () => SLOTS });
    renderManage();
    fireEvent.click(await screen.findByRole("button", { name: "Change time or party size" }));
    const select = (await screen.findByLabelText("Party size")) as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("keeps the real limit after a change, although the change answer does not repeat it", async () => {
    mockApi({
      "GET /api/b/tok123": () => BOOKING,
      [`GET /api/r/${VENUE}/slots`]: () => SLOTS,
      "PATCH /api/b/tok123": () => ({ ...BOOKING, max_party: undefined, time: "12:30", end_time: "14:30" }),
    });
    renderManage();
    fireEvent.click(await screen.findByRole("button", { name: "Change time or party size" }));
    await screen.findByRole("option", { name: /12:30/ });
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "12:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText(/12:30 to 14:30/);
    // The form closes after saving; opening it again still offers the real limit.
    fireEvent.click(screen.getByRole("button", { name: "Change time or party size" }));
    expect((screen.getByLabelText("Party size") as HTMLSelectElement).options).toHaveLength(6);
  });

  it("starts with the summary and three things to do, and opens one at a time", async () => {
    mockApi({ "GET /api/b/tok123": () => BOOKING, [`GET /api/r/${VENUE}/slots`]: () => SLOTS, [`GET /api/r/${VENUE}/seats`]: () => ({ tables: [], seats: [] }) });
    renderManage();
    await screen.findByText("Ana Pereira");
    const actions = screen.getByRole("group", { name: "Manage this booking" });
    expect(within(actions).getAllByRole("button").map((b) => b.textContent)).toEqual(["Change time or party size", "Request a chair", "Cancel booking"]);
    expect(screen.queryByLabelText("Party size")).toBeNull(); // nothing is open until the diner says what they want
    const time = within(actions).getByRole("button", { name: "Change time or party size" });
    fireEvent.click(time);
    expect(time.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(within(actions).getByRole("button", { name: "Request a chair" }));
    expect(screen.queryByLabelText("Party size")).toBeNull();
    expect(screen.getByRole("heading", { name: "Chair request" })).toBeTruthy();
  });

  it("says a cancelled booking has no table, instead of 'No table yet'", async () => {
    mockApi({ "GET /api/b/tok123": () => ({ ...BOOKING, status: "cancelled", tables: [], table_ids: [] }) });
    renderManage();
    expect(await screen.findByText("None, the booking is cancelled")).toBeTruthy();
    expect(screen.queryByText("No table yet")).toBeNull();
  });

  it("shows the table as gone straight after cancelling", async () => {
    mockApi({
      "GET /api/b/tok123": () => BOOKING,
      [`GET /api/r/${VENUE}/slots`]: () => SLOTS,
      "DELETE /api/b/tok123": () => ({ ...BOOKING, max_party: undefined, status: "cancelled", tables: [], table_ids: [] }),
    });
    renderManage();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel booking" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel booking" }));
    expect(await screen.findByText("None, the booking is cancelled")).toBeTruthy();
    expect(screen.queryByText("Table 7")).toBeNull();
  });

  it("explains an invalid link instead of showing an error code", async () => {
    mockApi({ "GET /api/b/wrong": () => apiError(404, "not_found", "Not found") });
    renderManage("wrong");
    expect(await screen.findByText("This link does not work")).toBeTruthy();
  });
});
