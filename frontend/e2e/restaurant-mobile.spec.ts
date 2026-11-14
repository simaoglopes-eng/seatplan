// A diner books on a phone at a restaurant with two rooms: the recommended table, a table in
// the other room, and a chair request. At every point there is one main action, and the step
// indicator says Your details from the moment a table is held.

import { demoLinks, expect, isoDaysFromToday, test } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("on a phone: one action per moment, a suggestion in another room, and a chair request", async ({ page, request }) => {
  const links = await demoLinks(request);
  await page.goto(`${links.showcase_tagus_terrace}?date=${isoDaysFromToday(6)}&time=20:00&party=2`);
  await expect(page.getByRole("heading", { name: "Choose your table" })).toBeVisible();

  // The card comes first and holds the one main action; there is no second, disabled "continue" bar.
  const hold = page.getByRole("button", { name: /^Hold .* & continue/ });
  await expect(hold).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Pick a table to continue" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit date, time and guests" })).toBeVisible();
  const steps = page.getByRole("navigation", { name: "Booking steps" });
  await expect(steps.locator('[aria-current="step"]')).toContainText("Table");

  // Another room: the card offers to go and look at our suggestion, never to hold it from here.
  const rooms = page.getByRole("tablist", { name: "Rooms" });
  const tabs = rooms.getByRole("tab");
  const count = await tabs.count();
  let other = -1;
  for (let i = 0; i < count; i += 1) if ((await tabs.nth(i).getAttribute("aria-selected")) !== "true") other = i;
  expect(other).toBeGreaterThanOrEqual(0);
  await tabs.nth(other).click();
  const show = page.getByRole("button", { name: /^Show .* in / });
  await expect(show).toBeVisible();
  await expect(hold).toHaveCount(0);
  await show.click();
  await expect(hold).toHaveCount(1);

  // Holding moves the screen to the details; the chair request stays inside that context.
  await hold.click();
  await expect(page.getByRole("form", { name: "Your details" })).toBeVisible();
  await expect(steps.locator('[aria-current="step"]')).toContainText("Details");
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
  await page.getByRole("button", { name: "Choose a chair" }).click();
  await expect(page.getByRole("heading", { name: /Request a chair/ })).toBeVisible();
  await expect(steps.locator('[aria-current="step"]')).toContainText("Details");
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Save chair request" }).click();
  await expect(page.getByText(/Chair requested/)).toBeVisible();
  await expect(steps.locator('[aria-current="step"]')).toContainText("Details");

  await page.getByLabel("Name for the booking").fill("Phone Diner");
  await page.getByLabel("Email", { exact: true }).fill("phone.diner@example.com");
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("heading", { name: "You are booked, Phone" })).toBeVisible();
});
