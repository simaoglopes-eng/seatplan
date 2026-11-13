// Typed client for the restaurant endpoints (docs/CONTRACT.md section 5,
// "Restaurants, diner" and "Restaurants, staff").
//
// Two kinds of types live here:
// - "Server..." types copy exactly what backend/app/routers/restaurants.py,
//   bookings.py and staff.py send. They were checked against a running
//   backend on 2026-11-10 (docs/decisions-log.md, "integration").
// - The other types are the shapes the screens use. Where the two differ, a
//   small "to..." function below turns one into the other, so every
//   difference between server and screen is visible in this one file.
// Field names are snake_case, exactly as the Python backend sends them.
import { api } from "./client";
import type { MapRoomSun, MapTable, MapZone, RoomLight, SeatMapPayload, SeatState } from "./types";

// ---------- Shared small shapes ----------

/** "2026-11-12": a calendar day in the restaurant's own time zone. */
export type IsoDate = string;
/** "19:30": a wall-clock time in the restaurant's own time zone. */
export type ClockTime = string;

export interface BlackoutDate {
  date: IsoDate;
  reason: string;
}

// ---------- Diner: restaurant and slots ----------

export interface ServiceSummary {
  name: string; // "Lunch", "Dinner"
  weekday: number; // 0 = Monday ... 6 = Sunday, like Python's date.weekday()
  start_time: ClockTime;
  end_time: ClockTime;
}

/** The restaurant as the booking page uses it. */
export interface RestaurantInfo {
  public_id: string;
  /** The public page's address; the booking page forwards there. Null or missing for a restaurant without one. */
  slug?: string | null;
  name: string;
  timezone: string;
  max_party: number;
  services: ServiceSummary[];
  blackout_dates: BlackoutDate[];
}

export type SlotStatus = "available" | "limited" | "full";

/**
 * Why a time is "full": "past" means the time is already over today, the
 * other two mean there is no room. Only "no room" is a reason to offer the
 * waitlist. null for times that are not full.
 */
export type SlotReason = "past" | "covers_cap" | "no_table";

export interface TimeSlot {
  time: ClockTime;
  service: string;
  status: SlotStatus;
  reason: SlotReason | null;
}

/** Times for one day. `closed_reason` is set on a blackout date. */
export interface SlotsResponse {
  date: IsoDate;
  closed_reason: string | null;
  slots: TimeSlot[];
}

/** What the diner told us in step 1. Sent along so the optimiser can respect it. */
export interface PartyNeeds {
  date: IsoDate;
  party: number;
  needs_accessible: boolean;
  high_chairs: number;
  /** Ambience wishes (sun, shade, view, quiet, away_from_wc). Sent only when there are some. */
  prefs?: string[];
}

// ---------- Diner: map and hold ----------

/** A table on the diner map. `state` is free, held (someone is choosing it), taken or blocked. */
export interface DinerTable extends MapTable {
  min_party: number;
  max_party: number;
  high_chair_ok: boolean;
  /** False when the table is too small, too big, or lacks a need the party has. */
  fits_party: boolean;
}

export interface Recommendation {
  table_ids: number[];
  reasons: string[];
}

/** The floor for one slot plus the optimiser's best pick. */
export interface DinerMap extends SeatMapPayload {
  tables: DinerTable[];
  recommended: Recommendation | null;
  /** The stay, "13:00" to "14:30": where the light cursor starts and ends. */
  stay_start?: ClockTime;
  stay_end?: ClockTime;
}

/** GET /r/{vid}/ambience: only what the light cursor needs to redraw (spec 7.6). */
export interface AmbienceAnswer {
  date: IsoDate;
  time: ClockTime;
  stay_start: ClockTime;
  stay_end: ClockTime;
  /** False when the restaurant has no coordinates: then nothing is said about the sun. */
  located: boolean;
  sun: MapRoomSun | null;
  rooms: { id: number | null; sun_patches: { x: number; y: number }[][]; night: boolean }[];
  tables: { id: number; light: RoomLight; phrases: string[] }[];
}

export interface HeldTable {
  id: number;
  /** "T5", or "T5 + T6" when the optimiser joined tables. */
  label: string;
}

export interface HoldResponse {
  hold_id: string;
  table: HeldTable;
  /** Every held table (more than one when the optimiser joined tables). */
  table_ids: number[];
  expires_at: string; // ISO date-time, UTC
}

/** A chair the diner may pick (spec 9.4). `blocked` chairs are shown but cannot be chosen. */
export interface TableSeats {
  tables: { id: number; label: string; shape: string; x: number; y: number; w: number; h: number; rotation: number }[];
  seats: { id: number; table_id: number; label: string; x: number; y: number; state: "free" | "blocked"; accessible: boolean; phrase: string | null }[];
}

/** The chair a booking was made with. `phrase` is only on the diner's own pages. */
export interface BookingSeat {
  id: number;
  label: string;
  table_id: number;
  phrase?: string | null;
}

// ---------- Bookings ----------

export type BookingStatus = "confirmed" | "seated" | "finishing" | "completed" | "cancelled" | "no_show";

/** One booking as the diner sees it (confirmation page and manage page). */
export interface BookingView {
  public_id: string;
  venue_public_id: string;
  venue_name: string;
  date: IsoDate;
  time: ClockTime;
  end_time: ClockTime;
  party_size: number;
  name: string;
  table_labels: string[];
  /** The tables of the booking; the chair can be picked among their chairs. */
  table_ids?: number[];
  status: BookingStatus;
  needs_accessible: boolean;
  high_chairs: number;
  notes: string;
  /** The wishes this booking was made with (sunny table, a view...). */
  prefs?: string[];
  seat?: BookingSeat | null;
  /** The biggest party this restaurant can seat. Only GET /b/{token} sends it, so it can be null. */
  max_party: number | null;
}

export interface ContactDetails {
  name: string;
  email: string;
  phone: string;
  notes: string;
}

/** `manage_url` is a path such as "/b/<token>"; `email` is where the confirmation goes. */
export interface BookingConfirmation {
  booking: BookingView;
  manage_url: string;
  email: string;
}

/** Body of POST /r/{vid}/waitlist, exactly as the backend reads it. */
export interface WaitlistRequest {
  date: IsoDate;
  time: ClockTime;
  party: number;
  name: string;
  email: string;
}

/** POST /r/{vid}/waitlist. */
export interface WaitlistAnswer {
  date: IsoDate;
  time: ClockTime;
  position: number;
  estimated_wait_minutes: number;
}

export interface BookingChange {
  time?: ClockTime;
  party_size?: number;
}

// ---------- Staff ----------

export type FloorStatus = "free" | "reserved" | "seated" | "finishing";

/** One table of GET /staff/{vid}/floor, exactly as the backend sends it. */
export interface StaffTable extends MapTable {
  status: FloorStatus;
  min_party: number;
  max_party: number;
  high_chair_ok: boolean;
  combine_group: string | null;
  /** The booking on this table at the chosen time, if any (its public id). */
  booking_id: string | null;
  party_size: number | null;
  name: string | null;
}

export type BookingSource = "diner" | "walk_in" | "staff";

export interface StaffBooking {
  id: string; // public_id
  name: string;
  party_size: number;
  time: ClockTime;
  end_time: ClockTime;
  status: BookingStatus;
  source: BookingSource;
  table_ids: number[];
  table_labels: string[];
  needs_accessible: boolean;
  high_chairs: number;
  notes: string;
  prefs?: string[];
  seat?: BookingSeat | null;
}

/** The staff floor. `services` lets the time scrubber know where a service starts and ends. */
export interface StaffFloor extends SeatMapPayload {
  date: IsoDate;
  time: ClockTime;
  tables: StaffTable[];
  bookings: StaffBooking[];
  services: { name: string; start_time: ClockTime; end_time: ClockTime }[];
}

export interface WalkinRequest {
  party_size: number;
  needs_accessible: boolean;
  high_chairs: number;
  table_ids: number[];
  date: IsoDate;
  time: ClockTime;
}

export interface Displaced {
  booking_id: string;
  name: string;
  party_size: number;
  from_labels: string[];
  to_labels: string[];
}

/** `table_ids` is null when nothing fits even after moves. */
export interface WhatIfAnswer {
  table_ids: number[] | null;
  table_labels: string[];
  reasons: string[];
  displaced: Displaced[];
}

export interface WhatIfRequest {
  party_size: number;
  date: IsoDate;
  time: ClockTime;
  needs_accessible: boolean;
  high_chairs: number;
}

export interface ServiceStats {
  name: string;
  covers: number;
  /** Guests of this service who really arrived (seated, finishing or completed). */
  covers_seated: number;
  /** Share of seat-minutes in use, 0 to 1. */
  utilisation: number;
}

export interface OverbookingSuggestion {
  extra_covers: number;
  explanation: string;
}

/** The dashboard as the screen uses it. Rates are 0 to 1. */
export interface Dashboard {
  date: IsoDate;
  covers_booked: number;
  /** Guests who really arrived, so staff can compare the promise with what happened. */
  covers_seated: number;
  covers_cancelled: number;
  services: ServiceStats[];
  no_show_rate: number;
  no_show_sample: number;
  overbooking: OverbookingSuggestion | null;
}

export interface ServicePeriod {
  name: string;
  weekday: number;
  start_time: ClockTime;
  end_time: ClockTime;
  slot_minutes: number;
  max_covers_per_slot: number;
}

export interface TurnTime {
  max_party: number;
  minutes: number;
}

/** The schedule as the Schedule tab edits it. */
export interface Schedule {
  services: ServicePeriod[];
  turn_times: TurnTime[];
  blackout_dates: BlackoutDate[];
}

// ---------- Staff: optimiser for one service ----------
// These two answers are used as the backend sends them (no "to..." function),
// because the screen needs every field. Shapes: restaurant_service/service_plan.py.

/** How good a plan is: the optimiser first seats more guests, then wastes fewer chairs. */
export interface PlanScore {
  covers_seated: number;
  wasted_seats: number;
  parties_unseated: number;
}

export interface PlanMove {
  booking_id: string;
  name: string;
  party_size: number;
  time: ClockTime;
  from_tables: string[];
  to_tables: string[];
}

/** POST /staff/{vid}/optimise/service. `applied` is false for a preview. */
export interface ServicePlan {
  date: IsoDate;
  service: string;
  applied: boolean;
  /** Fingerprint of exactly these moves; applying needs it back. */
  plan_id: string;
  moves: PlanMove[];
  before: PlanScore;
  after: PlanScore;
  /** Bookings that never move: the diner chose the table, or the party is already seated. */
  fixed: number;
  movable: number;
}

/** POST /staff/{vid}/optimise/exact-check. */
export interface ExactCheck {
  date: IsoDate;
  service: string;
  parties_total: number;
  parties_considered: number;
  /** True when only the first `parties_considered` bookings were checked. */
  capped: boolean;
  heuristic: PlanScore & { seconds: number };
  optimal: PlanScore & { proven_optimal: boolean; method: string; seconds: number };
  /** Optimum minus heuristic: extra guests, chairs saved, and the guests as a % of the optimum. */
  gap: { covers: number; wasted_seats: number; percent: number };
  matches_optimum: boolean;
}

// ---------- Server shapes (what the backend really sends) ----------

/** GET and PUT /staff/{vid}/schedule, and the `schedule` inside GET /r/{vid}. */
export interface ServerSchedule {
  timezone?: string;
  service_periods: ServicePeriod[];
  turn_times: TurnTime[];
  blackout_dates: BlackoutDate[];
}

/** GET /r/{vid}. */
export interface ServerRestaurant {
  public_id: string;
  slug?: string | null;
  name: string;
  timezone: string;
  max_party: number;
  width: number;
  height: number;
  zones: MapZone[];
  schedule: ServerSchedule;
}

/** GET /r/{vid}/slots. */
export interface ServerSlots {
  date: IsoDate;
  closed: boolean;
  reason: string | null;
  slots: TimeSlot[];
}

/** One table of GET /r/{vid}/map. "too_small" is a table state only the diner map uses. */
export interface ServerDinerTable extends Omit<DinerTable, "state"> {
  zone_kind: string;
  combine_group: string | null;
  state: SeatState | "too_small";
}

/** GET /r/{vid}/map: up to three recommendations, best first. */
export interface ServerDinerMap extends Omit<SeatMapPayload, "tables"> {
  date: IsoDate;
  time: ClockTime;
  stay_start?: ClockTime;
  stay_end?: ClockTime;
  party: number;
  slot_status: SlotStatus;
  tables: ServerDinerTable[];
  recommended: { table_ids: number[]; labels: string[]; waste: number; reasons: string[] }[];
}

/** POST /r/{vid}/hold. */
export interface ServerHold {
  hold_id: string;
  table: { table_ids: number[]; labels: string[] };
  table_choice: "chosen" | "auto";
  expires_at: string;
}

/** One booking (backend restaurant_service/booking_rows.describe). Never the email or the token. */
export interface ServerBooking {
  id: string;
  restaurant: { public_id: string; name: string };
  date: IsoDate;
  time: ClockTime;
  end_time: ClockTime;
  slots: number[];
  party_size: number;
  name: string;
  notes: string;
  /** Ambience wishes the diner ticked (sun, view, ...). Absent on old answers. */
  prefs?: string[];
  seat?: BookingSeat | null;
  needs_accessible: boolean;
  high_chairs: number;
  status: BookingStatus;
  source: BookingSource;
  table_choice: "chosen" | "auto";
  table_ids: number[];
  tables: string[];
  /** Only on GET /b/{token}. */
  can_change?: boolean;
  /** Only on GET /b/{token}: the biggest party the restaurant can seat. */
  max_party?: number;
}

/** POST /r/{vid}/bookings. The token appears only in this one answer. */
export interface ServerConfirmation {
  booking: ServerBooking;
  manage_token: string;
  manage_path: string;
  manage_link: string;
}

/** GET /staff/{vid}/floor. */
export interface ServerFloor extends Omit<StaffFloor, "bookings"> {
  bookings: ServerBooking[];
}

/** POST /staff/{vid}/whatif. */
export interface ServerWhatIf {
  possible: boolean;
  table_ids: number[];
  tables: string[];
  reasons: string[];
  displaced: { booking_id: string; name: string; party_size: number; from_tables: string[]; to_tables: string[] }[];
}

interface ServerServiceRow {
  service: string;
  start: ClockTime;
  end: ClockTime;
  covers: number;
  covers_seated: number;
  utilisation_percent: number;
  overbooking_suggestion: { is_suggestion: boolean; extra_covers: number; formula: string };
}

/** GET /staff/{vid}/dashboard. */
export interface ServerDashboard {
  date: IsoDate;
  covers: { expected: number; seated: number; no_show: number; cancelled: number };
  bookings: number;
  seats: number;
  no_show_rate: number;
  no_show_based_on: number;
  services: ServerServiceRow[];
}

// ---------- From server shapes to screen shapes ----------

export function toRestaurantInfo(server: ServerRestaurant): RestaurantInfo {
  return {
    public_id: server.public_id,
    slug: server.slug ?? null,
    name: server.name,
    timezone: server.timezone,
    max_party: server.max_party,
    services: server.schedule.service_periods,
    blackout_dates: server.schedule.blackout_dates,
  };
}

export function toSlots(server: ServerSlots): SlotsResponse {
  // The reason is kept: a time that has passed must not look like a full one.
  const slots = server.slots.map(({ time, service, status, reason }) => ({ time, service, status, reason }));
  return { date: server.date, closed_reason: server.closed ? (server.reason ?? "Closed on this day.") : null, slots };
}

export function toDinerMap(server: ServerDinerMap): DinerMap {
  // The shared seat map only knows the six seat states, so "too_small" is drawn as blocked.
  const tables = server.tables.map((table) => ({ ...table, state: table.state === "too_small" ? "blocked" : table.state }));
  const best = server.recommended[0];
  return { ...server, tables, recommended: best ? { table_ids: best.table_ids, reasons: best.reasons } : null };
}

export function toHold(server: ServerHold): HoldResponse {
  const table = { id: server.table.table_ids[0], label: server.table.labels.join(" + ") };
  return { hold_id: server.hold_id, table, table_ids: server.table.table_ids, expires_at: server.expires_at };
}

export function toBookingView(server: ServerBooking): BookingView {
  return {
    public_id: server.id,
    venue_public_id: server.restaurant.public_id,
    venue_name: server.restaurant.name,
    date: server.date,
    time: server.time,
    end_time: server.end_time,
    party_size: server.party_size,
    name: server.name,
    table_labels: server.tables,
    table_ids: server.table_ids ?? [],
    status: server.status,
    needs_accessible: server.needs_accessible,
    high_chairs: server.high_chairs,
    notes: server.notes,
    prefs: server.prefs ?? [],
    seat: server.seat ?? null,
    max_party: server.max_party ?? null,
  };
}

export function toStaffBooking(server: ServerBooking): StaffBooking {
  return {
    id: server.id,
    name: server.name,
    party_size: server.party_size,
    time: server.time,
    end_time: server.end_time,
    status: server.status,
    source: server.source,
    table_ids: server.table_ids,
    table_labels: server.tables,
    needs_accessible: server.needs_accessible,
    high_chairs: server.high_chairs,
    notes: server.notes,
    prefs: server.prefs ?? [],
    seat: server.seat ?? null,
  };
}

export function toWhatIf(server: ServerWhatIf): WhatIfAnswer {
  const displaced = server.displaced.map((d) => ({
    booking_id: d.booking_id,
    name: d.name,
    party_size: d.party_size,
    from_labels: d.from_tables,
    to_labels: d.to_tables,
  }));
  return { table_ids: server.possible ? server.table_ids : null, table_labels: server.tables, reasons: server.reasons, displaced };
}

/** One suggestion for the whole day: the backend gives one per service, so we add them up. */
function overbookingOf(server: ServerDashboard): OverbookingSuggestion | null {
  if (server.no_show_based_on === 0) return null;
  const extra = server.services.reduce((sum, row) => sum + row.overbooking_suggestion.extra_covers, 0);
  const rate = `${Math.round(server.no_show_rate * 100)}%`;
  const explanation = `For each service: expected covers x the ${rate} no-show rate of the last ${server.no_show_based_on} bookings, rounded down.`;
  return { extra_covers: extra, explanation };
}

export function toDashboard(server: ServerDashboard): Dashboard {
  return {
    date: server.date,
    covers_booked: server.covers.expected,
    covers_seated: server.covers.seated,
    covers_cancelled: server.covers.cancelled,
    services: server.services.map((row) => ({
      name: row.service,
      covers: row.covers,
      covers_seated: row.covers_seated,
      utilisation: row.utilisation_percent / 100,
    })),
    no_show_rate: server.no_show_rate,
    no_show_sample: server.no_show_based_on,
    overbooking: overbookingOf(server),
  };
}

export function toSchedule(server: ServerSchedule): Schedule {
  return { services: server.service_periods, turn_times: server.turn_times, blackout_dates: server.blackout_dates };
}

// ---------- Paths ----------
// Every id goes through encodeURIComponent, so a strange link cannot reach another path.

const diner = (vid: string): string => `/r/${encodeURIComponent(vid)}`;
const staff = (vid: string): string => `/staff/${encodeURIComponent(vid)}`;
const manage = (token: string): string => `/b/${encodeURIComponent(token)}`;

function query(values: Record<string, string | number | boolean>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) params.set(key, String(value));
  return params.toString();
}

/** The live-updates scope for one restaurant day (contract section 5, "Core"). */
export function venueDayScope(vid: string, date: IsoDate): string {
  return `venue-${vid}-${date}`;
}

// ---------- Diner calls ----------

export async function getRestaurant(vid: string): Promise<RestaurantInfo> {
  return toRestaurantInfo(await api.get<ServerRestaurant>(diner(vid)));
}

export async function getSlots(vid: string, date: IsoDate, party: number): Promise<SlotsResponse> {
  return toSlots(await api.get<ServerSlots>(`${diner(vid)}/slots?${query({ date, party })}`));
}

export async function getDinerMap(vid: string, needs: PartyNeeds, time: ClockTime): Promise<DinerMap> {
  const wishes: Record<string, string> = needs.prefs?.length ? { prefs: needs.prefs.join(",") } : {};
  const params = query({ date: needs.date, time, party: needs.party, accessible: needs.needs_accessible, high_chairs: needs.high_chairs, ...wishes });
  return toDinerMap(await api.get<ServerDinerMap>(`${diner(vid)}/map?${params}`));
}

/** The light of every room and table. `moment` is the cursor; `time` stays the start of the stay. */
export async function getAmbience(vid: string, needs: PartyNeeds, time: ClockTime, moment?: ClockTime): Promise<AmbienceAnswer> {
  const params = query({ date: needs.date, time, party: needs.party, ...(moment ? { moment } : {}) });
  return api.get<AmbienceAnswer>(`${diner(vid)}/ambience?${params}`);
}

/** Without `tableId` the optimiser picks the table ("Choose for me"). */
export async function holdTable(vid: string, needs: PartyNeeds, time: ClockTime, tableId: number | null): Promise<HoldResponse> {
  const { prefs, ...rest } = needs;
  const body = { ...rest, ...(prefs?.length ? { prefs } : {}), time, ...(tableId === null ? {} : { table_id: tableId }) };
  return toHold(await api.post<ServerHold>(`${diner(vid)}/hold`, body));
}

/** Gives a held table back at once (DELETE answers 204), so other diners can take it. */
export async function releaseHold(vid: string, holdId: string): Promise<void> {
  await api.delete<null>(`${diner(vid)}/hold/${encodeURIComponent(holdId)}`);
}

/** The chairs of the held tables, with the sentence about each one's view. */
export async function getTableSeats(vid: string, tableIds: number[]): Promise<TableSeats> {
  return api.get<TableSeats>(`${diner(vid)}/seats?${query({ table_ids: tableIds.join(",") })}`);
}

export async function createBooking(
  vid: string,
  holdId: string,
  contact: ContactDetails,
  needs: PartyNeeds,
  seatId: number | null = null,
): Promise<BookingConfirmation> {
  // The backend checks the party size against the hold, so it is sent again here.
  const wishes = needs.prefs?.length ? { prefs: needs.prefs } : {};
  const body = { hold_id: holdId, ...contact, party: needs.party, needs_accessible: needs.needs_accessible, high_chairs: needs.high_chairs, ...wishes, ...(seatId === null ? {} : { seat_id: seatId }) };
  const server = await api.post<ServerConfirmation>(`${diner(vid)}/bookings`, body);
  return { booking: toBookingView(server.booking), manage_url: server.manage_path, email: contact.email };
}

export function joinWaitlist(vid: string, entry: WaitlistRequest): Promise<WaitlistAnswer> {
  return api.post<WaitlistAnswer>(`${diner(vid)}/waitlist`, entry);
}

// ---------- Manage-or-cancel link ----------

export async function getBooking(token: string): Promise<BookingView> {
  return toBookingView(await api.get<ServerBooking>(manage(token)));
}

export async function changeBooking(token: string, change: BookingChange): Promise<BookingView> {
  return toBookingView(await api.patch<ServerBooking>(manage(token), change));
}

/** Another chair at the booking's own tables, or none (null). Sent on its own, never with a time change. */
export async function changeSeat(token: string, seatId: number | null): Promise<BookingView> {
  return toBookingView(await api.patch<ServerBooking>(manage(token), { seat_id: seatId }));
}

export async function cancelBooking(token: string): Promise<BookingView> {
  return toBookingView(await api.delete<ServerBooking>(manage(token)));
}

// ---------- Staff calls (need a signed-in session) ----------

export async function getFloor(vid: string, date: IsoDate, time: ClockTime): Promise<StaffFloor> {
  const server = await api.get<ServerFloor>(`${staff(vid)}/floor?${query({ date, time })}`);
  return { ...server, bookings: server.bookings.map(toStaffBooking) };
}

export async function seatWalkin(vid: string, walkin: WalkinRequest): Promise<StaffBooking> {
  return toStaffBooking(await api.post<ServerBooking>(`${staff(vid)}/walkins`, walkin));
}

export async function setBookingStatus(vid: string, bookingId: string, status: BookingStatus): Promise<StaffBooking> {
  const path = `${staff(vid)}/bookings/${encodeURIComponent(bookingId)}/status`;
  return toStaffBooking(await api.post<ServerBooking>(path, { status }));
}

/** Moves a booking; two or more table ids combine those tables. */
export async function moveBooking(vid: string, bookingId: string, tableIds: number[]): Promise<StaffBooking> {
  const path = `${staff(vid)}/bookings/${encodeURIComponent(bookingId)}/move`;
  return toStaffBooking(await api.post<ServerBooking>(path, { table_ids: tableIds }));
}

export async function askWhatIf(vid: string, question: WhatIfRequest): Promise<WhatIfAnswer> {
  return toWhatIf(await api.post<ServerWhatIf>(`${staff(vid)}/whatif`, question));
}

/** Shows who would move; nothing changes until applyServicePlan. */
export function previewServicePlan(vid: string, date: IsoDate, service: string): Promise<ServicePlan> {
  return api.post<ServicePlan>(`${staff(vid)}/optimise/service`, { date, service });
}

/** Writes the previewed plan. A 409 means the floor changed since the preview. */
export function applyServicePlan(vid: string, date: IsoDate, service: string, planId: string): Promise<ServicePlan> {
  return api.post<ServicePlan>(`${staff(vid)}/optimise/service`, { date, service, apply: true, plan_id: planId });
}

export function runExactCheck(vid: string, date: IsoDate, service: string): Promise<ExactCheck> {
  return api.post<ExactCheck>(`${staff(vid)}/optimise/exact-check`, { date, service });
}

export async function getDashboard(vid: string, date: IsoDate): Promise<Dashboard> {
  return toDashboard(await api.get<ServerDashboard>(`${staff(vid)}/dashboard?${query({ date })}`));
}

export async function getSchedule(vid: string): Promise<Schedule> {
  return toSchedule(await api.get<ServerSchedule>(`${staff(vid)}/schedule`));
}

export async function saveSchedule(vid: string, schedule: Schedule): Promise<Schedule> {
  const body = { service_periods: schedule.services, turn_times: schedule.turn_times, blackout_dates: schedule.blackout_dates };
  return toSchedule(await api.put<ServerSchedule>(`${staff(vid)}/schedule`, body));
}
