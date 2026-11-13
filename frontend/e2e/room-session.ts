// Geometry tests share one real owner login. Login UI has its own tests.
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, ORGANISER } from "./fixtures";

let ownerSession: string | null = null;

export async function openOwnerRoom(page: Page, request: APIRequestContext, venue: string): Promise<void> {
  if (ownerSession === null) {
    const answer = await request.post("/api/auth/login", { data: ORGANISER });
    expect(answer.status()).toBe(200);
    ownerSession = ((await answer.json()) as { token: string }).token;
  }
  await page.addInitScript(token => window.sessionStorage.setItem("seatplan.session", token), ownerSession);
  await page.goto(`/owner/${venue}/rooms`);
}
