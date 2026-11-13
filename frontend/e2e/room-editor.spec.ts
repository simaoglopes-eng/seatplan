// Spec 6.12, acceptance 1: on a phone an owner builds a 10 x 7 m room, curves a
// wall, adds two windows, sets north, adds a bar and eight tables, saves,
// reloads the page and sees exactly the same. A second tab that saved first
// makes the first tab's save a 409, and the first tab keeps its work.
import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";
import { ownerToken } from "./room-session";
import type { APIRequestContext, Page } from "@playwright/test";

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

test.describe("touch room persistence", () => {
test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
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

test("the Light tool shows the sun on the saved room at lunch, and the night after sunset", async ({ page, request }, info) => {
  const token = await ownerToken(request);
  const headers = { Authorization: `Bearer ${token}` };
  const venue = await newRestaurant(request, token, "Light Test");
  // Lisbon, so the sun's position is the one the backend tests check.
  const located = await request.patch(`/api/owner/restaurants/${venue}/profile`, { data: { lat: 38.7223, lng: -9.1393, timezone: "Europe/Lisbon", address: "Rua Augusta 1, Lisboa" }, headers });
  expect(located.status()).toBe(200);
  const url = `/api/owner/restaurants/${venue}/rooms`;
  const initial = (await (await request.get(url, { headers })).json()) as { base_version: number; rooms: Record<string, unknown>[] };
  const room = initial.rooms[0] as Record<string, unknown>;
  room.north_deg = 0;
  room.openings = [{ id: null, key: "w1", side: 2, offset: 300, width: 400, kind: "window", top_height: 220 }];
  room.tables = [{ id: null, key: "t1", zone_key: null, label: "Window table", shape: "rect", x: 460, y: 600, w: 80, h: 80, max_party: 2, seats: [] }];
  const saved = await request.put(url, { data: { base_version: initial.base_version, rooms: initial.rooms }, headers });
  expect(saved.status()).toBe(200);

  await open(page, token, venue);
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await page.getByLabel("Date").fill("2026-06-21");
  await page.getByRole("button", { name: "Lunch 13:00", exact: true }).click();
  await expect(page.getByText(/On 21 June at 13:00 the sun is in the south-east/)).toBeVisible();
  await expect(page.locator("path.room-sun").first()).toBeVisible();
  await expect(page.locator(".room-sun-direction")).toHaveCount(1);
  await page.getByLabel("Describe table").selectOption({ label: "Window table" });
  await expect(page.getByText(/Direct sun/).first()).toBeVisible();
  await page.screenshot({ path: join(tmpdir(), `seatplan-room-light-day-${info.project.name}.png`), fullPage: true });
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);

  await page.getByLabel("Time of day").fill("68"); // 06:00 + 68 x 15 min = 23:00
  await expect(page.locator(".room-night")).toHaveCount(1);
  await expect(page.locator("path.room-sun")).toHaveCount(0);
  await expect(page.getByText(/below the horizon/)).toBeVisible();
  await page.screenshot({ path: join(tmpdir(), `seatplan-room-light-night-${info.project.name}.png`), fullPage: true });
});
