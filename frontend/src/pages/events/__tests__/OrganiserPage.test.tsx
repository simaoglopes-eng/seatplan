import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventDetail, ExactCheck, OrganiserGuest, Scenario } from "../../../api/events";
import type { MapSeat, SeatState } from "../../../api/types";
import { ToastProvider } from "../../../design/components";
import OrganiserPage from "../OrganiserPage";
import { callsTo, errorReply, startFakeServer } from "./mockServer";
import type { FakeServer } from "./mockServer";

function seat(id: number, state: SeatState, occupant: string | null = null): MapSeat {
  return { id, table_id: 1, label: String(id - 10), x: 40 * (id - 10), y: 50, state, accessible: false, occupant };
}

// Shapes copy backend/app/routers/events.py: GET /events/{eid} and
// GET /events/{eid}/guests. Ana sits at seat 1; Bea and Carl have no seat yet.
// Carl asked to be anonymous.
interface FakeEvent {
  detail: EventDetail;
  guests: OrganiserGuest[];
}

function guest(id: number, name: string, seatId: number | null, anonymous = false): OrganiserGuest {
  return {
    id,
    name,
    email: `${name.split(" ")[0].toLowerCase()}@example.com`,
    group: null,
    rsvp: "yes",
    wants_anonymous: anonymous,
    dietary_note: null,
    reserved_tag: null,
    needs_accessible: false,
    seat_id: seatId,
    source: "invited",
    has_account: false,
  };
}

function makeEvent(): FakeEvent {
  const detail: EventDetail = {
    event: {
      public_id: "spring",
      name: "Spring Gala",
      starts_at: "2027-03-14T19:30:00Z",
      ends_at: "2027-03-14T23:30:00Z",
      privacy_mode: "full_name",
      change_deadline: null,
      deadline_passed: false,
      live_scope: "event-spring",
    },
    venue: { public_id: "v1", name: "Quinta da Luz" },
    map: {
      width: 300,
      height: 120,
      zones: [],
      tables: [{ id: 1, label: "1", shape: "rect", x: 20, y: 30, w: 180, h: 40, rotation: 0 }],
      seats: [seat(11, "taken", "Ana Silva"), seat(12, "free"), seat(13, "free"), seat(14, "blocked")],
    },
    not_chosen: [
      { guest_id: 2, name: "Bea Costa", has_seat: false },
      { guest_id: 3, name: "Carl Mendes", has_seat: false },
    ],
    counts: { guests: 3, seated: 1, chosen_by_self: 1 },
  };
  return { detail, guests: [guest(1, "Ana Silva", 11), guest(2, "Bea Costa", null), guest(3, "Carl Mendes", null, true)] };
}

// `assignments` is guest id (as text) -> seat id, as the backend sends it.
const PLAN: Record<string, number> = { "1": 11, "2": 12, "3": 13 };
const AUTOFILL: Scenario = {
  id: 5,
  label: "Auto-fill (seed 0)",
  score: { total: 24, friend_adjacent: 20, friend_same_table: 4, group_adjacent: 0, group_same_table: 0, changes: 0 },
  seated: 3,
  unseated: [],
  moved: [],
  assignments: PLAN,
  iterations: 20000,
  seed: 0,
};

function organiserServer(data: FakeEvent): FakeServer {
  const server = startFakeServer();
  server.routes.set("GET /events/ev1", () => ({ body: data.detail }));
  server.routes.set("GET /events/ev1/guests", () => ({ body: data.guests }));
  server.routes.set("GET /events/ev1/scenarios", () => ({ body: [AUTOFILL] }));
  server.routes.set("POST /events/ev1/optimise/autofill", () => ({ body: AUTOFILL }));
  server.routes.set("POST /events/ev1/scenarios/5/apply", () => {
    data.guests = data.guests.map((g) => ({ ...g, seat_id: PLAN[String(g.id)] }));
    data.detail.map.seats = [seat(11, "taken", "Ana Silva"), seat(12, "taken", "Bea Costa"), seat(13, "taken", "Carl Mendes"), seat(14, "blocked")];
    return { body: { applied: 2, conflicts: [] } };
  });
  server.routes.set("PATCH /events/ev1", () => ({ body: {} }));
  server.routes.set("PUT /events/ev1/assignments/2", () => ({ body: {} }));
  return server;
}

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={["/organiser/ev1"]}>
      <ToastProvider>
        <Routes>
          <Route path="/organiser/:eventId" element={<OrganiserPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Organiser page", () => {
  it("gives the signed-out page a main heading and a way to sign in", async () => {
    const server = startFakeServer();
    server.routes.set("GET /events/ev1", () => errorReply(401, "unauthorised", "Please log in again."));
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Please sign in" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toContain("/login?next=");
  });

  it("previews auto-fill on the map, then applies it", async () => {
    const server = organiserServer(makeEvent());
    renderPage();
    expect(await screen.findByText(/guests seated/)).toBeTruthy();
    expect(screen.getByText("1 of 3")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Optimise" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview auto-fill" }));

    // The preview is on the map, marked, and nothing is applied yet.
    expect(await screen.findByRole("heading", { name: "Preview: Auto-fill (seed 0)" })).toBeTruthy();
    expect(screen.getByText("Preview, not applied.")).toBeTruthy();
    // Changed seats get the square "changed by preview" mark, not the attendee's "recommended" halo.
    expect(screen.getByRole("option", { name: "Table 1, seat 2, taken, Bea Costa, changed by preview" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "Score of this plan" })).toBeTruthy();
    expect(callsTo(server, "POST", "/events/ev1/scenarios/5/apply")).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Apply this plan" }));
    expect((await screen.findAllByText("Auto-fill (seed 0) applied. You can undo it.")).length).toBeGreaterThan(0);
    expect(callsTo(server, "POST", "/events/ev1/scenarios/5/apply")).toHaveLength(1);
    expect(screen.queryByText("Preview, not applied.")).toBeNull();
    expect(screen.getByText("3 of 3")).toBeTruthy();
  });

  it("previews what attendees will see before saving a privacy mode", async () => {
    const server = organiserServer(makeEvent());
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: "Settings" }));

    const preview = screen.getByRole("table");
    // Full names: Ana is shown in full; Carl asked to be anonymous, so he is always "Guest".
    expect(within(preview).getAllByText("Ana Silva")).toHaveLength(2);
    expect(within(preview).getByText("Guest")).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: /First name and last initial/ }));
    expect(within(preview).getByText("Ana S.")).toBeTruthy();
    expect(within(preview).getByText("Bea C.")).toBeTruthy();
    expect(callsTo(server, "PATCH", "/events/ev1")).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Save privacy setting" }));
    expect((await screen.findAllByText(/Privacy setting saved/)).length).toBeGreaterThan(0);
    expect(callsTo(server, "PATCH", "/events/ev1")).toEqual([{ privacy_mode: "first_initial" }]);
  });

  it("places a guest with the keyboard alternative: Place, then a seat", async () => {
    const server = organiserServer(makeEvent());
    renderPage();
    const list = await screen.findByRole("list", { name: "Guests" });
    const bea = within(list).getByText("Bea Costa").closest("li") as HTMLElement;
    // Each row's buttons carry the guest's name, so a screen reader's button list is not 28 times "Place".
    fireEvent.click(within(bea).getByRole("button", { name: "Place Bea Costa" }));
    fireEvent.click(screen.getByRole("option", { name: /Table 1, seat 2, free/ }));
    expect((await screen.findAllByText("Bea Costa now sits at Table 1, seat 2.")).length).toBeGreaterThan(0);
    expect(callsTo(server, "PUT", "/events/ev1/assignments/2")).toEqual([{ seat_id: 12 }]);
  });

  it("names the guest in every row button", async () => {
    organiserServer(makeEvent());
    renderPage();
    const list = await screen.findByRole("list", { name: "Guests" });
    const bea = within(list).getByText("Bea Costa").closest("li") as HTMLElement;
    expect(within(bea).getByRole("button", { name: "New link for Bea Costa" })).toBeTruthy();
    expect(within(bea).getByRole("button", { name: "Delete data of Bea Costa" })).toBeTruthy();
    fireEvent.click(within(bea).getByRole("button", { name: "Place Bea Costa" }));
    expect(within(bea).getByRole("button", { name: "Choosing seat for Bea Costa..." })).toBeTruthy();
  });

  it("brings the map into view and into focus when Place is pressed far below it", async () => {
    organiserServer(makeEvent());
    renderPage();
    const list = await screen.findByRole("list", { name: "Guests" });
    // On a phone the map sits above a long list: pretend it is 5,000 px above the screen.
    const mapBox = document.querySelector(".ev-org-map") as HTMLElement;
    mapBox.getBoundingClientRect = () => ({ top: -5323, bottom: -4733, left: 0, right: 358, width: 358, height: 590, x: 0, y: -5323, toJSON: () => ({}) });
    const scrolled = vi.fn();
    mapBox.scrollIntoView = scrolled;
    const bea = within(list).getByText("Bea Costa").closest("li") as HTMLElement;
    fireEvent.click(within(bea).getByRole("button", { name: "Place Bea Costa" }));
    expect(scrolled).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole("listbox", { name: "Seating plan, Spring Gala" }));
  });

  it("leaves the focus on the button when the map is already on screen", async () => {
    organiserServer(makeEvent());
    renderPage();
    const list = await screen.findByRole("list", { name: "Guests" });
    const place = within(within(list).getByText("Bea Costa").closest("li") as HTMLElement).getByRole("button", { name: "Place Bea Costa" });
    place.focus();
    fireEvent.click(place);
    expect(document.activeElement).toBe(place);
  });

  it("writes occupant names on the organiser map once zoomed in", async () => {
    organiserServer(makeEvent());
    renderPage();
    await screen.findByRole("list", { name: "Guests" });
    const names = () => document.querySelector(".ev-org-map .occupant-names")?.textContent ?? "";
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    fireEvent.click(zoomIn);
    fireEvent.click(zoomIn);
    expect(names()).toContain("Ana Silva");
  });

  it("keeps keyboard focus on the page after previewing, applying and adding a guest", async () => {
    const data = makeEvent();
    const server = organiserServer(data);
    server.routes.set("POST /events/ev1/guests", () => ({ status: 201, body: { ...guest(9, "Dina Reis", null), rsvp: "pending", link: "/e/new" } }));
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: "Optimise" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview auto-fill" }));
    const heading = await screen.findByRole("heading", { name: "Preview: Auto-fill (seed 0)" });
    expect(document.activeElement).toBe(heading);

    fireEvent.click(screen.getByRole("button", { name: "Apply this plan" }));
    await screen.findByText("3 of 3");
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Undo and redo" }));
    // Everyone is seated now: no "Seats the 0 guests" sentence next to the disabled button.
    expect(screen.queryByText(/Seats the 0/)).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Guests" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Dina Reis" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "dina@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Add guest" }));
    await screen.findAllByText("Dina Reis was added. Their personal link is ready to copy.");
    expect(document.activeElement).toBe(screen.getByLabelText("Name"));
  });

  it("does not keep showing an exact-check result after the plan changed", async () => {
    const data = makeEvent();
    const server = organiserServer(data);
    const check: ExactCheck = {
      table_ids: [1],
      seats: 4,
      guests: 1,
      heuristic_seated: 1,
      exact_seated: 1,
      heuristic_score: 0,
      optimal_score: 0,
      gap_percent: 0,
      note: "Both plans seat the same guests; the gap compares their points.",
      proven_optimal: true,
      engine: "exhaustive",
      heuristic_ms: 3,
      exact_ms: 9,
    };
    server.routes.set("POST /events/ev1/optimise/exact-check", () => ({ body: check }));
    server.routes.set("POST /events/ev1/undo", () => {
      data.guests = data.guests.map((g) => (g.id === 1 ? { ...g, seat_id: null } : g));
      return { body: { applied: 0, conflicts: [], label: "Start", seq: 1 } };
    });
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: "Optimise" }));
    fireEvent.click(screen.getByRole("button", { name: "Run exact check" }));
    expect(await screen.findByText("0%: our plan is already the best possible.")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    });
    await screen.findByText("0 of 3");
    expect(screen.queryByText("0%: our plan is already the best possible.")).toBeNull();
    expect(screen.getByText(/The plan has changed since this check/)).toBeTruthy();
  });

  it("explains an exact check whose plans seat different numbers of guests", async () => {
    const server = organiserServer(makeEvent());
    server.routes.set("POST /events/ev1/optimise/exact-check", () => ({
      body: {
        table_ids: [1],
        seats: 4,
        guests: 3,
        heuristic_seated: 2,
        exact_seated: 3,
        heuristic_score: 30,
        optimal_score: 24,
        gap_percent: null,
        note: "The heuristic left 1 guest unseated that the optimum seats.",
        proven_optimal: true,
        engine: "exhaustive",
        heuristic_ms: 3,
        exact_ms: 9,
      },
    }));
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: "Optimise" }));
    fireEvent.click(screen.getByRole("button", { name: "Run exact check" }));
    expect(await screen.findByText("The heuristic left 1 guest unseated that the optimum seats.")).toBeTruthy();
    expect(screen.getByText("Our plan 2, best possible 3")).toBeTruthy();
    expect(screen.queryByText(/%: our plan/)).toBeNull();
  });
});
