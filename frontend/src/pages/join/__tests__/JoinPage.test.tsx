import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setGuestToken } from "../../../api/client";
import { ToastProvider } from "../../../design/components";
import { errorReply, startFakeServer } from "../../events/__tests__/mockServer";
import type { FakeServer } from "../../events/__tests__/mockServer";
import JoinPage from "../JoinPage";
import { WhereAmI, visitorView } from "./fixtures";

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={["/j/tok"]}>
      <ToastProvider>
        <Routes>
          <Route path="/j/:token" element={<JoinPage />} />
          <Route path="*" element={<WhereAmI />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

/** No call a visitor makes may ever hold or confirm a seat. */
function seatWrites(server: FakeServer): string[] {
  return server.calls.filter((c) => /hold|confirm|seat$/.test(c.path)).map((c) => `${c.method} ${c.path}`);
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("JoinPage: the visitor's view of a shared link", () => {
  it("shows a loading state first, then the event, places left and both buttons", async () => {
    const server = startFakeServer();
    server.routes.set("GET /j/tok", () => ({ body: visitorView() }));
    renderPage();
    expect(screen.getByText("Loading the event...")).toBeTruthy();
    expect(await screen.findByRole("heading", { level: 1, name: "Spring Gala" })).toBeTruthy();
    expect(screen.getByText("3 places left.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create an account to choose a seat" }).getAttribute("href")).toBe("/j/tok/register");
    expect(screen.getByRole("link", { name: "I already have an account" }).getAttribute("href")).toBe("/j/tok/sign-in");
    // The visitor call carries no session.
    expect(server.calls[0]).toMatchObject({ method: "GET", path: "/j/tok" });
  });

  it("explains a wrong or replaced link (404) without a map", async () => {
    const server = startFakeServer();
    server.routes.set("GET /j/tok", () => errorReply(404, "not_found", "Not found."));
    renderPage();
    expect(await screen.findByText("This link does not work. It may have been replaced by a new one. Ask the organiser for the current link.")).toBeTruthy();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("explains a link the organiser switched off (403) and offers sign-in", async () => {
    const server = startFakeServer();
    server.routes.set("GET /j/tok", () => errorReply(403, "link_closed", "Closed."));
    renderPage();
    expect(
      await screen.findByText("The organiser is not taking new guests through this link at the moment. If you already joined, sign in to see your seat."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/my/sign-in");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("asks people to wait when the network opened the page too often (429)", async () => {
    const server = startFakeServer();
    server.routes.set("GET /j/tok", () => errorReply(429, "rate_limited", "Slow down."));
    renderPage();
    expect(await screen.findByText("Too many people are opening this page from your network. Please wait a minute and try again.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("keeps the map but only offers sign-in when the event is full", async () => {
    const server = startFakeServer();
    server.routes.set("GET /j/tok", () => ({ body: visitorView({ open: false, places_left: 0, reason: "full" }) }));
    renderPage();
    expect(await screen.findByText("This event is full. Every place has a guest.")).toBeTruthy();
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Create an account to choose a seat" })).toBeNull();
    expect(screen.getByRole("link", { name: "I already have an account" })).toBeTruthy();
    // Invited guests still have their place: they may make an account to reach it.
    const invited = screen.getByRole("link", { name: "I was invited: create my account" });
    expect(invited.getAttribute("href")).toBe("/j/tok/register");
  });

  it("says seat choices have closed after the deadline", async () => {
    const server = startFakeServer();
    server.routes.set("GET /j/tok", () => ({ body: visitorView({ open: false, places_left: 0, reason: "deadline_passed" }) }));
    renderPage();
    expect(await screen.findByText("Seat choices for this event have closed.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Create an account to choose a seat" })).toBeNull();
    expect(screen.queryByRole("link", { name: "I was invited: create my account" })).toBeNull();
  });

  it("opens the join panel for a free seat, never holds it, and closes with Escape", async () => {
    const server = startFakeServer();
    server.routes.set("GET /j/tok", () => ({ body: visitorView() }));
    renderPage();
    fireEvent.click(await screen.findByRole("option", { name: /Table T1, seat 1, free/ }));

    const heading = screen.getByRole("heading", { name: "Seat 1 at table T1 is free" });
    expect(document.activeElement).toBe(heading);
    const panel = heading.closest("section") as HTMLElement;
    expect(within(panel).getByText(/To choose it, create an account/)).toBeTruthy();
    expect(within(panel).getByRole("link", { name: "Create an account to choose a seat" })).toBeTruthy();
    expect(seatWrites(server)).toEqual([]);
    // The wish is kept for the seat page, nothing more.
    expect(window.sessionStorage.getItem("seatplan.wanted-seat.event-spring")).toBe("11");

    fireEvent.keyDown(heading, { key: "Escape" });
    expect(screen.queryByRole("heading", { name: "Seat 1 at table T1 is free" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("listbox"));
  });

  it("does not open the panel for a seat that is not free", async () => {
    const server = startFakeServer();
    server.routes.set("GET /j/tok", () => ({ body: visitorView() }));
    renderPage();
    fireEvent.click(await screen.findByRole("option", { name: /Table T1, seat 2, taken/ }));
    expect(screen.getByText("Table T1, seat 2 is not available.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /is free/ })).toBeNull();
    expect(seatWrites(server)).toEqual([]);
  });

  it("lets a signed-in account holder join and opens their seat page", async () => {
    setGuestToken("g.1.0.9999999999.sig");
    const server = startFakeServer();
    server.routes.set("GET /j/tok", () => ({ body: visitorView() }));
    server.routes.set("POST /j/tok/join", () => ({ body: { status: "joined", event_id: "spring" } }));
    renderPage();
    expect(screen.queryByRole("link", { name: "Create an account to choose a seat" })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Join this event" }));
    expect((await screen.findByTestId("where")).textContent).toBe("/my/spring");
  });

  it("tells a signed-in account holder when the event filled up meanwhile", async () => {
    setGuestToken("g.1.0.9999999999.sig");
    const server = startFakeServer();
    server.routes.set("GET /j/tok", () => ({ body: visitorView() }));
    server.routes.set("POST /j/tok/join", () => errorReply(409, "event_full", "No place left."));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Join this event" }));
    expect(await screen.findByText("You are signed in, but this event is full. Every place has a guest.")).toBeTruthy();
  });

  it("tells a signed-in account holder when the organiser removed them", async () => {
    setGuestToken("g.1.0.9999999999.sig");
    const server = startFakeServer();
    server.routes.set("GET /j/tok", () => ({ body: visitorView() }));
    server.routes.set("POST /j/tok/join", () =>
      errorReply(403, "forbidden", "The organiser removed you from this event. Ask them if you think this is a mistake."),
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Join this event" }));
    expect(
      await screen.findByText("You are signed in, but the organiser removed you from this event. Ask them if you think this is a mistake."),
    ).toBeTruthy();
  });
});
