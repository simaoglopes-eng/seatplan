// The CSV calls do not go through request(), so they get their own check:
// an error from the server must keep its code, exactly as request() does.
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../api/client";
import { exportGuestsCsv, importGuests } from "../../../api/events";
import { errorReply, startFakeServer } from "./mockServer";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CSV import and export errors", () => {
  it("keeps the server's error code, so an expired session can be told apart", async () => {
    const server = startFakeServer();
    server.routes.set("POST /events/ev1/guests/import", () => errorReply(401, "unauthorised", "Please sign in again."));
    const failure = await importGuests("ev1", "name,email\nAna,ana@example.com").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).code).toBe("unauthorised");
    expect((failure as ApiError).message).toBe("Please sign in again.");
    expect(server.calls[0].body).toBe("name,email\nAna,ana@example.com");
  });

  it("explains a server failure that has no error body", async () => {
    const server = startFakeServer();
    server.routes.set("GET /events/ev1/export.csv", () => ({ status: 502 }));
    const failure = (await exportGuestsCsv("ev1").catch((error: unknown) => error)) as ApiError;
    expect(failure.code).toBe("unknown");
    expect(failure.message).toMatch(/not answering right now \(HTTP 502\)/);
  });
});
