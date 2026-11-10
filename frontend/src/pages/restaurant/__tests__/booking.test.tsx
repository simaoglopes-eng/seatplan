import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import BookingPage from "../BookingPage";
import { todayIso } from "../format";
import { CONFIRMATION, INFO, SLOTS, VENUE, dinerMap, heldTable } from "./fixtures";
import { apiError, callsTo, mockApi } from "./mockApi";

const API = `/api/r/${VENUE}`;

function renderBooking(): void {
  render(
    <MemoryRouter initialEntries={[`/r/${VENUE}`]}>
      <Routes>
        <Route path="/r/:venueId" element={<BookingPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Steps 1 to 3: open the page, pick 19:30, wait for the map. */
async function reachTableStep(): Promise<void> {
  renderBooking();
  fireEvent.click(await screen.findByRole("button", { name: "See free times" }));
  fireEvent.click(await screen.findByRole("button", { name: /19:30/ }));
  await screen.findByRole("heading", { name: "Choose your table" });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Booking page", () => {
  it("books from date to confirmation and always shows a copyable manage link", async () => {
    const calls = mockApi({
      [`GET ${API}`]: () => INFO,
      [`GET ${API}/slots`]: () => SLOTS,
      [`GET ${API}/map`]: () => dinerMap(),
      [`POST ${API}/hold`]: () => heldTable(7, "7"),
      [`POST ${API}/bookings`]: () => CONFIRMATION,
    });
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    await reachTableStep();

    // Slots are grouped by service and show the status in words.
    expect(callsTo(calls, "GET", `${API}/slots`)[0]?.query.get("party")).toBe("2");
    // The suggestion card explains why, then holds the table with a visible countdown.
    expect(screen.getByText("By the window")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Hold table 7" })[0]);
    expect(await screen.findByRole("timer")).toBeTruthy();
    expect(callsTo(calls, "POST", `${API}/hold`)[0]?.body).toMatchObject({ table_id: 7, time: "19:30", party: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Continue with table 7" }));

    // Step 4: inline validation first, then a valid form.
    await screen.findByRole("heading", { name: "Your details" });
    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));
    expect(screen.getByText("Please enter the name for the booking.")).toBeTruthy();
    expect(callsTo(calls, "POST", `${API}/bookings`)).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Name for the booking"), { target: { value: "Ana Pereira" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));

    // Step 5: summary, manage link, email note.
    expect(await screen.findByRole("heading", { name: "You are booked, Ana" })).toBeTruthy();
    expect(callsTo(calls, "POST", `${API}/bookings`)[0]?.body).toMatchObject({ hold_id: "hold-token-41", name: "Ana Pereira", email: "ana@example.com", party: 2 });
    const link = screen.getByLabelText("Your manage link") as HTMLInputElement;
    expect(link.value).toBe(`${window.location.origin}/b/tok123`);
    expect(screen.getByText(/calendar invite is on its way/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(await screen.findByText(/Link copied/)).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/b/tok123`);
  });

  it("sends a full slot to the waitlist and shows position and wait", async () => {
    const calls = mockApi({
      [`GET ${API}`]: () => INFO,
      [`GET ${API}/slots`]: () => SLOTS,
      [`POST ${API}/waitlist`]: () => ({ date: "2026-11-12", time: "20:00", position: 3, estimated_wait_minutes: 25 }),
    });
    renderBooking();
    fireEvent.click(await screen.findByRole("button", { name: "See free times" }));
    const full = await screen.findByRole("button", { name: /20:00/ });
    expect(full.textContent).toContain("Full, join waitlist");
    fireEvent.click(full);

    const dialog = await screen.findByRole("dialog", { name: "20:00 is full" });
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Rui Costa" } });
    fireEvent.change(within(dialog).getByLabelText("Email"), { target: { value: "rui@example.com" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Join the waitlist" }));

    expect(await screen.findByRole("dialog", { name: "You are on the waitlist" })).toBeTruthy();
    expect(screen.getByText(/You are number/).textContent).toContain("3");
    expect(screen.getByText(/about/).textContent).toContain("25 minutes");
    expect(callsTo(calls, "POST", `${API}/waitlist`)[0]?.body).toMatchObject({ time: "20:00", party: 2, email: "rui@example.com" });
  });

  it("explains a 409 conflict and offers tables that are still free", async () => {
    let mapVersion = 0;
    mockApi({
      [`GET ${API}`]: () => INFO,
      [`GET ${API}/slots`]: () => SLOTS,
      // After the failed hold the page reloads: table 7 is now taken.
      [`GET ${API}/map`]: () => (mapVersion === 0 ? dinerMap() : dinerMap({ 7: { state: "taken" } })),
      [`POST ${API}/hold`]: () => {
        mapVersion = 1;
        return apiError(409, "seat_taken", "That table was just taken.");
      },
    });
    await reachTableStep();
    fireEvent.click(screen.getAllByRole("button", { name: "Hold table 7" })[0]);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Table 7 was just taken by someone else.");
    // Table 8 fits and is free; 9 is taken and 10 is too small, so they are not offered.
    expect(await within(alert).findByRole("button", { name: "Hold table 8" })).toBeTruthy();
    expect(within(alert).queryByRole("button", { name: "Hold table 9" })).toBeNull();
    expect(within(alert).queryByRole("button", { name: "Hold table 10" })).toBeNull();
  });

  it("redraws the map from a live update and says when our held table was booked by someone else", async () => {
    let held = false;
    let version = 0;
    mockApi({
      [`GET ${API}`]: () => INFO,
      [`GET ${API}/slots`]: () => SLOTS,
      // Once we hold table 7, the next fetch shows it booked: our hold was lost.
      [`GET ${API}/map`]: () => (held ? dinerMap({ 7: { state: "taken" } }) : dinerMap()),
      [`POST ${API}/hold`]: () => heldTable(7, "7"),
      // Every poll reports a newer version, as if other diners kept booking.
      [`GET /api/live/venue-${VENUE}-${todayIso()}/version`]: () => ({ version: ++version }),
    });
    await reachTableStep();
    fireEvent.click(screen.getAllByRole("button", { name: "Hold table 7" })[0]);
    await screen.findByRole("timer");
    held = true;
    // The page polls every 2 seconds (no EventSource in jsdom), so the change must show within about 2 s.
    const alert = await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(alert.textContent).toContain("Table 7 was just booked by someone else.");
    expect(within(alert).getByRole("button", { name: "Hold table 8" })).toBeTruthy();
  });

  it("names each table on the map in table words, never as a seat", async () => {
    mockApi({
      [`GET ${API}`]: () => INFO,
      [`GET ${API}/slots`]: () => SLOTS,
      [`GET ${API}/map`]: () => dinerMap(),
      [`POST ${API}/hold`]: () => heldTable(7, "7"),
    });
    await reachTableStep();
    expect(screen.getByRole("option", { name: "Table 8, 2 to 4 people, free" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Table 10, 1 to 2 people, does not suit your party" })).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Hold table 7" })[0]);
    await screen.findByRole("timer");
    expect(screen.getByRole("option", { name: /^Table 7, 2 to 4 people, held for you, accessible/ })).toBeTruthy();
    const names = screen.getAllByRole("option").map((option) => option.getAttribute("aria-label") ?? "");
    expect(names.filter((name) => /seat/i.test(name))).toEqual([]);
  });

  it("hides times that have already passed, so a passed time never offers the waitlist", async () => {
    mockApi({ [`GET ${API}`]: () => INFO, [`GET ${API}/slots`]: () => SLOTS });
    renderBooking();
    fireEvent.click(await screen.findByRole("button", { name: "See free times" }));
    await screen.findByRole("button", { name: /12:30/ });
    expect(screen.queryByRole("button", { name: /12:00/ })).toBeNull();
    expect(screen.getByText("Times that have already passed are not shown.")).toBeTruthy();
  });

  it("says the day is over when every time has passed, instead of offering waitlists", async () => {
    const over = { ...SLOTS, slots: SLOTS.slots.map((slot) => ({ ...slot, status: "full" as const, reason: "past" as const })) };
    mockApi({ [`GET ${API}`]: () => INFO, [`GET ${API}/slots`]: () => over });
    renderBooking();
    fireEvent.click(await screen.findByRole("button", { name: "See free times" }));
    expect(await screen.findByText("No times left today")).toBeTruthy();
    expect(screen.queryByText(/join waitlist/)).toBeNull();
  });

  it("gives the old table back when the diner holds another one", async () => {
    let holds = 0;
    const calls = mockApi({
      [`GET ${API}`]: () => INFO,
      [`GET ${API}/slots`]: () => SLOTS,
      [`GET ${API}/map`]: () => dinerMap(),
      [`POST ${API}/hold`]: (call) => {
        holds += 1;
        const id = (call.body as { table_id: number }).table_id;
        return heldTable(id, String(id), `hold-token-${holds}`);
      },
      [`DELETE ${API}/hold/hold-token-1`]: () => new Response(null, { status: 204 }),
    });
    await reachTableStep();
    fireEvent.click(screen.getAllByRole("button", { name: "Hold table 7" })[0]);
    await screen.findByRole("button", { name: "Continue with table 7" });
    // The list button's name is "Hold" plus hidden words; jsdom drops the space between them.
    fireEvent.click(screen.getAllByRole("button", { name: /^Hold\s*table 8$/ })[0]);
    await screen.findByRole("button", { name: "Continue with table 8" });
    expect(callsTo(calls, "DELETE", `${API}/hold/hold-token-1`)).toHaveLength(1);
  });

  it("gives the held table back when the diner goes back to change the time", async () => {
    const calls = mockApi({
      [`GET ${API}`]: () => INFO,
      [`GET ${API}/slots`]: () => SLOTS,
      [`GET ${API}/map`]: () => dinerMap(),
      [`POST ${API}/hold`]: () => heldTable(7, "7"),
      [`DELETE ${API}/hold/hold-token-41`]: () => new Response(null, { status: 204 }),
    });
    await reachTableStep();
    fireEvent.click(screen.getAllByRole("button", { name: "Hold table 7" })[0]);
    await screen.findByRole("button", { name: "Continue with table 7" });
    fireEvent.click(screen.getByRole("button", { name: "Change time" }));
    await screen.findByRole("heading", { name: "Pick a time" });
    expect(callsTo(calls, "DELETE", `${API}/hold/hold-token-41`)).toHaveLength(1);
  });

  it("shows the server's words when a diner already holds too many tables", async () => {
    mockApi({
      [`GET ${API}`]: () => INFO,
      [`GET ${API}/slots`]: () => SLOTS,
      [`GET ${API}/map`]: () => dinerMap(),
      [`POST ${API}/hold`]: () => apiError(429, "rate_limited", "You are already holding tables for this date. Book or release one first."),
    });
    await reachTableStep();
    fireEvent.click(screen.getAllByRole("button", { name: "Hold table 7" })[0]);
    expect((await screen.findByRole("alert")).textContent).toContain("Book or release one first.");
  });

  it("offers party sizes only up to the restaurant's real limit", async () => {
    mockApi({ [`GET ${API}`]: () => ({ ...INFO, max_party: 5 }) });
    renderBooking();
    const select = (await screen.findByLabelText("Party size")) as HTMLSelectElement;
    expect(select.options).toHaveLength(5);
    expect(screen.getByText(/For more than 5, please call/)).toBeTruthy();
  });

  it("explains that online booking is closed when no party size can be booked", async () => {
    mockApi({ [`GET ${API}`]: () => ({ ...INFO, max_party: 0 }) });
    renderBooking();
    expect(await screen.findByText("Online booking is not open")).toBeTruthy();
    expect(screen.queryByLabelText("Party size")).toBeNull();
  });

  it("shows the reason on a blackout date before asking for a time", async () => {
    const blackout = { ...INFO, schedule: { ...INFO.schedule, blackout_dates: [{ date: todayIso(), reason: "Private event" }] } };
    mockApi({ [`GET ${API}`]: () => blackout });
    renderBooking();
    expect(await screen.findByText(/Private event/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "See free times" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
