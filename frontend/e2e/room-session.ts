// Geometry tests share one real owner login. Login UI has its own tests.
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, ORGANISER } from "./fixtures";

let ownerSession: string | null = null;

/** One login per worker: the login route allows only 10 tries a minute. */
export async function ownerToken(request: APIRequestContext): Promise<string> {
  if (ownerSession === null) {
    const answer = await request.post("/api/auth/login", { data: ORGANISER });
    expect(answer.status()).toBe(200);
    ownerSession = ((await answer.json()) as { token: string }).token;
  }
  return ownerSession;
}

export async function openOwnerRoom(page: Page, request: APIRequestContext, venue: string): Promise<void> {
  const token = await ownerToken(request);
  await page.addInitScript(token => window.sessionStorage.setItem("seatplan.session", token), token);
  await page.goto(`/owner/${venue}/rooms`);
}
