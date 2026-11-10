// A fake backend at the fetch level. Tests list the answers by
// "METHOD /api/path" (query string ignored), and can read back every call.
// Live-update polls get a fixed version, so pages do not reload in a loop.
import { vi } from "vitest";

export interface Call {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

/** Return a value to answer 200 with JSON, or a Response for anything else. */
export type Handler = (call: Call) => unknown;

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

export function apiError(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}

export function mockApi(routes: Record<string, Handler>): Call[] {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const call: Call = {
      method: init?.method ?? "GET",
      path: url.pathname,
      query: url.searchParams,
      body: init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined,
    };
    calls.push(call);
    const handler = routes[`${call.method} ${call.path}`];
    if (handler) {
      const answer = handler(call);
      return answer instanceof Response ? answer : json(answer);
    }
    if (call.path.startsWith("/api/live/")) return json({ version: 1 });
    return apiError(404, "not_found", `No mock for ${call.method} ${call.path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

/** The calls to one endpoint, for asserting what the page sent. */
export function callsTo(calls: Call[], method: string, path: string): Call[] {
  return calls.filter((c) => c.method === method && c.path === path);
}
