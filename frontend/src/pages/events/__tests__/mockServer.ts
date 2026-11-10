// A tiny fake backend for the events page tests. It replaces global fetch,
// so the real api/client.ts and api/events.ts code runs unchanged; only the
// network is pretend. Each route is "METHOD path" -> handler.
import { vi } from "vitest";

export interface FakeReply {
  status?: number;
  body?: unknown;
}

export type Handler = (body: unknown) => FakeReply;

export interface FakeServer {
  routes: Map<string, Handler>;
  calls: { method: string; path: string; body: unknown }[];
  /** The live version; tests bump it to simulate someone else's change. */
  version: number;
}

export function errorReply(status: number, code: string, message: string): FakeReply {
  return { status, body: { error: { code, message } } };
}

/** Installs the fake fetch and returns the server so tests can add routes. */
export function startFakeServer(): FakeServer {
  const server: FakeServer = { routes: new Map(), calls: [], version: 1 };
  const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    const path = String(input).replace(/^\/api/, "").split("?")[0];
    const body = readBody(init?.body);
    server.calls.push({ method, path, body });
    if (path.startsWith("/live/")) return json(200, { version: server.version });
    const handler = server.routes.get(`${method} ${path}`);
    const reply = handler ? handler(body) : errorReply(404, "not_found", `No fake route for ${method} ${path}`);
    return json(reply.status ?? 200, reply.body ?? null);
  };
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  return server;
}

/** JSON bodies become objects; the CSV import sends plain text, which stays text. */
function readBody(raw: BodyInit | null | undefined): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(String(raw)) as unknown;
  } catch {
    return String(raw);
  }
}

function json(status: number, body: unknown): Response {
  return new Response(body === null ? "" : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** All calls the page made to one route, for assertions. */
export function callsTo(server: FakeServer, method: string, path: string): unknown[] {
  return server.calls.filter((c) => c.method === method && c.path === path).map((c) => c.body);
}
