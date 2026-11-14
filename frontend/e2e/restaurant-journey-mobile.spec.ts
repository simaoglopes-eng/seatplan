// The whole diner journey on a phone: from a free time on a discovery card to the confirmation,
// once without a chair request and once with one.

import { expect, isoDaysFromToday, test } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function fromDiscoveryToTable(page: import("@playwright/test").Page, daysAhead: number): Promise<void> {
  await page.goto("/");
  // Discovery with the "When and where" panel (the integrated design) is driven end to end. Before it exists the
  // phone has a different bar, so the journey starts from the same link a card's time would open.
  const context = page.getByRole("button", { name: /When and where/ });
  if (await context.isVisible()) {
    await context.click();
    const dialog = page.getByRole("dialog", { name: "When and where" });
    await dialog.getByLabel("Date", { exact: true }).fill(isoDaysFromToday(daysAhead));
    await dialog.getByRole("button", { name: "Show restaurants", exact: true }).click();
    const card = page.getByRole("article").filter({ hasText: "Tasca do Bairro" });
    const time = card.getByRole("link", { name: /^\d\d:\d\d$/ }).first();
    await expect(time).toBeVisible();
    await time.click();
  } else {
    await page.goto(`/restaurants/tasca-do-bairro?date=${isoDaysFromToday(daysAhead)}&time=20:00&party=2`);
  }
  await expect(page).toHaveURL(/\/restaurants\/tasca-do-bairro\?date=.*&time=.*&party=2/);
  await expect(page.getByRole("heading", { name: "Choose your table" })).toBeVisible();
  // One main action: the card's. No second, disabled bar under it.
  await expect(page.getByRole("button", { name: /^Hold .* & continue/ })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Pick a table to continue" })).toHaveCount(0);
}

async function sideways(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}

test("on a phone, from a discovery time to a confirmed booking without a chair", async ({ page }) => {
  await fromDiscoveryToTable(page, 8);
  expect(await sideways(page)).toBe(false);
  await page.getByRole("button", { name: /^Hold .* & continue/ }).click();
  await expect(page.getByRole("form", { name: "Your details" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Booking steps" }).locator('[aria-current="step"]')).toContainText("Details");
  await page.getByLabel("Name for the booking").fill("Journey Diner");
  await page.getByLabel("Email", { exact: true }).fill("journey.diner@example.com");
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("heading", { name: "You are booked, Journey" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Manage booking" })).toBeVisible();
  expect(await sideways(page)).toBe(false);
});

test("on a phone, from a discovery time to a confirmed booking with a chair request", async ({ page }) => {
  await fromDiscoveryToTable(page, 9);
  await page.getByRole("button", { name: /^Hold .* & continue/ }).click();
  await page.getByRole("button", { name: "Choose a chair" }).click();
  await expect(page.getByRole("heading", { name: /Request a chair/ })).toBeVisible();
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Save chair request" }).click();
  await expect(page.getByText(/Chair requested/)).toBeVisible();
  await page.getByLabel("Name for the booking").fill("Chair Journey");
  await page.getByLabel("Email", { exact: true }).fill("chair.journey@example.com");
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("heading", { name: "You are booked, Chair" })).toBeVisible();
  await expect(page.getByText(/Chair requested/).first()).toBeVisible();
  expect(await sideways(page)).toBe(false);
});
