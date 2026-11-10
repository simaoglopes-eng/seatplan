// Restaurant vertical: a diner books a table and cancels it through the
// manage link; a member of staff seats a walk-in from the live floor.

import { STAFF, demoLinks, expect, isoDaysFromToday, lastPart, signIn, test } from "./fixtures";

test("a diner books a table, then cancels through the manage link", async ({ page, request }) => {
  const links = await demoLinks(request);
  // Two days ahead: never in the past, and never the demo's closed day (21 days ahead).
  await page.goto(`${links.restaurant_booking}?date=${isoDaysFromToday(2)}&party=2`);

  await page.getByRole("button", { name: "See free times" }).click();
  await expect(page.getByRole("heading", { name: "Pick a time" })).toBeVisible();
  await page.getByRole("button", { name: /^\d\d:\d\d Available$/ }).first().click();

  await expect(page.getByRole("heading", { name: "Choose your table" })).toBeVisible();
  await page.getByRole("button", { name: "Choose for me" }).click();
  const next = page.getByRole("button", { name: /^Continue with table / });
  await expect(next).toBeEnabled();
  await next.click();

  await page.getByLabel("Name for the booking").fill("Tess Diner");
  await page.getByLabel("Email", { exact: true }).fill("tess.diner@example.com");
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("heading", { name: "You are booked, Tess" })).toBeVisible();

  // The confirmation page alone is enough to manage the booking.
  await page.getByRole("link", { name: "Open my booking" }).click();
  await expect(page).toHaveURL(/\/b\/[^/]+$/);
  const token = lastPart(new URL(page.url()).pathname);
  await expect(page.getByRole("heading", { name: "Your booking" })).toBeVisible();

  await page.getByRole("button", { name: "Cancel booking" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Yes, cancel it" }).click();
  await expect(page.getByText("This booking is cancelled.")).toBeVisible();

  const stored = await request.get(`/api/b/${token}`);
  expect(stored.status()).toBe(200);
  expect(((await stored.json()) as { status: string }).status).toBe("cancelled");
});

test("staff seat a walk-in from the live floor", async ({ page, request }) => {
  const links = await demoLinks(request);
  await signIn(page, STAFF, links.restaurant_staff);
  await expect(page.getByRole("heading", { name: "Service floor" })).toBeVisible();

  // Move the floor to 20:00 (dinner), so the test does not depend on the clock.
  await page.getByRole("slider", { name: /^Floor at/ }).fill(String(20 * 60));
  await expect(page.locator(".st-scrubber-time")).toHaveText("20:00");
  const seated = page.locator(".st-count-seated .st-count-number");
  const seatedBefore = Number(await seated.innerText());

  await page.getByRole("button", { name: "New walk-in" }).click();
  const dialog = page.getByRole("dialog", { name: "Walk-in at 20:00" });
  await dialog.getByLabel("How many people?").selectOption("2");
  await dialog.getByRole("button", { name: "Find a table" }).click();
  const seatButton = dialog.getByRole("button", { name: /^Seat at / });
  await expect(seatButton).toBeVisible();
  await seatButton.click();

  await expect(page.getByRole("status").filter({ hasText: /^Walk-in of 2 seated at / })).toHaveCount(1);
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => Number(await seated.innerText())).toBe(seatedBefore + 1);
});
