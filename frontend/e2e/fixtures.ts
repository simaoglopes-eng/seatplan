// Shared helpers for the browser tests.
//
// `test` here is Playwright's test with one extra rule: a test fails if the
// page throws an uncaught error or the browser blocks something because of
// the Content-Security-Policy. Ordinary console noise (for example the 409
// that a taken seat is meant to produce) does not fail a test.

import { expect, test as base, type APIRequestContext, type Page } from "@playwright/test";

export { expect };

/** The demo entry links, by name, for example links.wedding_organiser = "/organiser/<id>". */
export type DemoLinks = Record<string, string>;

/** The local demo passwords (backend/app/seed/run.py); they only work on local SQLite with DEMO_MODE=1. */
export const ORGANISER = { email: "organiser@example.com", password: "demo-organiser-2026" };
export const STAFF = { email: "staff@example.com", password: "demo-staff-2026" };

export async function demoLinks(request: APIRequestContext): Promise<DemoLinks> {
  const answer = await request.get("/api/demo/links");
  expect(answer.status()).toBe(200);
  return ((await answer.json()) as { links: DemoLinks }).links;
}

/** The last part of a link: the token of "/e/<token>" or the id of "/organiser/<id>". */
export function lastPart(link: string): string {
  return link.split("/").filter(Boolean).pop() ?? "";
}

/** Signs in through the real login page and lands on `next`. */
export async function signIn(page: Page, who: { email: string; password: string }, next: string): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname === next);
}

/** A date `days` from today as yyyy-mm-dd, in the browser's own time zone. */
export function isoDaysFromToday(days: number): string {
  const day = new Date();
  day.setDate(day.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

export const test = base.extend<{ pageProblems: string[] }>({
  pageProblems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on("pageerror", (error) => problems.push(`Uncaught error: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error" && /Content Security Policy/i.test(message.text())) {
          problems.push(`CSP: ${message.text()}`);
        }
      });
      await use(problems);
      expect(problems, "the page threw an error or broke the Content-Security-Policy").toEqual([]);
    },
    { auto: true },
  ],
});
