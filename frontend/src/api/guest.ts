// Typed client for the shared event link and guest accounts
// (docs/guest-accounts.md, section 6). Field names stay snake_case, exactly
// as the Python backend sends them.
//
// Three kinds of call live here:
// - visitor calls on a shared link (/j/{token}): no session at all ("none");
// - account calls (/guest/...): the guest session ("guest");
// - the account holder's event calls (/guest/events/{eid}), which mirror the
//   attendee calls of api/events.ts one to one.
import { api, clearGuestToken, setGuestToken } from "./client";
import type { AttendeeView, EventSummary, HoldResponse, SeatRecommendation, VisiblePerson } from "./events";
import type { SeatMapPayload } from "./types";

// ---------- Shapes (section 6.1) ----------

export interface GuestAccountOut {
  name: string;
  /** The account holder's own address, in full. */
  email: string;
  /** ISO 8601, UTC. */
  created_at: string;
}

export type JoinStatus =
  | "joined" // a new self-registered guest row was made
  | "linked" // an invited guest with this address now belongs to the account
  | "already_member" // the account was already on this event
  | "event_full" // no place left; the account exists but did not join
  | "link_closed" // the organiser switched the link off meanwhile
  | "deadline_passed" // seat choices have closed
  | "removed"; // the organiser removed this account from the event (403 "forbidden" on /join)

export interface JoinResult {
  status: JoinStatus;
  /** The event's public id when the account is a member, otherwise null. */
  event_id: string | null;
}

export interface GuestSession {
  token: string;
  account: GuestAccountOut;
}

/** POST /guest/verify answers with a session and the result of joining the event. */
export type VerifyResult = GuestSession & { join: JoinResult };

export interface CodeSent {
  status: "code_sent";
  /** Masked, for example "an***@example.com". */
  sent_to: string;
  expires_in_seconds: number;
  /**
   * Given only to the browser that asked for the code. /guest/verify needs it
   * with the code, so a code read out to someone else cannot finish this sign-up.
   * Absent on "forgot password" answers.
   */
  signup_id?: string;
  /**
   * Only in the demo (DEMO_MODE=1 with the console mail provider), only for
   * made-up example.com addresses that no organiser invited. May be missing.
   */
  demo_code?: string;
}

/** Why a visitor cannot join right now. */
export type JoinClosedReason = "full" | "deadline_passed";

/** GET /j/{token}: what anyone with the shared link may see. */
export interface VisitorView {
  /** The attendee version of the summary: no public id. */
  event: EventSummary;
  venue: { name: string };
  /** Seat states are only "free", "held", "taken" or "blocked" here. */
  map: SeatMapPayload;
  join: {
    open: boolean;
    places_left: number;
    reason: JoinClosedReason | null;
  };
}

export interface RegisterIn {
  name: string;
  email: string;
  password: string;
  needs_accessible: boolean;
  consent: true;
}

export interface MyEvent {
  event_id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  venue_name: string;
  deadline_passed: boolean;
  rsvp: "pending" | "yes" | "no";
  seat: { seat_label: string; table_label: string } | null;
}

export interface MyAccount {
  account: GuestAccountOut;
  /** Sorted by starts_at. */
  events: MyEvent[];
}

// ---------- Visitor (section 6.2) ----------

function sharePath(token: string, rest = ""): string {
  return `/j/${encodeURIComponent(token)}${rest}`;
}

export function getVisitorView(token: string): Promise<VisitorView> {
  return api.get<VisitorView>(sharePath(token), "none");
}

/** Always the same 202 answer, whether or not the address already has an account. */
export function register(token: string, body: RegisterIn): Promise<CodeSent> {
  return api.post<CodeSent>(sharePath(token, "/register"), body, "none");
}

/** For a signed-in account holder who opened the shared link. */
export function joinEvent(token: string): Promise<JoinResult> {
  return api.post<JoinResult>(sharePath(token, "/join"), {}, "guest");
}

// ---------- Account (section 6.4) ----------

/** Creates the account from the emailed code and signs in. `signupId` comes from register(). */
export async function verifyCode(email: string, code: string, signupId: string): Promise<VerifyResult> {
  const result = await api.post<VerifyResult>("/guest/verify", { email, code, signup_id: signupId }, "none");
  setGuestToken(result.token);
  return result;
}

/** Signs in and remembers the guest session for later requests. */
export async function guestLogin(email: string, password: string): Promise<GuestSession> {
  const result = await api.post<GuestSession>("/guest/login", { email, password }, "none");
  setGuestToken(result.token);
  return result;
}

/** Ends the session on every device. The token is forgotten here even if the call fails. */
export async function guestLogout(): Promise<void> {
  try {
    await api.post("/guest/logout", {}, "guest");
  } finally {
    clearGuestToken();
  }
}

export function forgotPassword(email: string): Promise<CodeSent> {
  return api.post<CodeSent>("/guest/password/forgot", { email }, "none");
}

/** Sets a new password from the emailed code; the answer is a fresh session. */
export async function resetPassword(email: string, code: string, newPassword: string): Promise<GuestSession> {
  const result = await api.post<GuestSession>("/guest/password/reset", { email, code, new_password: newPassword }, "none");
  setGuestToken(result.token);
  return result;
}

export function getMyAccount(): Promise<MyAccount> {
  return api.get<MyAccount>("/guest/me", "guest");
}

/**
 * POST, not DELETE, because it carries the password in the body.
 * A wrong password answers 422 "validation" with "password: That password is
 * not correct." and keeps the session; a 401 means the session is over.
 */
export async function deleteMyAccount(password: string): Promise<{ deleted: true }> {
  const result = await api.post<{ deleted: true }>("/guest/me/delete", { password }, "guest");
  clearGuestToken();
  return result;
}

// ---------- The account holder's event (section 6.5) ----------
// Same bodies and answers as the /a/{token} calls in api/events.ts.

function accountEventPath(eventId: string, rest = ""): string {
  return `/guest/events/${encodeURIComponent(eventId)}${rest}`;
}

export function getAccountView(eventId: string): Promise<AttendeeView> {
  return api.get<AttendeeView>(accountEventPath(eventId), "guest");
}

export function getAccountPeople(eventId: string, q: string): Promise<VisiblePerson[]> {
  return api.get<VisiblePerson[]>(accountEventPath(eventId, `/people?q=${encodeURIComponent(q)}`), "guest");
}

export function sendAccountRsvp(eventId: string, rsvp: "yes" | "no"): Promise<unknown> {
  return api.post(accountEventPath(eventId, "/rsvp"), { rsvp }, "guest");
}

export function sendAccountKnows(eventId: string, guestIds: number[]): Promise<unknown> {
  return api.post(accountEventPath(eventId, "/knows"), { guest_ids: guestIds }, "guest");
}

export function sendAccountPrivacy(eventId: string, wantsAnonymous: boolean): Promise<unknown> {
  return api.post(accountEventPath(eventId, "/privacy"), { wants_anonymous: wantsAnonymous }, "guest");
}

export function getAccountRecommendations(eventId: string): Promise<SeatRecommendation[]> {
  return api.get<SeatRecommendation[]>(accountEventPath(eventId, "/recommendations"), "guest");
}

export function holdAccountSeat(eventId: string, seatId: number): Promise<HoldResponse> {
  return api.post<HoldResponse>(accountEventPath(eventId, "/hold"), { seat_id: seatId }, "guest");
}

export function confirmAccountSeat(eventId: string, seatId: number): Promise<unknown> {
  return api.post(accountEventPath(eventId, "/confirm"), { seat_id: seatId }, "guest");
}

export function releaseAccountSeat(eventId: string): Promise<unknown> {
  return api.delete(accountEventPath(eventId, "/seat"), "guest");
}
