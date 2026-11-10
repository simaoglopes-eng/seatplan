import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

function renderHome(): void {
  render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Home demo links", () => {
  it("shows the demo entry points grouped by vertical", async () => {
    // Shape of GET /demo/links in backend/app/routers/demo.py: name -> path.
    const links = { attendee_ana: "/a/demo-token", diner: "/r/demo-venue", editor_bistro: "/editor/demo-venue" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ links }), { status: 200 })));
    renderHome();
    expect(screen.getByText("Loading demo links...")).toBeTruthy();
    // The API's attendee path /a/ is mapped to the page route /e/.
    const attendee = await screen.findByRole("link", { name: /Attendee Ana/ });
    expect(attendee.getAttribute("href")).toBe("/e/demo-token");
    expect(screen.getByRole("link", { name: /Diner/ }).getAttribute("href")).toBe("/r/demo-venue");
    expect(screen.getByRole("heading", { name: "Venue tools" })).toBeTruthy();
  });

  it("describes each link in words instead of printing its long secret token", async () => {
    // A real token is 43 characters with no place to break: printed, it pushed the page sideways on a phone.
    const token = "x".repeat(43);
    const links = { wedding_guest_choosing: `/a/${token}`, staff_floor: "/staff/demo-venue" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ links }), { status: 200 })));
    renderHome();
    const guest = await screen.findByRole("link", { name: /Wedding Guest Choosing/ });
    expect(guest.getAttribute("href")).toBe(`/e/${token}`);
    expect(guest.textContent).not.toContain(token);
    expect(guest.textContent).toContain("Opens one guest's personal invitation");
    expect(screen.getByRole("link", { name: /Staff Floor/ }).textContent).toContain("Runs the dining room during service");
  });

  it("shows an error with a working retry when the server is down", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    renderHome();
    expect(await screen.findByText("The demo is not reachable")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("explains an empty demo instead of showing nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ links: {} }), { status: 200 })));
    renderHome();
    expect(await screen.findByText("The demo is switched off")).toBeTruthy();
  });
});
