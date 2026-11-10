// Invented demo data for the restaurant tests. Fake people only, @example.com.
// Every fixture is typed with a "Server..." type: it is what the real backend
// sends (checked against it on 2026-11-10), so the tests also exercise the
// conversions in api/restaurant.ts.
import type {
  ServerBooking,
  ServerConfirmation,
  ServerDinerMap,
  ServerDinerTable,
  ServerFloor,
  ServerHold,
  ServerRestaurant,
  ServerSlots,
  ServerWhatIf,
  ExactCheck,
  ServicePlan,
  StaffTable,
} from "../../../api/restaurant";

export const VENUE = "casa-linho-01";

// Open every day, so the test does not depend on which weekday it runs.
export const INFO: ServerRestaurant = {
  public_id: VENUE,
  name: "Casa Linho",
  timezone: "Europe/Lisbon",
  max_party: 8,
  width: 600,
  height: 300,
  zones: [],
  schedule: {
    timezone: "Europe/Lisbon",
    service_periods: [0, 1, 2, 3, 4, 5, 6].flatMap((weekday) => [
      { name: "Lunch", weekday, start_time: "12:00", end_time: "15:00", slot_minutes: 15, max_covers_per_slot: 20 },
      { name: "Dinner", weekday, start_time: "19:00", end_time: "22:30", slot_minutes: 15, max_covers_per_slot: 20 },
    ]),
    turn_times: [{ max_party: 4, minutes: 120 }],
    blackout_dates: [],
  },
};

export const SLOTS: ServerSlots = {
  date: "2026-11-12",
  closed: false,
  reason: null,
  slots: [
    // A time that is already over today: the backend says "full" with reason "past".
    { time: "12:00", service: "Lunch", status: "full", reason: "past" },
    { time: "12:30", service: "Lunch", status: "available", reason: null },
    { time: "19:30", service: "Dinner", status: "limited", reason: null },
    { time: "20:00", service: "Dinner", status: "full", reason: "no_table" },
  ],
};

function table(id: number, label: string, x: number, extra: Partial<ServerDinerTable>): ServerDinerTable {
  return {
    id,
    label,
    shape: "round",
    x,
    y: 40,
    w: 60,
    h: 60,
    rotation: 0,
    zone_id: 1,
    zone_kind: "window",
    state: "free",
    accessible: false,
    min_party: 2,
    max_party: 4,
    high_chair_ok: false,
    combine_group: null,
    fits_party: true,
    ...extra,
  };
}

export function dinerMap(overrides: Partial<Record<number, Partial<ServerDinerTable>>> = {}): ServerDinerMap {
  return {
    date: "2026-11-12",
    time: "19:30",
    party: 2,
    slot_status: "limited",
    width: 600,
    height: 300,
    zones: [{ id: 1, name: "Window", kind: "window", x: 10, y: 10, w: 580, h: 200 }],
    tables: [
      table(7, "7", 40, { accessible: true, ...overrides[7] }),
      table(8, "8", 160, { high_chair_ok: true, ...overrides[8] }),
      table(9, "9", 280, { state: "taken", ...overrides[9] }),
      table(10, "10", 400, { max_party: 2, min_party: 1, state: "too_small", fits_party: false, ...overrides[10] }),
    ],
    seats: [],
    recommended: [{ table_ids: [7], labels: ["7"], waste: 0, reasons: ["By the window", "Fits 4 exactly, no empty chairs"] }],
  };
}

export function heldTable(id: number, label: string, holdId = "hold-token-41"): ServerHold {
  return {
    hold_id: holdId,
    table: { table_ids: [id], labels: [label] },
    table_choice: "chosen",
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  };
}

export const BOOKING: ServerBooking = {
  id: "bk1",
  restaurant: { public_id: VENUE, name: "Casa Linho" },
  date: "2026-11-12",
  time: "19:30",
  end_time: "21:30",
  slots: [78, 86],
  party_size: 4,
  name: "Ana Pereira",
  notes: "",
  needs_accessible: false,
  high_chairs: 0,
  status: "confirmed",
  source: "diner",
  table_choice: "chosen",
  table_ids: [7],
  tables: ["7"],
  max_party: 6,
};

export const CONFIRMATION: ServerConfirmation = {
  // Only GET /b/{token} carries max_party; the booking answer does not.
  booking: { ...BOOKING, max_party: undefined },
  manage_token: "tok123",
  manage_path: "/b/tok123",
  manage_link: "http://localhost:5173/b/tok123",
};

function staffTable(id: number, label: string, x: number, extra: Partial<StaffTable>): StaffTable {
  return {
    id,
    label,
    shape: "rect",
    x,
    y: 40,
    w: 70,
    h: 50,
    rotation: 0,
    zone_id: 1,
    accessible: false,
    status: "free",
    min_party: 2,
    max_party: 4,
    high_chair_ok: false,
    combine_group: "A",
    booking_id: null,
    party_size: null,
    name: null,
    ...extra,
  };
}

export const ARRIVAL: ServerBooking = {
  id: "bk-rui",
  restaurant: { public_id: VENUE, name: "Casa Linho" },
  date: "2026-11-12",
  time: "20:00",
  end_time: "21:30",
  slots: [80, 86],
  party_size: 2,
  name: "Rui Costa",
  notes: "",
  needs_accessible: false,
  high_chairs: 0,
  status: "confirmed",
  source: "diner",
  table_choice: "chosen",
  table_ids: [2],
  tables: ["2"],
};

export const FLOOR: ServerFloor = {
  width: 600,
  height: 300,
  date: "2026-11-12",
  time: "19:30",
  zones: [{ id: 1, name: "Terrace", kind: "terrace", x: 10, y: 10, w: 580, h: 200 }],
  seats: [],
  services: [{ name: "Dinner", start_time: "19:00", end_time: "22:30" }],
  tables: [
    staffTable(1, "1", 40, {}),
    staffTable(2, "2", 140, { status: "reserved", booking_id: "bk-rui", party_size: 2, name: "Rui Costa" }),
    staffTable(3, "3", 240, { max_party: 6 }),
  ],
  bookings: [ARRIVAL],
};

export const WHATIF_TABLE_3: ServerWhatIf = {
  possible: true,
  table_ids: [3],
  tables: ["3"],
  reasons: ["Only free table for 5", "Free until closing"],
  displaced: [],
};

export const SERVICE_PLAN: ServicePlan = {
  date: "2026-11-12",
  service: "Dinner",
  applied: false,
  plan_id: "0123456789abcdef",
  moves: [{ booking_id: "bk1", name: "Ana Pereira", party_size: 4, time: "19:30", from_tables: ["7"], to_tables: ["8"] }],
  before: { covers_seated: 30, wasted_seats: 6, parties_unseated: 0 },
  after: { covers_seated: 30, wasted_seats: 4, parties_unseated: 0 },
  fixed: 3,
  movable: 9,
};

export const EXACT_CHECK: ExactCheck = {
  date: "2026-11-12",
  service: "Dinner",
  parties_total: 11,
  parties_considered: 8,
  capped: true,
  heuristic: { covers_seated: 18, wasted_seats: 4, parties_unseated: 1, seconds: 0.004 },
  optimal: { covers_seated: 20, wasted_seats: 2, parties_unseated: 0, proven_optimal: true, method: "branch_and_bound", seconds: 0.21 },
  gap: { covers: 2, wasted_seats: 2, percent: 10 },
  matches_optimum: false,
};
