// The guest session in api/client.ts and the calls in api/guest.ts.
// fetch is replaced by a fake that records each request's headers, so the
// tests can check exactly which session travels with each call.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, getGuestToken, getSessionToken, setGuestToken, setSessionToken } from "./client";
import { deleteMyAccount, getVisitorView, guestLogin, guestLogout, joinEvent, verifyCode } from "./guest";

interface Seen {
  method: string;
  path: string;
  auth: string | null;
}

/** Answers every request with `status` and `body`, and remembers what was asked. */
function fakeFetch(status: number, body: unknown): Seen[] {
  const seen: Seen[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seen.push({ method: init?.method ?? "GET", path: String(input), auth: headers.get("Authorization") });
      return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    }),
  );
  return seen;
}

/** Like fakeFetch, but remembers the JSON body of each request. */
function fakeFetchBodies(status: number, body: unknown): unknown[] {
  const bodies: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(init?.body ? JSON.parse(String(init.body)) : null);
      return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    }),
  );
  return bodies;
}

const SESSION = { token: "g.1.0.9999999999.sig", account: { name: "Ana Silva", email: "ana@example.com", created_at: "2026-11-10T10:00:00Z" } };

beforeEach(() => {
  window.sessionStorage.clear();
  setSessionToken("organiser-token");
  setGuestToken("guest-token");
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("which session a request carries", () => {
  it("sends the organiser token by default, as before", async () => {
    const seen = fakeFetch(200, {});
    await api.get("/events");
    expect(seen[0].auth).toBe("Bearer organiser-token");
  });

  it('sends the guest token and not the organiser token with auth "guest"', async () => {
    const seen = fakeFetch(200, { status: "joined", event_id: "spring" });
    await joinEvent("tok");
    expect(seen[0]).toEqual({ method: "POST", path: "/api/j/tok/join", auth: "Bearer guest-token" });
  });

  it('sends no Authorization header at all with auth "none"', async () => {
    const seen = fakeFetch(200, {});
    await getVisitorView("tok");
    expect(seen[0].path).toBe("/api/j/tok");
    expect(seen[0].auth).toBeNull();
  });

  it("forgets the guest token after a 401 on a guest call, but keeps the organiser token", async () => {
    fakeFetch(401, { error: { code: "unauthorised", message: "Please sign in again." } });
    await expect(joinEvent("tok")).rejects.toBeInstanceOf(ApiError);
    expect(getGuestToken()).toBeNull();
    expect(getSessionToken()).toBe("organiser-token");
  });

  it("keeps the guest token after a 401 on an organiser call", async () => {
    fakeFetch(401, { error: { code: "unauthorised", message: "Please sign in." } });
    await expect(api.get("/events")).rejects.toBeInstanceOf(ApiError);
    expect(getGuestToken()).toBe("guest-token");
  });
});

describe("guest account calls", () => {
  it("stores the session after sign-in and after the code is verified", async () => {
    window.sessionStorage.clear();
    const seen = fakeFetch(200, SESSION);
    await guestLogin("ana@example.com", "long enough password");
    expect(getGuestToken()).toBe(SESSION.token);
    expect(seen[0].auth).toBeNull(); // signing in never sends an older session

    window.sessionStorage.clear();
    const verified = fakeFetchBodies(201, { ...SESSION, join: { status: "joined", event_id: "spring" } });
    await verifyCode("ana@example.com", "123456", "browser-signup-id");
    expect(getGuestToken()).toBe(SESSION.token);
    // The code works only with the sign-up id the register answer gave this browser.
    expect(verified[0]).toEqual({ email: "ana@example.com", code: "123456", signup_id: "browser-signup-id" });
  });

  it("forgets the session on sign out even when the server cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    await expect(guestLogout()).rejects.toBeInstanceOf(ApiError);
    expect(getGuestToken()).toBeNull();
  });

  it("keeps the session after a wrong password on delete, and forgets it after a delete that worked", async () => {
    // A wrong password is a 422 on the password field, never a 401.
    fakeFetch(422, { error: { code: "validation", message: "password: That password is not correct." } });
    await expect(deleteMyAccount("wrong password")).rejects.toBeInstanceOf(ApiError);
    expect(getGuestToken()).toBe("guest-token");

    const seen = fakeFetch(200, { deleted: true });
    await deleteMyAccount("right password");
    expect(seen[0]).toEqual({ method: "POST", path: "/api/guest/me/delete", auth: "Bearer guest-token" });
    expect(getGuestToken()).toBeNull();
  });

  it("forgets the session when delete says the session itself is over", async () => {
    fakeFetch(401, { error: { code: "unauthorised", message: "Please sign in again." } });
    await expect(deleteMyAccount("any password")).rejects.toBeInstanceOf(ApiError);
    expect(getGuestToken()).toBeNull();
  });
});
