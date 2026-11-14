import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";
import { dinerMap, preparedRestaurant, publishRestaurant } from "./restaurant-fixture";

for (const width of [1440, 390]) test(`diner sees rooms, daylight and night and books a chair at ${width}px`, async ({ page, request }, info) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  const venue = await preparedRestaurant(request, `Ambience acceptance ${width}`);
  await publishRestaurant(request, venue);
  await dinerMap(page, venue.id, venue.day);
  await expect(page.getByRole("tab", { name: /River room/ })).toBeVisible();
  await expect(page.locator(".room-sun").first()).toBeVisible();
  await page.getByRole("tab", { name: /Garden room/ }).click();
  await expect(page.getByRole("tab", { name: /Garden room/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(/Garden view|View of the garden/).first()).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: join(tmpdir(), `seatplan-37-day-${width}.png`), fullPage: true });

  // A later cursor moment repaints light without acquiring a hold.
  await page.getByRole("button", { name: "Change time", exact: true }).click();
  await page.getByRole("button", { name: "21:00 Available", exact: true }).click();
  const cursor = page.getByRole("slider", { name: "Preview light (does not change your booking)" });
  const last = await cursor.getAttribute("max");
  await cursor.fill(last!);
  await expect(page.locator(".room-night")).toHaveCount(1);
  await expect(page.locator(".room-sun")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pick a table to continue" })).toHaveCount(0); // one main action: the card's
  await page.screenshot({ path: join(tmpdir(), `seatplan-37-night-${width}.png`), fullPage: true });
  await page.getByRole("button", { name: "Hold table Garden 1", exact: true }).last().click();
  await page.getByRole("button", { name: "Choose a chair" }).click();
  const chair = page.getByRole("radio", { name: /^Seat 2/ });
  await chair.check();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Continue with seat 2" }).click();
  await page.getByLabel("Name for the booking").fill("Acceptance Diner");
  await page.getByLabel("Email", { exact: true }).fill(`acceptance-${width}@example.com`);
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("heading", { name: "You are booked, Acceptance" })).toBeVisible();
  await expect(page.getByText(/Seat 2/).first()).toBeVisible();
  await page.getByRole("link", { name: "Manage booking" }).click();
  await expect(page.getByText(/Seat 2/).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await info.attach("night-booking", { body: `Room: Garden; seat: 2; viewport: ${width}`, contentType: "text/plain" });
});

test("two diners race for one table, one wins and the other can take an alternative", async ({ page, browser, request }) => {
  const venue = await preparedRestaurant(request, "Concurrent diners");
  await publishRestaurant(request, venue);
  const other = await browser.newPage();
  const otherErrors: string[] = [];
  other.on("pageerror", e => otherErrors.push(e.message));
  try {
    await dinerMap(page, venue.id, venue.day);
    await dinerMap(other, venue.id, venue.day);
    // Synchronize real outgoing requests, without mocking either server response.
    let arrivals = 0;
    let release!: () => void;
    const both = new Promise<void>(resolve => { release = resolve; });
    for (const diner of [page, other]) await diner.route(`**/api/r/${venue.id}/hold`, async route => {
      arrivals += 1;
      if (arrivals === 2) release();
      await both;
      await route.continue();
    });
    const replies = [page, other].map(p => p.waitForResponse(r => r.url().endsWith(`/r/${venue.id}/hold`) && r.request().method() === "POST"));
    await Promise.all([page, other].map(p => p.getByRole("button", { name: "Hold table River 1", exact: true }).last().click()));
    const responses = await Promise.all(replies);
    expect(responses.map(r => r.status()).sort()).toEqual([201, 409]);
    const winner = responses[0].status() === 201 ? page : other;
    const loser = winner === page ? other : page;
    await expect(winner.getByRole("form", { name: "Your details" })).toBeVisible();
    await expect(loser.getByRole("alert").filter({ hasText: "Sorry, that table is gone" })).toBeVisible();
    // Remove the barrier before requesting a different table.
    await page.unroute(`**/api/r/${venue.id}/hold`);
    await other.unroute(`**/api/r/${venue.id}/hold`);
    await loser.getByRole("button", { name: "Hold table Garden 1", exact: true }).last().click();
    await expect(loser.getByRole("form", { name: "Your details" })).toBeVisible();
    expect(otherErrors).toEqual([]);
  } finally {
    await other.close();
  }
});

