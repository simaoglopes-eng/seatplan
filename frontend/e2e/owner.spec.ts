// Task 38: owner publication boundaries. Discovery/slug pages are not yet
// implemented; these checks deliberately exercise the existing booking route.
import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";
import { preparedRestaurant, publishRestaurant } from "./restaurant-fixture";

for (const width of [1440, 390]) test(`owner publishes and preserves existing bookings after unpublish at ${width}px`, async ({ page, request }) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  const venue = await preparedRestaurant(request, `Owner acceptance ${width}`);
  expect((await request.get(`/api/r/${venue.id}`)).status()).toBe(404);
  await page.addInitScript(token => sessionStorage.setItem("seatplan.session", token), venue.headers.Authorization.slice(7));
  await page.goto(`/owner/${venue.id}/review`);
  await expect(page.getByRole("button", { name: "Publish restaurant", exact: true })).toBeEnabled();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Publish restaurant", exact: true }).click();
  await expect(page.getByText(`Owner acceptance ${width} is live and open for bookings.`, { exact: false })).toBeVisible();
  // This is the specified canonical link; following it awaits task 29.
  await expect(page.getByRole("link", { name: "View public page" })).toHaveAttribute("href", `/restaurants/${venue.slug}`);
  await page.screenshot({ path: join(tmpdir(), `seatplan-38-owner-published-${width}.png`), fullPage: true });
  expect((await request.get(`/api/r/${venue.id}`)).status()).toBe(200);

  const rooms = await (await request.get(`/api/owner/restaurants/${venue.id}/rooms`, { headers: venue.headers })).json() as { rooms: { tables: { id: number; seats: { id: number }[] }[] }[] };
  const table = rooms.rooms[0].tables[0];
  const held = await request.post(`/api/r/${venue.id}/hold`, { data: { date: venue.day, time: "13:00", party: 2, table_id: table.id } });
  expect(held.status()).toBe(201);
  const { hold_id } = await held.json() as { hold_id: string };
  const booked = await request.post(`/api/r/${venue.id}/bookings`, { data: {
    hold_id, party: 2, name: "Existing Diner", email: `owner-boundary-${width}@example.com`, seat_id: table.seats[1].id,
  } });
  expect(booked.status()).toBe(201);
  const { manage_path } = await booked.json() as { manage_path: string };
  await page.getByRole("button", { name: "Unpublish", exact: true }).click();
  await page.getByRole("dialog", { name: "Remove from search?" }).getByRole("button", { name: "Unpublish", exact: true }).click();
  await expect(page.getByText(/^Draft ·|^Ready to publish$/)).toBeVisible();
  expect((await request.get(`/api/r/${venue.id}`)).status()).toBe(404);
  await page.goto(`/r/${venue.id}`);
  await expect(page.getByRole("heading", { name: "We cannot find this restaurant" })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.goto(manage_path);
  await expect(page.getByRole("heading", { name: "Manage your booking", exact: true })).toBeVisible();
  await expect(page.getByText(/Seat 2/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel booking", exact: true })).toBeEnabled();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: join(tmpdir(), `seatplan-38-existing-booking-${width}.png`), fullPage: true });
});

test("an invalid saved room explains why new bookings closed", async ({ page, request }) => {
  const venue = await preparedRestaurant(request, "Edited published room");
  await publishRestaurant(request, venue);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(token => sessionStorage.setItem("seatplan.session", token), venue.headers.Authorization.slice(7));
  await page.goto(`/owner/${venue.id}/rooms`);
  await page.getByRole("button", { name: "Tables", exact: true }).click();
  await page.getByLabel("Selected table", { exact: true }).selectOption({ label: "River 1" });
  await page.getByLabel("Object x (cm)").fill("5000");
  await page.getByLabel("Object x (cm)").press("Tab");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /saved as a draft.*new bookings/i })).toBeVisible();
  expect((await request.get(`/api/r/${venue.id}`)).status()).toBe(404);
  expect((await request.get(`/api/owner/restaurants/${venue.id}/profile`, { headers: venue.headers })).status()).toBe(200);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: join(tmpdir(), "seatplan-39-room-draft-390.png"), fullPage: true });
});
