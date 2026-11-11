import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGuestToken, setGuestToken } from "../../../api/client";
import type { MyAccount } from "../../../api/guest";
import { ToastProvider } from "../../../design/components";
import { callsTo, errorReply, startFakeServer } from "../../events/__tests__/mockServer";
import { WhereAmI, accountView } from "../../join/__tests__/fixtures";
import AccountPage from "../AccountPage";
import GuestSignInPage from "../GuestSignInPage";
import MyEventsPage from "../MyEventsPage";
import MySeatPage from "../MySeatPage";

const ME: MyAccount = { account: { name: "Nina Lopes", email: "nina@example.com", created_at: "2026-11-10T10:00:00Z" }, events: [] };

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <Routes>
          <Route path="/my" element={<MyEventsPage />} />
          <Route path="/my/account" element={<AccountPage />} />
          <Route path="/my/sign-in" element={<GuestSignInPage />} />
          <Route path="/my/:eventId" element={<MySeatPage />} />
          <Route path="*" element={<WhereAmI />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("MyEventsPage", () => {
  it("shows the empty state and who is signed in", async () => {
    setGuestToken("g.7.0.9999999999.sig");
    const server = startFakeServer();
    server.routes.set("GET /guest/me", () => ({ body: ME }));
    renderAt("/my");
    expect(await screen.findByText("You have not joined any events yet. Open the link the organiser shared to join one.")).toBeTruthy();
    expect(screen.getByText("nina@example.com")).toBeTruthy();
    expect(screen.getByText("This signs you out on every device.")).toBeTruthy();
  });

  it("lists each event with the seat in words and an Open link", async () => {
    setGuestToken("g.7.0.9999999999.sig");
    const server = startFakeServer();
    const event = { event_id: "spring", name: "Spring Gala", starts_at: "2027-03-14T19:30:00Z", ends_at: "2027-03-14T23:30:00Z", venue_name: "Quinta da Luz", deadline_passed: false, rsvp: "yes" as const };
    server.routes.set("GET /guest/me", () => ({ body: { ...ME, events: [{ ...event, seat: { seat_label: "5", table_label: "T3" } }] } }));
    renderAt("/my");
    expect(await screen.findByText("Your seat: seat 5 at table T3")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Spring Gala" }).getAttribute("href")).toBe("/my/spring");
  });

  it("sends a person without a session to sign in", async () => {
    startFakeServer();
    renderAt("/my");
    expect(await screen.findByRole("heading", { level: 1, name: "Sign in to see your seat" })).toBeTruthy();
  });

  it("shows the message the join step left behind", async () => {
    setGuestToken("g.7.0.9999999999.sig");
    const server = startFakeServer();
    server.routes.set("GET /guest/me", () => ({ body: ME }));
    render(
      <MemoryRouter initialEntries={[{ pathname: "/my", state: { notice: "Your account is ready, but seat choices for this event have closed." } }]}>
        <Routes>
          <Route path="/my" element={<MyEventsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Your account is ready, but seat choices for this event have closed.")).toBeTruthy();
  });
});

describe("AccountPage", () => {
  async function openDialog(): Promise<HTMLElement> {
    renderAt("/my/account");
    fireEvent.click(await screen.findByRole("button", { name: "Delete my account" }));
    return screen.getByRole("dialog", { name: "Delete your account?" });
  }

  it("needs the password before deleting anything", async () => {
    setGuestToken("g.7.0.9999999999.sig");
    const server = startFakeServer();
    server.routes.set("GET /guest/me", () => ({ body: ME }));
    const dialog = await openDialog();
    expect(within(dialog).getByText(/This cannot be undone./)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete my account" }));
    expect(await within(dialog).findByText("Enter your password to delete your account.")).toBeTruthy();
    expect(callsTo(server, "POST", "/guest/me/delete")).toEqual([]);
  });

  it("says a wrong password is wrong and keeps the person signed in", async () => {
    setGuestToken("g.7.0.9999999999.sig");
    const server = startFakeServer();
    server.routes.set("GET /guest/me", () => ({ body: ME }));
    // The server answers a wrong password with a 422 on the password field.
    server.routes.set("POST /guest/me/delete", () => errorReply(422, "validation", "password: That password is not correct."));
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText("Your password"), { target: { value: "not my password" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete my account" }));
    expect(await within(dialog).findByText("That password is not correct.")).toBeTruthy();
    expect(getGuestToken()).toBe("g.7.0.9999999999.sig");
  });

  it("deletes with the password, forgets the session and says so", async () => {
    setGuestToken("g.7.0.9999999999.sig");
    const server = startFakeServer();
    server.routes.set("GET /guest/me", () => ({ body: ME }));
    server.routes.set("POST /guest/me/delete", () => ({ body: { deleted: true } }));
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText("Your password"), { target: { value: "my long password" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete my account" }));
    const heading = await screen.findByRole("heading", { level: 1, name: "Your account is deleted." });
    expect(callsTo(server, "POST", "/guest/me/delete")).toEqual([{ password: "my long password" }]);
    expect(getGuestToken()).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByRole("link", { name: "Back to the home page" })).toBeTruthy();
  });
});

describe("MySeatPage", () => {
  it("sends a person without a session to sign in, coming back afterwards", async () => {
    startFakeServer();
    renderAt("/my/spring");
    expect(await screen.findByRole("heading", { level: 1, name: "Sign in to see your seat" })).toBeTruthy();
  });

  it("uses the account calls and offers the seat picked as a visitor", async () => {
    setGuestToken("g.7.0.9999999999.sig");
    window.sessionStorage.setItem("seatplan.wanted-seat.event-spring", "15");
    const server = startFakeServer();
    server.routes.set("GET /guest/me", () => ({ body: ME }));
    server.routes.set("GET /guest/events/spring", () => ({ body: accountView() }));
    server.routes.set("GET /guest/events/spring/recommendations", () => ({ body: [] }));
    renderAt("/my/spring");
    expect(await screen.findByRole("button", { name: "Hold this seat for 5 minutes" })).toBeTruthy();
    expect(screen.getByText("Table T1, seat 5")).toBeTruthy();
    expect(await screen.findByText("nina@example.com")).toBeTruthy();
    expect(callsTo(server, "GET", "/a/spring")).toEqual([]);
    // Used once, then forgotten.
    expect(window.sessionStorage.getItem("seatplan.wanted-seat.event-spring")).toBeNull();
  });

  it("explains that this account is not on the event's guest list (404)", async () => {
    setGuestToken("g.7.0.9999999999.sig");
    const server = startFakeServer();
    server.routes.set("GET /guest/me", () => ({ body: ME }));
    server.routes.set("GET /guest/events/spring", () => errorReply(404, "not_found", "You are not on the guest list of this event."));
    renderAt("/my/spring");
    expect(await screen.findByText("You are not on the guest list of this event with this account.")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "My events" }).length).toBeGreaterThan(0);
  });

  it("goes to sign in when the server ends the session (401)", async () => {
    setGuestToken("g.7.0.9999999999.sig");
    const server = startFakeServer();
    server.routes.set("GET /guest/me", () => errorReply(401, "unauthorised", "Please sign in again."));
    server.routes.set("GET /guest/events/spring", () => errorReply(401, "unauthorised", "Please sign in again."));
    renderAt("/my/spring");
    expect(await screen.findByRole("heading", { level: 1, name: "Sign in to see your seat" })).toBeTruthy();
    expect(getGuestToken()).toBeNull();
  });
});
