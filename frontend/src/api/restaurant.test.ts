// The conversions from what the backend sends to what the screens use.
// The server answers below are shortened copies of real answers from the
// demo backend (2026-11-10).
import { describe, expect, it } from "vitest";
import { startNeeds } from "../pages/restaurant/useBookingFlow";
import { toDashboard, toDinerMap, toHold, toSlots, toWhatIf } from "./restaurant";
import type { RestaurantInfo, ServerDashboard } from "./restaurant";
import { dinerMap } from "../pages/restaurant/__tests__/fixtures";

describe("restaurant conversions", () => {
  it("joins the labels of a held combination and keeps the hold id as text", () => {
    const hold = toHold({ hold_id: "abc", table: { table_ids: [5, 6], labels: ["T5", "T6"] }, table_choice: "auto", expires_at: "x" });
    expect(hold).toEqual({ hold_id: "abc", table: { id: 5, label: "T5 + T6" }, table_ids: [5, 6], expires_at: "x" });
  });

  it("draws a too-small table as blocked and keeps only the best recommendation", () => {
    const map = toDinerMap(dinerMap());
    expect(map.tables.find((t) => t.id === 10)?.state).toBe("blocked");
    expect(map.recommended).toEqual({ table_ids: [7], reasons: ["By the window", "Fits 4 exactly, no empty chairs"] });
    expect(toDinerMap({ ...dinerMap(), recommended: [] }).recommended).toBeNull();
  });

  it("gives a closed day its reason", () => {
    const closed = toSlots({ date: "2026-12-01", closed: true, reason: "Private event", slots: [] });
    expect(closed.closed_reason).toBe("Private event");
    expect(toSlots({ date: "2026-12-02", closed: false, reason: null, slots: [] }).closed_reason).toBeNull();
  });

  it("keeps why a time is full, so a passed time is not mistaken for a booked one", () => {
    const slots = toSlots({ date: "2026-12-02", closed: false, reason: null, slots: [{ time: "12:00", service: "Lunch", status: "full", reason: "past" }] });
    expect(slots.slots[0]?.reason).toBe("past");
  });

  it("says nothing fits when the what-if is impossible", () => {
    const answer = toWhatIf({ possible: false, table_ids: [], tables: [], reasons: ["No table fits"], displaced: [] });
    expect(answer.table_ids).toBeNull();
  });

  it("adds the per-service overbooking suggestions and turns percentages into rates", () => {
    const row = (service: string, extra: number) => ({
      service,
      start: "12:00",
      end: "15:00",
      covers: 30,
      covers_seated: 12,
      utilisation_percent: 24.8,
      overbooking_suggestion: { is_suggestion: true, extra_covers: extra, formula: "f" },
    });
    const server: ServerDashboard = {
      date: "2026-11-10",
      covers: { expected: 65, seated: 21, no_show: 0, cancelled: 4 },
      bookings: 19,
      seats: 72,
      no_show_rate: 0.06,
      no_show_based_on: 250,
      services: [row("Lunch", 1), row("Dinner", 2)],
    };
    const dashboard = toDashboard(server);
    expect(dashboard.covers_booked).toBe(65);
    expect(dashboard.covers_seated).toBe(21);
    expect(dashboard.services[0]).toEqual({ name: "Lunch", covers: 30, covers_seated: 12, utilisation: 0.248 });
    expect(dashboard.overbooking?.extra_covers).toBe(3);
    expect(toDashboard({ ...server, no_show_based_on: 0 }).overbooking).toBeNull();
  });
});

describe("booking link answers", () => {
  const info: RestaurantInfo = { public_id: "v", name: "V", timezone: "Europe/Lisbon", max_party: 8, services: [], blackout_dates: [] };

  it("uses the date and party from a waitlist offer link", () => {
    expect(startNeeds(info, { date: "2026-11-20", party: "4" }, "2026-11-10")).toMatchObject({ date: "2026-11-20", party: 4 });
  });

  it("ignores a past date, a strange party size and junk", () => {
    expect(startNeeds(info, { date: "2026-11-01", party: "40" }, "2026-11-10")).toMatchObject({ date: "2026-11-10", party: 2 });
    expect(startNeeds(info, { date: "tomorrow", party: "two" }, "2026-11-10")).toMatchObject({ date: "2026-11-10", party: 2 });
  });
});
