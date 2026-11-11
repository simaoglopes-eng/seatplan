// Typed fetch wrapper. Every call to the backend goes through `request`, so
// error handling, the session header and JSON parsing live in one place.
import type {
  ApiErrorBody,
  CreateVenueRequest,
  DemoLinksResponse,
  ErrorCode,
  HealthResponse,
  LiveVersion,
  LoginResponse,
  User,
  LayoutPayload,
  Venue,
  VenueDetail,
} from "./types";

/** Every backend path starts here; the CSV helpers in events.ts use it too. */
export const API_BASE = "/api";
const SESSION_KEY = "seatplan.session";
// The guest account session lives under its own key, never with the organiser's
// (docs/guest-accounts.md section 5.2), so one tab can never mix the two up.
const GUEST_KEY = "seatplan.guest-session";

/**
 * Which session a request carries:
 * - "organiser": the organiser or staff session (the default, so older calls are unchanged);
 * - "guest": the guest account session;
 * - "none": no Authorization header at all (visitor pages on a shared link).
 */
export type Auth = "organiser" | "guest" | "none";

/** Thrown for every failed request, so callers only ever catch one type. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;

  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

// ---------- Session token ----------
// sessionStorage (not localStorage): the token disappears when the tab closes,
// which limits the damage if someone leaves a shared laptop logged in.
// Access is wrapped in try/catch because private browsing can block storage.

export function getSessionToken(): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY, token);
  } catch {
    // Storage blocked: the user stays logged in for this page view only.
  }
}

export function clearSessionToken(): void {
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
}

// ---------- Guest account token ----------
// Same rules as the organiser token above: sessionStorage, wrapped in try/catch.

export function getGuestToken(): string | null {
  try {
    return window.sessionStorage.getItem(GUEST_KEY);
  } catch {
    return null;
  }
}

export function setGuestToken(token: string): void {
  try {
    window.sessionStorage.setItem(GUEST_KEY, token);
  } catch {
    // Storage blocked: the guest stays signed in for this page view only.
  }
}

export function clearGuestToken(): void {
  try {
    window.sessionStorage.removeItem(GUEST_KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
}

/** The token to send for one kind of caller, or null for none. */
function tokenFor(auth: Auth): string | null {
  if (auth === "guest") return getGuestToken();
  if (auth === "organiser") return getSessionToken();
  return null;
}

// ---------- Core request ----------

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const error = (value as { error: unknown }).error;
  return typeof error === "object" && error !== null && "code" in error && "message" in error;
}

function buildHeaders(hasBody: boolean, auth: Auth): Headers {
  const headers = new Headers({ Accept: "application/json" });
  if (hasBody) headers.set("Content-Type", "application/json");
  const token = tokenFor(auth);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

/** Reads the body as JSON, or returns null for empty and non-JSON bodies. */
async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function request<T>(method: Method, path: string, body?: unknown, auth: Auth = "organiser"): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: buildHeaders(body !== undefined, auth),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network", "We could not reach SeatPlan. Check your connection and try again.");
  }
  const data = await readJson(response);
  if (response.ok) return data as T;
  // A guest session the server refuses is over: forget it, so pages send the person to sign in.
  if (response.status === 401 && auth === "guest") clearGuestToken();
  if (isApiErrorBody(data)) {
    throw new ApiError(response.status, data.error.code, data.error.message);
  }
  if (response.status >= 500) {
    throw new ApiError(response.status, "unknown", `The SeatPlan server is not answering right now (HTTP ${response.status}). Please try again shortly.`);
  }
  throw new ApiError(response.status, "unknown", `Something went wrong (HTTP ${response.status}).`);
}

// Small helpers so feature code reads like the contract: api.get("/events").
// The last argument picks the session; leaving it out sends the organiser's.
export const api = {
  get: <T>(path: string, auth?: Auth) => request<T>("GET", path, undefined, auth),
  post: <T>(path: string, body?: unknown, auth?: Auth) => request<T>("POST", path, body ?? {}, auth),
  put: <T>(path: string, body: unknown, auth?: Auth) => request<T>("PUT", path, body, auth),
  patch: <T>(path: string, body: unknown, auth?: Auth) => request<T>("PATCH", path, body, auth),
  delete: <T>(path: string, auth?: Auth) => request<T>("DELETE", path, undefined, auth),
};

// ---------- Core endpoints (contract section 5, "Core") ----------

export function getHealth(): Promise<HealthResponse> {
  return api.get<HealthResponse>("/health");
}

/** Logs in and remembers the session token for later requests. */
export async function login(email: string, password: string): Promise<LoginResponse> {
  const result = await api.post<LoginResponse>("/auth/login", { email, password });
  setSessionToken(result.token);
  return result;
}

export function logout(): void {
  clearSessionToken();
}

export function getMe(): Promise<User> {
  return api.get<User>("/auth/me");
}

export function listVenues(): Promise<Venue[]> {
  return api.get<Venue[]>("/venues");
}

export function createVenue(venue: CreateVenueRequest): Promise<Venue> {
  return api.post<Venue>("/venues", venue);
}

export function getVenue(venueId: string): Promise<VenueDetail> {
  return api.get<VenueDetail>(`/venues/${encodeURIComponent(venueId)}`);
}

/** Saves the whole floor plan; the answer is the saved venue with database ids. */
export function saveLayout(venueId: string, layout: LayoutPayload): Promise<VenueDetail> {
  return api.put<VenueDetail>(`/venues/${encodeURIComponent(venueId)}/layout`, layout);
}

export function getDemoLinks(): Promise<DemoLinksResponse> {
  return api.get<DemoLinksResponse>("/demo/links");
}

export function getLiveVersion(scope: string): Promise<LiveVersion> {
  return api.get<LiveVersion>(`/live/${encodeURIComponent(scope)}/version`);
}

/** URL of the server-sent events stream; used by useLive. */
export function liveStreamUrl(scope: string): string {
  return `${API_BASE}/live/${encodeURIComponent(scope)}/stream`;
}
