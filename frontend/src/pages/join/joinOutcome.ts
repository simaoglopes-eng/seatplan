// Where a person goes after trying to join an event, and what we tell them
// (docs/guest-accounts.md section 10.4). Used after creating an account
// (RegisterPage), after signing in on the shared link (JoinSignInPage) and
// by the "Join this event" button (JoinPage). Pure, so it is easy to test.
import { ApiError } from "../../api/client";
import type { JoinResult, JoinStatus } from "../../api/guest";
import { MY_HOME } from "../account/safeNext";

export interface JoinOutcome {
  /** The page to open next. */
  to: string;
  /** A short success message for the toast, when the person joined. */
  toast: string | null;
  /** A message for the My events page, when the person could not join. */
  notice: string | null;
}

/** What the My events page reads from the router state. */
export interface MyNoticeState {
  notice: string;
}

/** The second half of each "could not join" sentence. */
const WHY_NOT: Partial<Record<JoinStatus, string>> = {
  event_full: "this event filled up while you were signing up.",
  link_closed: "the organiser has closed sign-ups for this event.",
  deadline_passed: "seat choices for this event have closed.",
  removed: "the organiser removed you from this event.",
};

const NOT_JOINED_SIGNED_IN: Partial<Record<JoinStatus, string>> = {
  event_full: "You are signed in, but this event is full. Every place has a guest.",
  link_closed: "You are signed in, but the organiser is not taking new guests through this link at the moment.",
  deadline_passed: "You are signed in, but seat choices for this event have closed.",
  removed: "You are signed in, but the organiser removed you from this event. Ask them if you think this is a mistake.",
};

/**
 * `newAccount` is true right after the account was made: the messages then
 * start with "Your account is ready".
 */
export function joinOutcome(result: JoinResult, newAccount: boolean): JoinOutcome {
  const { status, event_id: eventId } = result;
  const joined = status === "joined" || status === "linked" || status === "already_member";
  if (joined && eventId) {
    return { to: `${MY_HOME}/${encodeURIComponent(eventId)}`, toast: joinedToast(status, newAccount), notice: null };
  }
  if (joined) return { to: MY_HOME, toast: joinedToast(status, newAccount), notice: null };
  const notice = newAccount ? `Your account is ready, but ${WHY_NOT[status] ?? "you could not join this event."}` : NOT_JOINED_SIGNED_IN[status] ?? null;
  return { to: MY_HOME, toast: null, notice };
}

function joinedToast(status: JoinStatus, newAccount: boolean): string {
  if (status === "linked") return "Your account is ready. We found your invitation, so your details are already here.";
  if (newAccount) return "Your account is ready.";
  return status === "already_member" ? "You are already on this event's guest list." : "You joined the event.";
}

/**
 * The join call can also fail with an HTTP error carrying the same reasons
 * (409 event_full, 403 link_closed, 409 deadline_passed, and 403 forbidden
 * when the organiser removed this account). This turns those errors into
 * the matching status, or null for any other error.
 */
export function statusFromError(error: unknown): JoinStatus | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === "event_full" || error.code === "link_closed" || error.code === "deadline_passed") return error.code;
  if (error.code === "forbidden") return "removed";
  return null;
}
