// Automatic accessibility scan (axe-core) of the main pages, against the
// WCAG 2.1 A and AA rules. A tool finds only part of the problems (roughly
// the ones that can be read from the page code); screen reader and keyboard
// checks by a person are still needed.
//
// The scans only look: they never book, hold or change anything.

import AxeBuilder from "@axe-core/playwright";
import { type Page } from "@playwright/test";
import { ORGANISER, STAFF, demoLinks, expect, signIn, test } from "./fixtures";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/** Runs axe on the page as it is now and fails with a readable list of problems. */
async function expectNoViolations(page: Page, what: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.help} [${v.nodes.length} element(s)]`);
  expect(summary, `axe found problems on ${what}`).toEqual([]);
}

test("discovery page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Find a table you’ll love." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Near me" })).toBeVisible();
  await expectNoViolations(page, "the discovery page");
});

test("demo page (the old home page)", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoViolations(page, "the demo page");
});

test("sign-in page", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expectNoViolations(page, "the sign-in page");
});

test("attendee invitation page", async ({ page, request }) => {
  const links = await demoLinks(request);
  await page.goto(links.wedding_guest_accessible);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByLabel("Your progress")).toBeVisible();
  await expectNoViolations(page, "the attendee page");
});

test("diner booking page", async ({ page, request }) => {
  const links = await demoLinks(request);
  await page.goto(links.restaurant_booking);
  await expect(page.getByRole("heading", { name: "Book a table" })).toBeVisible();
  await expectNoViolations(page, "the booking page");
});

test("organiser workspace", async ({ page, request }) => {
  const links = await demoLinks(request);
  await signIn(page, ORGANISER, links.wedding_organiser);
  await expect(page.getByRole("tab", { name: "Guests" })).toBeVisible();
  await expectNoViolations(page, "the organiser workspace");
});

test("staff floor", async ({ page, request }) => {
  const links = await demoLinks(request);
  await signIn(page, STAFF, links.restaurant_staff);
  await expect(page.getByRole("button", { name: "New walk-in" })).toBeVisible();
  await expectNoViolations(page, "the staff floor");
});

test("visitor page of a shared link", async ({ page, request }) => {
  const links = await demoLinks(request);
  await page.goto(links.wedding_share);
  await expect(page.getByText(/\d+ places? left\./)).toBeVisible();
  await expectNoViolations(page, "the visitor page");
});

test("create-account form of a shared link", async ({ page, request }) => {
  const links = await demoLinks(request);
  await page.goto(`${links.wedding_share}/register`);
  await expect(page.getByRole("button", { name: "Send my code" })).toBeVisible();
  await expectNoViolations(page, "the create-account form");
});

test("guest sign-in page", async ({ page }) => {
  await page.goto("/my/sign-in");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expectNoViolations(page, "the guest sign-in page");
});
