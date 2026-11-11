// Typed client for the events endpoints (docs/CONTRACT.md, section 5).
//
// The shapes copy backend/app/routers/events.py, routers/attendee.py and
// backend/app/events_service/. They were checked against a running backend
// on 2026-11-10 (see docs/decisions-log.md, "integration") and read again
// against the routers after the review fixes of the same day.
// Field names stay snake_case, exactly as the Python backend sends them.
import { API_BASE, ApiError, api, getSessionToken } from "./client";
import type { ApiErrorBody, MapSeat, SeatMapPayload } from "./types";

// ---------- Shared event shapes ----------

export type PrivacyMode = "full_name" | "first_initial" | "anonymous";
export type Rsvp = "pending" | "yes" | "no";

export interface EventSummary {
  /** Sent to the organiser only. */
  public_id?: string;
  name: string;
  /** ISO 8601 timestamps in UTC. */
  starts_at: string;
  ends_at: string;
  privacy_mode: PrivacyMode;
  /** After this moment attendees can no longer change seats. Null: no deadline. */
  change_deadline: string | null;
  deadline_passed: boolean;
  /** The scope for useLive, for example "event-abc123". */
  live_scope: string;
}

/** One number per term of the optimiser objective (ScoreBreakdown in events_model.py). */
export interface ScoreBreakdown {
  total: number;
  friend_adjacent: number;
  friend_same_table: number;
  group_adjacent: number;
  group_same_table: number;
  changes: number;
}

// ---------- Attendee (/a/{token}) ----------

export interface AttendeeMe {
  id: number;
  name: string;
  shown_to_others_as: string;
  rsvp: Rsvp;
  wants_anonymous: boolean;
  needs_accessible: boolean;
  seat_id: number | null;
  /** The seat this person holds right now (the map shows it as "held"). */
  held_seat_id: number | null;
  /** When that hold ends (ISO, UTC), so a reloaded page can keep counting down. */
  held_until: string | null;
  /** Guest ids this person said they know. */
  knows: number[];
}

/** Another attendee, with the name already filtered by core/privacy.py. */
export interface VisiblePerson {
  id: number;
  name: string;
  seat_id: number | null;
  /** True when I already listed this person as someone I know. */
  known: boolean;
}

export interface AttendeeView {
  /** Only the name: where the event takes place. */
  venue: { name: string };
  event: EventSummary;
  me: AttendeeMe;
  map: SeatMapPayload;
  people: VisiblePerson[];
}

/**
 * How good a recommended seat is, in words. The server never sends the raw
 * score: its size would reveal who listed this attendee as someone they know.
 */
export type MatchLevel = "strong" | "some" | "none";

export interface SeatRecommendation {
  seat_id: number;
  seat_label: string;
  table_label: string | null;
  /** 1 is the best seat for this attendee. */
  rank: number;
  /** "strong": next to someone I know; "some": near them; "none": nobody I know is near. */
  match: MatchLevel;
  /** Plain-language reasons, for example "Next to Maya R.". */
  reasons: string[];
  known_nearby: { guest_id: number; name: string }[];
}

export interface HoldResponse {
  seat_id: number;
  expires_at: string;
}

function attendeePath(token: string, rest = ""): string {
  return `/a/${encodeURIComponent(token)}${rest}`;
}

export function getAttendeeView(token: string): Promise<AttendeeView> {
  return api.get<AttendeeView>(attendeePath(token));
}

/** Other attendees whose shown name matches `q`, names already filtered by the server. */
export function getPeople(token: string, q: string): Promise<VisiblePerson[]> {
  return api.get<VisiblePerson[]>(attendeePath(token, `/people?q=${encodeURIComponent(q)}`));
}

export function sendRsvp(token: string, rsvp: "yes" | "no"): Promise<unknown> {
  return api.post(attendeePath(token, "/rsvp"), { rsvp });
}

/** Replaces the whole list of people I know. */
export function sendKnows(token: string, guestIds: number[]): Promise<unknown> {
  return api.post(attendeePath(token, "/knows"), { guest_ids: guestIds });
}

export function sendPrivacy(token: string, wantsAnonymous: boolean): Promise<unknown> {
  return api.post(attendeePath(token, "/privacy"), { wants_anonymous: wantsAnonymous });
}

export function getRecommendations(token: string): Promise<SeatRecommendation[]> {
  return api.get<SeatRecommendation[]>(attendeePath(token, "/recommendations"));
}

/** Holds a seat for 5 minutes. A 409 `seat_taken` means someone else was faster. */
export function holdSeat(token: string, seatId: number): Promise<HoldResponse> {
  return api.post<HoldResponse>(attendeePath(token, "/hold"), { seat_id: seatId });
}

export function confirmSeat(token: string, seatId: number): Promise<unknown> {
  return api.post(attendeePath(token, "/confirm"), { seat_id: seatId });
}

export function releaseSeat(token: string): Promise<unknown> {
  return api.delete(attendeePath(token, "/seat"));
}

// ---------- Organiser (/events) ----------

/** Organiser map seats carry more than the attendee map: real names and who placed them. */
export interface OrganiserSeat extends MapSeat {
  guest_id?: number | null;
  source?: "self" | "organiser" | "optimiser" | null;
  blocked?: boolean;
  reserved_tag?: "vip" | "family" | "speaker" | null;
}

/** GET /events/{eid}. */
export interface EventDetail {
  event: EventSummary;
  venue: { public_id: string; name: string };
  map: SeatMapPayload & { seats: OrganiserSeat[] };
  /** Coming guests who did not pick their own seat (some were placed for them). */
  not_chosen: { guest_id: number; name: string; has_seat: boolean }[];
  counts: { guests: number; seated: number; chosen_by_self: number };
}

/** One row of GET /events/{eid}/guests. Never contains the token. Erased guests are left out. */
export interface OrganiserGuest {
  id: number;
  name: string;
  email: string | null;
  group: string | null;
  rsvp: Rsvp;
  wants_anonymous: boolean;
  needs_accessible: boolean;
  dietary_note: string | null;
  reserved_tag: "vip" | "family" | "speaker" | null;
  seat_id: number | null;
  /** "self_registered": joined with the shared link (docs/guest-accounts.md). */
  source: GuestSource;
  /** True when a guest account belongs to this row. Never the account's id or email. */
  has_account: boolean;
}

export type GuestSource = "invited" | "self_registered";

/** GET, PATCH /events/{eid}/share and POST .../share/regenerate (docs/guest-accounts.md 6.3). */
export interface ShareSettings {
  enabled: boolean;
  /** "/j/<token>", a path: the page adds its own origin. Null when never switched on, or when it must be made again. */
  link: string | null;
  /** True when the server secret changed since the link was made: a new link is needed. */
  needs_new_link: boolean;
  /** Most people who may join with the link; null means no cap. */
  cap: number | null;
  /** Active guests who joined with the link. */
  joined: number;
  /** Seats that are not blocked. */
  capacity: number;
  /** Active guests, any source. */
  guests: number;
  /** The same number visitors see. */
  places_left: number;
}

export interface SharePatch {
  enabled?: boolean;
  cap?: number | null;
}

/** Both organiser reads together: the screen always needs the map and the list. */
export interface OrganiserEvent extends EventDetail {
  guests: OrganiserGuest[];
}

/** The token is stored only as a hash, so a link exists only in the answer that created it. */
export type GuestWithLink = OrganiserGuest & { link: string };

export interface ImportRowError {
  line: number;
  message: string;
}

/** All or nothing: when `errors` is not empty, nothing was imported. */
export interface ImportResult {
  imported: number;
  errors: ImportRowError[];
  guests: { id: number; name: string; link: string }[];
}

export interface Scenario {
  /** The per-event sequence number used in the scenario URLs. */
  id: number;
  label: string;
  score: ScoreBreakdown;
  seated: number;
  unseated: number[];
  /** Guests whose seat would change. */
  moved: number[];
  /** Guest id (as text) to seat id, so the map can draw the preview. */
  assignments: Record<string, number>;
  iterations: number;
  seed: number;
}

export interface ScenarioComparison {
  a: Scenario;
  b: Scenario;
  delta: ScoreBreakdown;
  guests_seated_differently: number;
  /** Ids of those guests. */
  guest_ids: number[];
}

/** One organiser move in a what-if question. */
export interface Move {
  guest_id: number;
  seat_id: number;
}

export interface WhatIfResult {
  before: ScoreBreakdown;
  after: ScoreBreakdown;
  delta: ScoreBreakdown;
  /** Hard rules the move would break; empty when the move is allowed. */
  hard_rule_problems: string[];
}

export interface ExactCheck {
  table_ids: number[];
  seats: number;
  guests: number;
  /** How many guests each plan seats. Points are only compared when these are equal. */
  heuristic_seated: number;
  exact_seated: number;
  heuristic_score: number;
  optimal_score: number;
  /** Null when the two plans seat a different number of guests; `note` then says why. */
  gap_percent: number | null;
  /** One plain sentence about how the two plans were compared. */
  note: string;
  proven_optimal: boolean;
  engine: string;
  heuristic_ms: number;
  exact_ms: number;
}

/** A planned seat that was not written, because someone chose or changed it meanwhile. */
export interface PlanConflict {
  guest_id: number;
  name: string | null;
  seat_id: number;
  reason: string;
}

export interface ApplyResult {
  applied: number;
  conflicts: PlanConflict[];
}

/** Undo and redo apply an older plan, so they answer like apply plus which step they reached. */
export interface HistoryStep extends ApplyResult {
  label: string;
  seq: number;
}

export interface SeatingChart {
  event: { name: string; starts_at: string };
  tables: { id: number; label: string; seats: { seat_id: number; label: string; name: string | null }[] }[];
  place_cards: { name: string; table: string; seat: string }[];
  unseated: string[];
}

export interface EventPatch {
  privacy_mode?: PrivacyMode;
  change_deadline?: string | null;
}

function eventPath(eventId: string, rest = ""): string {
  return `/events/${encodeURIComponent(eventId)}${rest}`;
}

export async function getOrganiserEvent(eventId: string): Promise<OrganiserEvent> {
  const [detail, guests] = await Promise.all([
    api.get<EventDetail>(eventPath(eventId)),
    api.get<OrganiserGuest[]>(eventPath(eventId, "/guests")),
  ]);
  return { ...detail, guests };
}

export function patchEvent(eventId: string, patch: EventPatch): Promise<unknown> {
  return api.patch(eventPath(eventId), patch);
}

export function addGuest(eventId: string, guest: { name: string; email: string }): Promise<GuestWithLink> {
  return api.post<GuestWithLink>(eventPath(eventId, "/guests"), guest);
}

/** Erases the guest's personal data on the server. */
export function deleteGuest(eventId: string, guestId: number): Promise<unknown> {
  return api.delete(eventPath(eventId, `/guests/${guestId}`));
}

/** Makes a new personal link; the old one stops working at once. */
export function newGuestLink(eventId: string, guestId: number): Promise<{ token: string; link: string }> {
  return api.post<{ token: string; link: string }>(eventPath(eventId, `/guests/${guestId}/new-link`));
}

export function getShare(eventId: string): Promise<ShareSettings> {
  return api.get<ShareSettings>(eventPath(eventId, "/share"));
}

export function patchShare(eventId: string, changes: SharePatch): Promise<ShareSettings> {
  return api.patch<ShareSettings>(eventPath(eventId, "/share"), changes);
}

/** Makes a new shared link; the old one stops working at once. */
export function regenerateShare(eventId: string): Promise<ShareSettings> {
  return api.post<ShareSettings>(eventPath(eventId, "/share/regenerate"), {});
}

export function getChart(eventId: string): Promise<SeatingChart> {
  return api.get<SeatingChart>(eventPath(eventId, "/chart"));
}

export function assignSeat(eventId: string, guestId: number, seatId: number): Promise<unknown> {
  return api.put(eventPath(eventId, `/assignments/${guestId}`), { seat_id: seatId });
}

export function autofill(eventId: string, seed = 0, maxIterations = 20000): Promise<Scenario> {
  return api.post<Scenario>(eventPath(eventId, "/optimise/autofill"), { seed, max_iterations: maxIterations });
}

export function replan(eventId: string): Promise<Scenario> {
  return api.post<Scenario>(eventPath(eventId, "/optimise/replan"));
}

export function applyScenario(eventId: string, scenarioId: number): Promise<ApplyResult> {
  return api.post<ApplyResult>(eventPath(eventId, `/scenarios/${scenarioId}/apply`));
}

export function listScenarios(eventId: string): Promise<Scenario[]> {
  return api.get<Scenario[]>(eventPath(eventId, "/scenarios"));
}

export function compareScenarios(eventId: string, a: number, b: number): Promise<ScenarioComparison> {
  return api.get<ScenarioComparison>(eventPath(eventId, `/scenarios/compare?a=${a}&b=${b}`));
}

export function whatIf(eventId: string, moves: Move[]): Promise<WhatIfResult> {
  return api.post<WhatIfResult>(eventPath(eventId, "/whatif"), { moves });
}

export function undo(eventId: string): Promise<HistoryStep> {
  return api.post<HistoryStep>(eventPath(eventId, "/undo"));
}

export function redo(eventId: string): Promise<HistoryStep> {
  return api.post<HistoryStep>(eventPath(eventId, "/redo"));
}

export function exactCheck(eventId: string): Promise<ExactCheck> {
  return api.post<ExactCheck>(eventPath(eventId, "/optimise/exact-check"));
}

// ---------- CSV in and out ----------
// Not through `request()`, because that helper speaks JSON only. The session
// header is added the same way, and a failure becomes an ApiError with the
// server's own code and message, exactly as `request()` would make it.

function csvHeaders(contentType: string | null): Headers {
  const headers = new Headers({ Accept: contentType === null ? "text/csv" : "application/json" });
  if (contentType) headers.set("Content-Type", contentType);
  const token = getSessionToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

/** The error the server sent, or the same general wording request() uses when it sent none. */
function csvError(status: number, text: string): ApiError {
  try {
    const { error } = JSON.parse(text) as ApiErrorBody;
    if (typeof error.code === "string" && typeof error.message === "string") {
      return new ApiError(status, error.code, error.message);
    }
  } catch {
    // Not the usual JSON error body: fall through to the general message.
  }
  const message =
    status >= 500
      ? `The SeatPlan server is not answering right now (HTTP ${status}). Please try again shortly.`
      : `Something went wrong (HTTP ${status}).`;
  return new ApiError(status, "unknown", message);
}

async function csvFetch(path: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError(0, "network", "We could not reach SeatPlan. Check your connection and try again.");
  }
  if (response.ok) return response;
  throw csvError(response.status, await response.text());
}

/** The CSV file travels as the raw request body (Content-Type text/csv). */
export async function importGuests(eventId: string, csv: string): Promise<ImportResult> {
  const response = await csvFetch(eventPath(eventId, "/guests/import"), {
    method: "POST",
    headers: csvHeaders("text/csv"),
    body: csv,
  });
  return (await response.json()) as ImportResult;
}

export async function exportGuestsCsv(eventId: string): Promise<string> {
  const response = await csvFetch(eventPath(eventId, "/export.csv"), { headers: csvHeaders(null) });
  return response.text();
}
