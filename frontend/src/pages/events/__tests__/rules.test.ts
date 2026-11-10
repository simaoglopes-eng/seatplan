import { describe, expect, it } from "vitest";
import type { AttendeeView } from "../../../api/events";
import type { MapSeat, SeatState } from "../../../api/types";
import { currentStep, lostSeat, nextBest } from "../attendeeRules";
import { deadlinePassed, formatCountdown, formatDateTime, formatDeadline, previewName } from "../format";
import { seatsNextToFriends } from "../friendSeats";

function seat(id: number, state: SeatState, tableId = 1): MapSeat {
  return { id, table_id: tableId, label: String(id), x: id * 30, y: 0, state, accessible: false };
}

function view(overrides: Partial<AttendeeView["me"]> = {}, deadline: string | null = null): AttendeeView {
  return {
    venue: { name: "Hall" },
    event: {
      name: "E",
      starts_at: "2027-01-01T00:00:00Z",
      ends_at: "2027-01-01T03:00:00Z",
      privacy_mode: "full_name",
      change_deadline: deadline,
      deadline_passed: false,
      live_scope: "event-e",
    },
    me: {
      id: 1,
      name: "Ana Silva",
      shown_to_others_as: "Ana Silva",
      rsvp: "yes",
      wants_anonymous: false,
      needs_accessible: false,
      seat_id: null,
      held_seat_id: null,
      held_until: null,
      knows: [],
      ...overrides,
    },
    map: { width: 1, height: 1, zones: [], tables: [], seats: [] },
    people: [{ id: 2, name: "Maya R.", seat_id: null, known: false }],
  };
}

describe("attendee rules", () => {
  it("picks the step in journey order", () => {
    expect(currentStep({ view: view({ rsvp: "pending" }), peopleDone: false, changingSeat: false })).toBe("welcome");
    expect(currentStep({ view: view({ rsvp: "no" }), peopleDone: false, changingSeat: false })).toBe("declined");
    expect(currentStep({ view: view(), peopleDone: false, changingSeat: false })).toBe("people");
    expect(currentStep({ view: view(), peopleDone: true, changingSeat: false })).toBe("seat");
    expect(currentStep({ view: view({ seat_id: 4 }), peopleDone: true, changingSeat: false })).toBe("done");
    expect(currentStep({ view: view({ seat_id: 4 }), peopleDone: true, changingSeat: true })).toBe("seat");
    expect(currentStep({ view: view({}, "2020-01-01T00:00:00Z"), peopleDone: true, changingSeat: false })).toBe("closed");
  });

  it("notices a lost hold only when it is taken, and a looked-at seat as soon as it is not free", () => {
    const hold = { seat_id: 1, expires_at: "2030-01-01T00:00:00Z" };
    expect(lostSeat([seat(1, "held")], hold, null)).toBeNull();
    expect(lostSeat([seat(1, "taken")], hold, null)).toBe(1);
    expect(lostSeat([seat(1, "friend")], hold, null)).toBe(1);
    expect(lostSeat([seat(2, "held")], null, 2)).toBe(2);
    expect(lostSeat([seat(2, "free")], null, 2)).toBeNull();
  });

  it("suggests the best recommendation that is still free", () => {
    const rec = (seatId: number, rank: number) => ({ seat_id: seatId, seat_label: "", table_label: null, rank, match: "some" as const, reasons: [], known_nearby: [] });
    const recs = [rec(1, 1), rec(2, 2), rec(3, 3)];
    expect(nextBest(recs, [seat(1, "taken"), seat(2, "held"), seat(3, "free")], 1)?.seat_id).toBe(3);
    expect(nextBest(recs, [seat(1, "taken")], 1)).toBeNull();
  });
});

describe("format helpers", () => {
  it("formats the countdown and never shows a negative time", () => {
    expect(formatCountdown(299)).toBe("4:59");
    expect(formatCountdown(5)).toBe("0:05");
    expect(formatCountdown(-3)).toBe("0:00");
  });

  it("previews names exactly like core/privacy.py", () => {
    expect(previewName("Ana Silva", "full_name", false)).toBe("Ana Silva");
    expect(previewName("Ana Maria Silva", "first_initial", false)).toBe("Ana S.");
    expect(previewName("Cher", "first_initial", false)).toBe("Cher");
    expect(previewName("Ana Silva", "anonymous", false)).toBe("Guest");
    expect(previewName("Ana Silva", "full_name", true)).toBe("Guest");
  });

  it("writes times on a 24-hour clock, so midnight is never a bare 12:00 AM", () => {
    const midnight = new Date(2027, 5, 6, 0, 0).toISOString();
    expect(formatDateTime(midnight)).toContain("00:00");
    expect(formatDateTime(midnight)).not.toMatch(/AM|PM/);
  });

  it("writes dates in British English whatever the browser's language, to match the page", () => {
    const text = formatDateTime(new Date(2026, 2, 14, 19, 30).toISOString());
    expect(text).toBe("Saturday, 14 March 2026 at 19:30");
  });

  it("writes a midnight deadline as the last minute of the day before", () => {
    const text = formatDeadline(new Date(2027, 5, 6, 0, 0).toISOString());
    expect(text).toContain("23:59");
    expect(text).toContain("5");
    expect(text).not.toContain("00:00");
    expect(formatDeadline(new Date(2027, 5, 6, 18, 30).toISOString())).toContain("18:30");
  });

  it("knows when a deadline has passed", () => {
    expect(deadlinePassed(null)).toBe(false);
    expect(deadlinePassed("2020-01-01T00:00:00Z")).toBe(true);
    expect(deadlinePassed("2999-01-01T00:00:00Z")).toBe(false);
  });

  it("finds free seats next to a friend at the same table only", () => {
    const seats = [seat(1, "free"), seat(2, "friend"), seat(3, "free"), seat(4, "free"), seat(5, "free", 2)];
    expect(Array.from(seatsNextToFriends(seats)).sort()).toEqual([1, 3]);
  });
});
