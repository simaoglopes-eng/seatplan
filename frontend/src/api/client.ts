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

// ---------- Core request ----------

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const error = (value as { error: unknown }).error;
  return typeof error === "object" && error !== null && "code" in error && "message" in error;
}

function buildHeaders(hasBody: boolean): Headers {
  const headers = new Headers({ Accept: "application/json" });
  if (hasBody) headers.set("Content-Type", "application/json");
  const token = getSessionToken();
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

export async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: buildHeaders(body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network", "We could not reach SeatPlan. Check your connection and try again.");
  }
  const data = await readJson(response);
  if (response.ok) return data as T;
  if (isApiErrorBody(data)) {
    throw new ApiError(response.status, data.error.code, data.error.message);
  }
  if (response.status >= 500) {
    throw new ApiError(response.status, "unknown", `The SeatPlan server is not answering right now (HTTP ${response.status}). Please try again shortly.`);
  }
  throw new ApiError(response.status, "unknown", `Something went wrong (HTTP ${response.status}).`);
}

// Small helpers so feature code reads like the contract: api.get("/events").
export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
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
