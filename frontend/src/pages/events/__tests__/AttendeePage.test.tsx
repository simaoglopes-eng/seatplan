import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AttendeeView, SeatRecommendation } from "../../../api/events";
import type { MapSeat, SeatState } from "../../../api/types";
import { ToastProvider } from "../../../design/components";
import AttendeePage from "../AttendeePage";
import { callsTo, errorReply, startFakeServer } from "./mockServer";
import type { FakeServer } from "./mockServer";

// Shapes copy backend/app/routers/attendee.py. One table with four seats in a
// row; seat 12 is where Maya sits.
function seat(id: number, state: SeatState, occupant: string | null = null): MapSeat {
  return { id, table_id: 1, label: String(id - 10), x: 40 * (id - 10), y: 50, state, accessible: false, occupant };
}

function makeView(): AttendeeView {
  return {
    venue: { name: "Quinta da Luz" },
    event: {
      public_id: "spring",
      name: "Spring Gala",
      starts_at: "2027-03-14T19:30:00Z",
      ends_at: "2027-03-14T23:30:00Z",
      privacy_mode: "first_initial",
      change_deadline: null,
      deadline_passed: false,
      live_scope: "event-spring",
    },
    me: {
      id: 1,
      name: "Ana Silva",
      shown_to_others_as: "Ana S.",
      rsvp: "pending",
      wants_anonymous: false,
      needs_accessible: false,
      seat_id: null,
      held_seat_id: null,
      held_until: null,
      knows: [],
    },
    map: {
      width: 300,
      height: 120,
      zones: [],
      tables: [{ id: 1, label: "1", shape: "rect", x: 20, y: 30, w: 180, h: 40, rotation: 0 }],
      seats: [seat(11, "free"), seat(12, "taken", "Maya R."), seat(13, "free"), seat(14, "free")],
    },
    people: [
      { id: 2, name: "Maya R.", seat_id: 12, known: false },
      { id: 3, name: "Guest", seat_id: null, known: false },
    ],
  };
}

const RECS: SeatRecommendation[] = [
  { seat_id: 13, seat_label: "3", table_label: "1", rank: 1, match: "strong", reasons: ["Next to Maya R."], known_nearby: [{ guest_id: 2, name: "Maya R." }] },
  { seat_id: 14, seat_label: "4", table_label: "1", rank: 2, match: "some", reasons: ["Same table as Maya R."], known_nearby: [{ guest_id: 2, name: "Maya R." }] },
];

function setSeat(view: AttendeeView, id: number, state: SeatState): void {
  view.map.seats = view.map.seats.map((s) => (s.id === id ? { ...s, state } : s));
}

/** A stateful fake attendee backend: answers change after each action, like the real one. */
function attendeeServer(view: AttendeeView): FakeServer {
  const server = startFakeServer();
  server.routes.set("GET /a/tok", () => ({ body: view }));
  server.routes.set("GET /a/tok/recommendations", () => ({ body: RECS }));
  server.routes.set("POST /a/tok/rsvp", (body) => {
    view.me.rsvp = (body as { rsvp: "yes" | "no" }).rsvp;
    return { body: {} };
  });
  server.routes.set("POST /a/tok/knows", (body) => {
    view.me.knows = (body as { guest_ids: number[] }).guest_ids;
    view.people = view.people.map((p) => ({ ...p, known: view.me.knows.includes(p.id) }));
    setSeat(view, 12, "friend");
    return { body: {} };
  });
  server.routes.set("POST /a/tok/hold", (body) => {
    const id = (body as { seat_id: number }).seat_id;
    setSeat(view, id, "held"); // the backend shows my own hold as "held" too
    view.me.held_seat_id = id;
    view.me.held_until = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    return { body: { seat_id: id, expires_at: view.me.held_until } };
  });
  server.routes.set("POST /a/tok/confirm", (body) => {
    const id = (body as { seat_id: number }).seat_id;
    setSeat(view, id, "mine");
    view.me.seat_id = id;
    return { body: {} };
  });
  return server;
}

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={["/e/tok"]}>
      <ToastProvider>
        <Routes>
          <Route path="/e/:token" element={<AttendeePage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

/** A view where the attendee already replied yes and listed Maya: the seat step opens at once. */
function seatStepView(): AttendeeView {
  const view = makeView();
  view.me.rsvp = "yes";
  view.me.knows = [2];
  setSeat(view, 12, "friend");
  return view;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Attendee page", () => {
  it("goes from the invitation to a confirmed seat", async () => {
    const server = attendeeServer(makeView());
    renderPage();
    expect(screen.getByText("Loading your invitation...")).toBeTruthy();

    // 1. Welcome: event name, date and the RSVP question.
    expect(await screen.findByRole("heading", { level: 1, name: "Spring Gala" })).toBeTruthy();
    expect(screen.getByText(/2027/)).toBeTruthy();
    expect(screen.getByText(/Quinta da Luz/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes, I will be there" }));

    // 2. People I know: anonymous guests are not listed; choose Maya.
    const maya = await screen.findByRole("checkbox", { name: "Maya R." });
    expect(screen.queryByRole("checkbox", { name: "Guest" })).toBeNull();
    fireEvent.click(maya);
    fireEvent.click(screen.getByRole("button", { name: "Continue with 1 person" }));
    expect(callsTo(server, "POST", "/a/tok/knows")).toEqual([{ guest_ids: [2] }]);

    // 3. Seat: the recommendation shows its reason; tap it, then hold it.
    const strip = await screen.findByRole("list", { name: "Recommended for you" });
    expect(within(strip).getByText("Next to Maya R.")).toBeTruthy();
    expect(within(strip).getByText("Best match")).toBeTruthy();
    expect(screen.getAllByText("Saved 1 person. Seats near them are suggested below.").length).toBeGreaterThan(0);
    fireEvent.click(within(strip).getByRole("button", { name: /Table 1, seat 3/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Hold this seat for 5 minutes" }));

    // The hold bar shows the seat and a countdown near 5:00.
    const bar = await screen.findByRole("region", { name: "Seat on hold" });
    expect(within(bar).getByText("Table 1, seat 3")).toBeTruthy();
    expect(within(bar).getByText(/^(5:00|4:59)$/)).toBeTruthy();
    fireEvent.click(within(bar).getByRole("button", { name: "Confirm this seat" }));

    // 4. Done: seat label and the email promise.
    expect(await screen.findByRole("heading", { name: "You are all set" })).toBeTruthy();
    expect(screen.getByText(/confirmation email with a calendar invite is on its way/)).toBeTruthy();
    expect(callsTo(server, "POST", "/a/tok/confirm")).toEqual([{ seat_id: 13 }]);
    expect(screen.getByRole("button", { name: "Change seat" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Release my seat" })).toBeTruthy();
  });

  it("keeps the countdown of a hold made before the page was reloaded", async () => {
    const view = seatStepView();
    setSeat(view, 13, "held");
    view.me.held_seat_id = 13;
    view.me.held_until = new Date(Date.now() + 3 * 60 * 1000).toISOString();
    attendeeServer(view);
    renderPage();
    const bar = await screen.findByRole("region", { name: "Seat on hold" });
    expect(within(bar).getByText("Table 1, seat 3")).toBeTruthy();
    expect(within(bar).getByText(/^(3:00|2:59)$/)).toBeTruthy();
  });

  it("explains a 409 conflict kindly and offers the next best seat", async () => {
    const view = seatStepView();
    const server = attendeeServer(view);
    // Someone else takes seat 13 a moment before us.
    server.routes.set("POST /a/tok/hold", (body) => {
      if ((body as { seat_id: number }).seat_id === 13) {
        setSeat(view, 13, "taken");
        return errorReply(409, "seat_taken", "That seat was just taken.");
      }
      return { body: { seat_id: 14, expires_at: new Date(Date.now() + 300000).toISOString() } };
    });
    renderPage();

    fireEvent.click(await screen.findByRole("option", { name: /Table 1, seat 3, free/ }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("That seat was just taken")).toBeTruthy();
    expect(within(alert).getByText(/Sorry about that/)).toBeTruthy();
    // The next best free recommendation is seat 4 (id 14).
    fireEvent.click(within(alert).getByRole("button", { name: "Hold Table 1, seat 4" }));
    expect(await screen.findByRole("region", { name: "Seat on hold" })).toBeTruthy();
    expect(callsTo(server, "POST", "/a/tok/hold")).toEqual([{ seat_id: 13 }, { seat_id: 14 }]);
  });

  it("warns when a live update shows my held seat was taken by someone else", async () => {
    const view = seatStepView();
    const server = attendeeServer(view);
    renderPage();
    fireEvent.click(await screen.findByRole("option", { name: /Table 1, seat 3, free/ }));
    await screen.findByRole("region", { name: "Seat on hold" });

    // Another attendee's change arrives through the live version (polled every 2 s in tests).
    setSeat(view, 13, "taken");
    server.version += 1;
    const alert = await screen.findByRole("alert", {}, { timeout: 4000 });
    expect(within(alert).getByText("That seat was just taken")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Seat on hold" })).toBeNull();
  });

  it("tells the attendee when the 5-minute hold has expired", async () => {
    const view = seatStepView();
    const server = attendeeServer(view);
    server.routes.set("POST /a/tok/confirm", () => errorReply(409, "hold_expired", "Your hold has expired."));
    renderPage();

    fireEvent.click(await screen.findByRole("option", { name: /Table 1, seat 3, free/ }));
    const bar = await screen.findByRole("region", { name: "Seat on hold" });
    fireEvent.click(within(bar).getByRole("button", { name: "Confirm this seat" }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Your 5 minutes ran out")).toBeTruthy();
    expect(within(alert).getByRole("button", { name: "Hold it again" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Seat on hold" })).toBeNull();
  });

  it("shows a clear message for an invalid or revoked link, without a pointless retry", async () => {
    const server = startFakeServer();
    server.routes.set("GET /a/tok", () => errorReply(404, "not_found", "Not found"));
    renderPage();
    expect(await screen.findByText("This link does not work")).toBeTruthy();
    expect(screen.getByText(/ask the organiser to send you a new link/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("does not promise seats near people who have no seat yet", async () => {
    const view = makeView();
    view.me.rsvp = "yes";
    view.people = [{ id: 3, name: "Joana C.", seat_id: null, known: false }];
    const server = attendeeServer(view);
    // Joana has no seat, so no seat is better than another: every pick is a plain option.
    const plain: SeatRecommendation[] = [
      { seat_id: 11, seat_label: "1", table_label: "1", rank: 1, match: "none", reasons: [], known_nearby: [] },
      { seat_id: 13, seat_label: "3", table_label: "1", rank: 2, match: "none", reasons: [], known_nearby: [] },
    ];
    server.routes.set("GET /a/tok/recommendations", () => ({ body: plain }));
    renderPage();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Joana C." }));
    fireEvent.click(screen.getByRole("button", { name: "Continue with 1 person" }));

    const strip = await screen.findByRole("list", { name: "Recommended for you" });
    expect(within(strip).queryByText("Best match")).toBeNull();
    expect(within(strip).getByText("Option 1")).toBeTruthy();
    expect(screen.getAllByText(/Nobody you chose has a seat yet/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Here are seats near them/)).toBeNull();
  });

  it("zooms the map to the seat when Show on map is pressed", async () => {
    attendeeServer(seatStepView());
    renderPage();
    const strip = await screen.findByRole("list", { name: "Recommended for you" });
    const map = screen.getByRole("listbox", { name: "Seat map, Spring Gala" });
    expect(map.getAttribute("aria-activedescendant") ?? "").not.toMatch(/-t13$/);
    fireEvent.click(within(strip).getByRole("button", { name: /Table 1, seat 3/ }));
    expect(map.getAttribute("aria-activedescendant")).toMatch(/-t13$/);
  });

  it("does not announce my own restored hold as someone else's change", async () => {
    const view = seatStepView();
    view.me.held_seat_id = 13;
    view.me.held_until = new Date(Date.now() + 3 * 60 * 1000).toISOString();
    const server = attendeeServer(view);
    renderPage();
    await screen.findByRole("region", { name: "Seat on hold" });
    // The server now reports my own hold as "held"; nothing about it is a conflict.
    setSeat(view, 13, "held");
    server.version += 1;
    await screen.findByRole("option", { name: /Table 1, seat 3, on hold/ }, { timeout: 4000 });
    expect(screen.queryByText(/by someone else/)).toBeNull();
  }, 6000);
});
