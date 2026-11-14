// A diner books at a showcase restaurant that has two rooms and windows: the link from
// the discovery page skips to the tables, the rooms are tabs, a chair is picked, and the
// chair can be changed afterwards from the manage link.

import { demoLinks, expect, isoDaysFromToday, test } from "./fixtures";

test("a diner books a table with a chair in a two-room restaurant and changes the chair later", async ({ page, request }) => {
  const links = await demoLinks(request);
  const day = isoDaysFromToday(4);
  await page.goto(`${links.showcase_tagus_terrace}?date=${day}&time=20:00&party=2`);

  // The time in the link was free, so the diner lands straight on the tables.
  await expect(page.getByRole("heading", { name: "Choose your table" })).toBeVisible();
  const rooms = page.getByRole("tablist", { name: "Rooms" });
  await expect(rooms.getByRole("tab", { name: /River hall/ })).toBeVisible();
  await rooms.getByRole("tab", { name: /Quay terrace/ }).click();
  await expect(rooms.getByRole("tab", { name: /Quay terrace/ })).toHaveAttribute("aria-selected", "true");
  await rooms.getByRole("tab", { name: /River hall/ }).click();

  await page.getByRole("button", { name: "Choose for me" }).click();
  await page.getByRole("button", { name: "Choose a chair" }).click();
  await expect(page.getByRole("heading", { name: /Request a chair/ })).toBeVisible();
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: /^Continue with seat / }).click();

  await page.getByLabel("Name for the booking").fill("Ambience Diner");
  await page.getByLabel("Email", { exact: true }).fill("ambience.diner@example.com");
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("heading", { name: "You are booked, Ambience" })).toBeVisible();

  await page.getByRole("link", { name: "Manage booking" }).click();
  const chair = page.locator(".rb-summary dd", { hasText: /^Seat / });
  const before = (await chair.textContent()) ?? "";
  await page.getByRole("button", { name: "Request a different chair" }).click();
  const other = page.getByRole("radio").nth(1);
  await other.check();
  await page.getByRole("button", { name: "Save chair request" }).click();
  await expect(page.getByText("Chair request updated.")).toBeVisible();
  await expect(chair).not.toHaveText(before);
});

test("a time that is no longer free in the link lands on the list of times", async ({ page, request }) => {
  const links = await demoLinks(request);
  // 03:00 is never a seating time, so the server cannot find it free.
  await page.goto(`${links.showcase_miradouro_7}?date=${isoDaysFromToday(4)}&time=03:00&party=2`);
  await expect(page.getByText("03:00 is not free any more. Please pick another time.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pick another time" })).toBeVisible();
});

test("a diner confirms from the form beside the plan, without leaving the map", async ({ page, request }) => {
  const links = await demoLinks(request);
  await page.goto(`${links.showcase_tagus_terrace}?date=${isoDaysFromToday(5)}&time=20:00&party=2`);
  await expect(page.getByRole("heading", { name: "Choose your table" })).toBeVisible();
  // The suggested table is already selected, so reserving it is one tap on its card.
  await expect(page.getByRole("option", { selected: true })).toHaveCount(1);
  await page.getByRole("button", { name: /^Hold table .* & continue$/ }).first().click();
  const panel = page.getByRole("form", { name: "Your details" });
  await expect(panel).toBeVisible();
  await expect(page.getByRole("option").first()).toBeVisible(); // the plan is still there
  await panel.getByLabel("Name for the booking").fill("Panel Diner");
  await panel.getByLabel("Email", { exact: true }).fill("panel.diner@example.com");
  await panel.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("heading", { name: "You are booked, Panel" })).toBeVisible();
});
