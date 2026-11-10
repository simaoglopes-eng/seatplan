import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import StaffPage from "../StaffPage";
import { todayIso } from "../format";
import { ARRIVAL, EXACT_CHECK, FLOOR, INFO, SERVICE_PLAN, VENUE, WHATIF_TABLE_3 } from "./fixtures";
import { apiError, callsTo, mockApi } from "./mockApi";

const API = `/api/staff/${VENUE}`;

function renderStaff(): void {
  render(
    <MemoryRouter initialEntries={[`/staff/${VENUE}`]}>
      <Routes>
        <Route path="/staff/:venueId" element={<StaffPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Staff page", () => {
  it("runs the walk-in flow: needs, optimiser suggestion with reasons, one tap to seat", async () => {
    const seated = { ...ARRIVAL, id: "bk-walk", name: "Walk-in", party_size: 5, status: "seated", source: "walk_in", table_ids: [3], tables: ["3"] };
    const calls = mockApi({
      [`GET ${API}/floor`]: () => FLOOR,
      [`POST ${API}/whatif`]: () => WHATIF_TABLE_3,
      [`POST ${API}/walkins`]: () => seated,
    });
    renderStaff();
    // Glanceable status counts and the arrivals list.
    expect(await screen.findByText("Rui Costa")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Tables by status" }).textContent).toContain("2 Free");

    fireEvent.click(screen.getByRole("button", { name: "New walk-in" }));
    const dialog = await screen.findByRole("dialog", { name: /Walk-in at/ });
    fireEvent.change(within(dialog).getByLabelText("How many people?"), { target: { value: "5" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Find a table" }));

    expect(await within(dialog).findByText("Only free table for 5")).toBeTruthy();
    expect(within(dialog).getByText("Nobody else has to move.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Seat at Table 3" }));

    // The result is announced in the page's live region (the toast needs the app's ToastProvider).
    expect(await screen.findByText("Walk-in of 5 seated at Table 3.")).toBeTruthy();
    const walkin = callsTo(calls, "POST", `${API}/walkins`)[0];
    expect(walkin?.body).toMatchObject({ party_size: 5, table_ids: [3], needs_accessible: false, high_chairs: 0 });
    expect(callsTo(calls, "POST", `${API}/whatif`)[0]?.body).toMatchObject({ party_size: 5 });
  });

  it("does not read the walk-in staff just seated back to them as someone else's change", async () => {
    const seated = { ...ARRIVAL, id: "bk-walk", name: "Walk-in", party_size: 5, status: "seated", source: "walk_in", table_ids: [3], tables: ["3"] };
    const afterWalkin = { ...FLOOR, tables: FLOOR.tables.map((t) => (t.id === 3 ? { ...t, status: "seated" as const, party_size: 5, name: "Walk-in" } : t)) };
    let walkinDone = false;
    mockApi({
      [`GET ${API}/floor`]: () => (walkinDone ? afterWalkin : FLOOR),
      [`POST ${API}/whatif`]: () => WHATIF_TABLE_3,
      [`POST ${API}/walkins`]: () => {
        walkinDone = true;
        return seated;
      },
    });
    renderStaff();
    fireEvent.click(await screen.findByRole("option", { name: /^Table 3,/ }));
    fireEvent.click(screen.getByRole("button", { name: "New walk-in" }));
    const dialog = await screen.findByRole("dialog", { name: /Walk-in at/ });
    fireEvent.change(within(dialog).getByLabelText("How many people?"), { target: { value: "5" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Find a table" }));
    fireEvent.click(await within(dialog).findByRole("button", { name: "Seat at Table 3" }));
    expect(await screen.findByText("Walk-in of 5 seated at Table 3.")).toBeTruthy();
    await screen.findByRole("option", { name: /^Table 3, .*seated/i });
    const mapStatus = screen.getAllByRole("status").map((node) => node.textContent ?? "").join(" ");
    expect(mapStatus).not.toContain("just taken");
    expect(mapStatus).not.toContain("someone else");
  });

  it("moves a booking with the keyboard-friendly Move dialog", async () => {
    const calls = mockApi({
      [`GET ${API}/floor`]: () => FLOOR,
      [`POST ${API}/bookings/bk-rui/move`]: () => ({ ...ARRIVAL, table_ids: [3], tables: ["3"] }),
    });
    renderStaff();
    const arrivals = await screen.findByRole("list", { name: "Upcoming arrivals" });
    fireEvent.click(within(arrivals).getByRole("button", { name: /Rui Costa/ }));
    fireEvent.click(screen.getByRole("button", { name: "Move or combine" }));
    const dialog = await screen.findByRole("dialog", { name: /Move Rui Costa/ });
    fireEvent.click(within(dialog).getByLabelText(/Table 3/));
    fireEvent.click(within(dialog).getByRole("button", { name: "Move here" }));
    expect(await screen.findByText("Rui Costa is now at Table 3.")).toBeTruthy();
    expect(callsTo(calls, "POST", `${API}/bookings/bk-rui/move`)[0]?.body).toEqual({ table_ids: [3] });
  });

  it("names the tables on the floor map in staff words", async () => {
    mockApi({ [`GET ${API}/floor`]: () => FLOOR });
    renderStaff();
    await screen.findByText("Rui Costa");
    expect(screen.getByRole("option", { name: "Table 2, 2 to 4 people, reserved, Rui Costa, party of 2" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Table 1, 2 to 4 people, free" })).toBeTruthy();
  });

  it("moves focus to the suggestion after Find, so keyboard users hear it and stay in the dialog", async () => {
    mockApi({ [`GET ${API}/floor`]: () => FLOOR, [`POST ${API}/whatif`]: () => WHATIF_TABLE_3 });
    renderStaff();
    fireEvent.click(await screen.findByRole("button", { name: "New walk-in" }));
    const dialog = await screen.findByRole("dialog", { name: /Walk-in at/ });
    const find = within(dialog).getByRole("button", { name: "Find a table" });
    find.focus();
    fireEvent.click(find);
    await within(dialog).findByText("Only free table for 5");
    const focused = document.activeElement as HTMLElement;
    expect(dialog.contains(focused)).toBe(true);
    expect(focused.textContent).toContain("Best place");
  });

  it("forgets an old suggestion when the walk-in dialog is closed", async () => {
    mockApi({ [`GET ${API}/floor`]: () => FLOOR, [`POST ${API}/whatif`]: () => WHATIF_TABLE_3 });
    renderStaff();
    fireEvent.click(await screen.findByRole("button", { name: "New walk-in" }));
    let dialog = await screen.findByRole("dialog", { name: /Walk-in at/ });
    fireEvent.click(within(dialog).getByRole("button", { name: "Find a table" }));
    await within(dialog).findByText("Only free table for 5");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "New walk-in" }));
    dialog = await screen.findByRole("dialog", { name: /Walk-in at/ });
    expect(within(dialog).queryByText("Only free table for 5")).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Find a table" })).toBeTruthy();
  });

  it("asks the what-if and the walk-in about the day on screen, not always today", async () => {
    const calls = mockApi({ [`GET ${API}/floor`]: () => FLOOR, [`POST ${API}/whatif`]: () => WHATIF_TABLE_3 });
    renderStaff();
    await screen.findByText("Rui Costa");
    fireEvent.change(screen.getByLabelText("Day"), { target: { value: "2026-12-24" } });
    await screen.findByText("Rui Costa");
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    await screen.findByText("Only free table for 5");
    expect(callsTo(calls, "POST", `${API}/whatif`)[0]?.body).toMatchObject({ date: "2026-12-24" });
  });

  it("shows how many guests were really seated next to the covers booked", async () => {
    mockApi({
      [`GET ${API}/dashboard`]: () => ({
        date: todayIso(),
        covers: { expected: 40, seated: 26, no_show: 2, cancelled: 4 },
        bookings: 14,
        seats: 72,
        no_show_rate: 0.05,
        no_show_based_on: 120,
        services: [
          { service: "Dinner", start: "19:00", end: "22:30", covers: 40, covers_seated: 26, utilisation_percent: 61.2, overbooking_suggestion: { is_suggestion: true, extra_covers: 2, formula: "f" } },
        ],
      }),
    });
    renderStaff();
    fireEvent.click(screen.getByRole("tab", { name: "Dashboard" }));
    expect((await screen.findByText("Covers seated")).parentElement?.textContent).toContain("26");
    expect(screen.getByText(/40 covers, 26 seated/)).toBeTruthy();
  });

  it("previews who would move, then applies exactly that plan", async () => {
    const calls = mockApi({
      [`GET ${API}/schedule`]: () => INFO.schedule,
      [`POST ${API}/optimise/service`]: (call) => ((call.body as { apply?: boolean }).apply ? { ...SERVICE_PLAN, applied: true } : SERVICE_PLAN),
    });
    renderStaff();
    fireEvent.click(screen.getByRole("tab", { name: "Optimise" }));
    fireEvent.change(await screen.findByLabelText("Service"), { target: { value: "Dinner" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview moves" }));
    expect(await screen.findByText(/Ana Pereira, 4 people at 19:30: from Table 7 to Table 8/)).toBeTruthy();
    expect(screen.getByText(/2 empty chairs fewer/)).toBeTruthy();
    expect(callsTo(calls, "POST", `${API}/optimise/service`)[0]?.body).toEqual({ date: todayIso(), service: "Dinner" });

    fireEvent.click(screen.getByRole("button", { name: "Apply these moves" }));
    expect(await screen.findByText("Done: 1 booking moved.")).toBeTruthy();
    expect(callsTo(calls, "POST", `${API}/optimise/service`)[1]?.body).toEqual({ date: todayIso(), service: "Dinner", apply: true, plan_id: SERVICE_PLAN.plan_id });
  });

  it("says when there is nothing to improve, and explains a floor that changed since the preview", async () => {
    let answer: unknown = { ...SERVICE_PLAN, moves: [], after: SERVICE_PLAN.before };
    mockApi({ [`GET ${API}/schedule`]: () => INFO.schedule, [`POST ${API}/optimise/service`]: () => answer });
    renderStaff();
    fireEvent.click(screen.getByRole("tab", { name: "Optimise" }));
    fireEvent.click(await screen.findByRole("button", { name: "Preview moves" }));
    expect(await screen.findByText(/Nothing to improve/)).toBeTruthy();

    answer = SERVICE_PLAN;
    fireEvent.click(screen.getByRole("button", { name: "Preview moves" }));
    await screen.findByRole("button", { name: "Apply these moves" });
    answer = apiError(409, "conflict", "The floor changed since the preview. Please preview again.");
    fireEvent.click(screen.getByRole("button", { name: "Apply these moves" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Please preview again.");
  });

  it("puts the exact check in plain words: heuristic, proven optimum and the gap", async () => {
    const calls = mockApi({ [`GET ${API}/schedule`]: () => INFO.schedule, [`POST ${API}/optimise/exact-check`]: () => EXACT_CHECK });
    renderStaff();
    fireEvent.click(screen.getByRole("tab", { name: "Optimise" }));
    fireEvent.click(await screen.findByRole("button", { name: "Run the exact check" }));
    const card = (await screen.findByText(/The best possible plan seats 2 more guests/)).closest("section") as HTMLElement;
    expect(card.textContent).toContain("Quick planner: 18 guests seated, 4 empty chairs");
    expect(card.textContent).toContain("Proven best: 20 guests seated, 2 empty chairs");
    expect(card.textContent).toContain("Checked the first 8 of 11 bookings");
    expect(callsTo(calls, "POST", `${API}/optimise/exact-check`)[0]?.body).toMatchObject({ date: todayIso() });
  });

  it("asks staff to sign in instead of showing a raw 401", async () => {
    mockApi({ [`GET ${API}/floor`]: () => apiError(401, "unauthorised", "Sign in first") });
    renderStaff();
    const link = await screen.findByRole("link", { name: "Sign in as staff" });
    expect(link.getAttribute("href")).toBe(`/login?next=${encodeURIComponent(`/staff/${VENUE}`)}`);
  });
});
