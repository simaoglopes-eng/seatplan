import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import HoursPage from "./HoursPage";
import { TEMPLATE_SCHEDULE } from "./hoursTemplate";

const VID = "rest01";
const API = `/api/staff/${VID}/schedule`;

function server(initial: unknown) {
  const puts: unknown[] = [];
  let current = initial;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), "http://localhost").pathname;
    const method = init?.method ?? "GET";
    if (path === API && method === "GET") return new Response(JSON.stringify(current));
    if (path === API && method === "PUT") {
      const body = JSON.parse(String(init?.body));
      puts.push(body);
      current = body;
      return new Response(JSON.stringify(body));
    }
    return new Response(JSON.stringify({ error: { code: "not_found", message: "No mock" } }), { status: 404 });
  }));
  return puts;
}

function open(): void {
  render(
    <MemoryRouter initialEntries={[`/owner/${VID}/hours`]}>
      <Routes>
        <Route path="/owner/:venueId/hours" element={<HoursPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("template", () => {
  it("is lunch and dinner from Tuesday to Sunday, with turn times", () => {
    const periods = TEMPLATE_SCHEDULE.service_periods;
    expect(periods).toHaveLength(12); // 6 days x 2 services
    expect(new Set(periods.map((p) => p.weekday))).toEqual(new Set([1, 2, 3, 4, 5, 6])); // Monday is 0: closed
    expect(periods.filter((p) => p.name === "Lunch").every((p) => p.start_time === "12:00" && p.end_time === "15:00")).toBe(true);
    expect(periods.filter((p) => p.name === "Dinner").every((p) => p.start_time === "19:00" && p.end_time === "23:00")).toBe(true);
    expect(TEMPLATE_SCHEDULE.turn_times.length).toBeGreaterThan(0);
    expect(TEMPLATE_SCHEDULE.blackout_dates).toEqual([]);
  });
});

describe("Opening hours step", () => {
  it("proposes a model when there are no services and saves it with one tap", async () => {
    const puts = server({ service_periods: [], turn_times: [], blackout_dates: [] });
    open();
    expect(await screen.findByText(/Lunch 12:00-15:00 and Dinner 19:00-23:00, Tuesday to Sunday/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use this" }));
    expect(await screen.findByRole("link", { name: /Next: rooms/ })).toBeTruthy();
    expect(puts).toHaveLength(1);
    expect((puts[0] as { service_periods: unknown[] }).service_periods).toHaveLength(12);
    expect(screen.queryByRole("button", { name: "Use this" })).toBeNull(); // saved: the proposal is gone
  });

  it("shows the schedule editor and no proposal when services already exist", async () => {
    server({
      service_periods: [{ name: "Dinner", weekday: 4, start_time: "19:00", end_time: "22:00", slot_minutes: 30, max_covers_per_slot: 20 }],
      turn_times: [{ max_party: 4, minutes: 90 }],
      blackout_dates: [],
    });
    open();
    expect(await screen.findByRole("button", { name: "Save schedule" })).toBeTruthy();
    expect(screen.queryByText(/Tuesday to Sunday/)).toBeNull();
    expect(screen.getByRole("link", { name: /Next: rooms/ }).getAttribute("href")).toBe(`/owner/${VID}/rooms`);
  });
});
