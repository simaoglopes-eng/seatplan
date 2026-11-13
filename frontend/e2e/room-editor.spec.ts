// Spec 6.12, acceptance 1: on a phone an owner builds a 10 x 7 m room, curves a
// wall, adds two windows, sets north, adds a bar and eight tables, saves,
// reloads the page and sees exactly the same. A second tab that saved first
// makes the first tab's save a 409, and the first tab keeps its work.
import AxeBuilder from "@axe-core/playwright";
import { expect, ORGANISER, test } from "./fixtures";
import type { APIRequestContext, Page } from "@playwright/test";

async function ownerToken(request: APIRequestContext): Promise<string> {
  const answer = await request.post("/api/auth/login", { data: ORGANISER });
  expect(answer.status()).toBe(200);
  return ((await answer.json()) as { token: string }).token;
}

/** A brand-new restaurant, so saving never touches the demo; its room is the implicit 10 x 7 m one. */
async function newRestaurant(request: APIRequestContext, token: string, name: string): Promise<string> {
  const created = await request.post("/api/owner/restaurants", { data: { name }, headers: { Authorization: `Bearer ${token}` } });
  expect(created.status()).toBe(201);
  return ((await created.json()) as { public_id: string }).public_id;
}

async function open(page: Page, token: string, venue: string): Promise<void> {
  await page.addInitScript((t) => window.sessionStorage.setItem("seatplan.session", t), token);
  await page.goto(`/owner/${venue}/rooms`);
  await expect(page.getByRole("heading", { name: /· Rooms$/ })).toBeVisible();
}

test("an owner builds a room on a phone, saves, reloads and sees the same", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const token = await ownerToken(request);
  const venue = await newRestaurant(request, token, "Phone Room Test");
  await open(page, token, venue);
  await expect(page.getByText("Walls: 4 sides")).toBeVisible();

  // One wall bulges outwards.
  await page.getByLabel("Selected wall", { exact: true }).selectOption("2");
  await page.getByLabel("Bulge (cm)").fill("80");
  await page.getByLabel("Bulge (cm)").press("Tab");

  // North first, then two windows on two walls.
  await page.getByRole("button", { name: "North", exact: true }).click();
  await page.getByLabel("North is at (degrees)").fill("200");
  await page.getByLabel("North is at (degrees)").press("Tab");
  await page.getByRole("button", { name: "Walls", exact: true }).click();
  await page.getByRole("button", { name: "Add window", exact: true }).click();
  await page.getByLabel("Wall for opening").selectOption("1");
  await page.getByRole("button", { name: "Add window", exact: true }).click();

  // A bar and eight tables.
  await page.getByRole("button", { name: "Fixed", exact: true }).click();
  await page.getByRole("button", { name: "Place Bar", exact: true }).click();
  await page.getByRole("button", { name: "Place selected in room", exact: true }).click();
  await page.getByRole("button", { name: "Tables", exact: true }).click();
  for (let table = 0; table < 8; table++) {
    await page.getByRole("button", { name: "Place Round table", exact: true }).click();
    await page.getByRole("button", { name: "Place selected in room", exact: true }).click();
  }
  await expect(page.getByText("Tables: 8")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /Unsaved|Saved/ })).toHaveText("Unsaved");

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /Unsaved|Saved/ })).toHaveText("Saved");

  // Reload: the same room comes back from the server, with nothing left to save.
  await page.reload();
  await expect(page.getByRole("heading", { name: /· Rooms$/ })).toBeVisible();
  await expect(page.getByText("Tables: 8")).toBeVisible();
  await expect(page.getByText("Walls: 4 sides")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /Unsaved|Saved/ })).toHaveText("Saved");
  await page.getByLabel("Selected wall", { exact: true }).selectOption("2");
  await expect(page.getByLabel("Bulge (cm)")).toHaveValue("80");
  await page.getByRole("button", { name: "North", exact: true }).click();
  await expect(page.getByText("North is at 200°", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Walls", exact: true }).click();
  await expect(page.getByLabel("Selected opening").locator("option")).toHaveCount(3); // "Choose an opening" and the two windows
  await page.getByRole("button", { name: "Fixed", exact: true }).click();
  await expect(page.getByLabel("Selected fixed element").locator("option")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
});

test("a second tab that saved first makes the next save a conflict, and the work is kept", async ({ browser, request }) => {
  const token = await ownerToken(request);
  const venue = await newRestaurant(request, token, "Two Tabs Test");
  const first = await browser.newPage();
  const second = await browser.newPage();
  await open(first, token, venue);
  await open(second, token, venue);

  await second.getByLabel("Selected room name").fill("Second tab's name");
  await second.getByLabel("Selected room name").press("Tab");
  await second.getByRole("button", { name: "Save", exact: true }).click();
  await expect(second.getByRole("status").filter({ hasText: /Unsaved|Saved/ })).toHaveText("Saved");

  await first.getByLabel("Selected room name").fill("First tab's work");
  await first.getByLabel("Selected room name").press("Tab");
  await first.getByRole("button", { name: "Save", exact: true }).click();
  await expect(first.getByText(/changed in another tab or device/i)).toBeVisible();
  await expect(first.getByLabel("Selected room name")).toHaveValue("First tab's work");

  // Saving it over the other tab's version works and wins.
  await first.getByRole("button", { name: "Save mine over it" }).click();
  await expect(first.getByRole("status").filter({ hasText: /Unsaved|Saved/ })).toHaveText("Saved");
  await first.reload();
  await expect(first.getByLabel("Selected room name")).toHaveValue("First tab's work");
  await first.close();
  await second.close();
});
