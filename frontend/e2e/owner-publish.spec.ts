// Spec 5.3 steps 4 and 6: an owner takes the opening-hours model, sees what is
// still missing on the review page, fixes it, publishes, and diners can then open
// the booking page. Unpublishing closes it again.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";
import { ownerToken } from "./room-session";

test("an owner finishes the hours, reviews, publishes and unpublishes", async ({ page, request }) => {
  const token = await ownerToken(request);
  const headers = { Authorization: `Bearer ${token}` };
  const created = await request.post("/api/owner/restaurants", { data: { name: "Publish Flow Test" }, headers });
  expect(created.status()).toBe(201);
  const venue = ((await created.json()) as { public_id: string }).public_id;
  const profile = await request.patch(`/api/owner/restaurants/${venue}/profile`, {
    data: { cuisines: ["portuguese"], price_level: 2, address: "Rua Augusta 1, Lisboa", lat: 38.7223, lng: -9.1393, timezone: "Europe/Lisbon" },
    headers,
  });
  expect(profile.status()).toBe(200);

  await page.addInitScript((t) => window.sessionStorage.setItem("seatplan.session", t), token);

  // Nothing is ready yet: the review lists hours and tables, and Publish is off.
  await page.goto(`/owner/${venue}/review`);
  await expect(page.getByRole("heading", { name: "Review and publish" })).toBeVisible();
  const hours = page.getByRole("listitem").filter({ hasText: "Opening hours with at least one service" });
  await expect(hours.getByText("To do")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);

  // The link takes the owner to the hours step, which offers the model.
  await hours.getByRole("link", { name: /Fix opening hours/ }).click();
  await expect(page.getByText(/Lunch 12:00-15:00 and Dinner 19:00-23:00, Tuesday to Sunday/)).toBeVisible();
  await page.getByRole("button", { name: "Use this" }).click();
  await expect(page.getByRole("button", { name: "Save schedule" })).toBeVisible();

  // Rooms: one table, saved through the API (the editor itself has its own tests).
  const url = `/api/owner/restaurants/${venue}/rooms`;
  const initial = (await (await request.get(url, { headers })).json()) as { base_version: number; rooms: Record<string, unknown>[] };
  (initial.rooms[0] as Record<string, unknown>).tables = [{ id: null, key: "t1", zone_key: null, label: "T1", shape: "rect", x: 100, y: 100, w: 80, h: 80, max_party: 2, seats: [] }];
  expect((await request.put(url, { data: { base_version: initial.base_version, rooms: initial.rooms }, headers })).status()).toBe(200);

  await page.goto(`/owner/${venue}/review`);
  await expect(page.getByRole("button", { name: "Publish" })).toBeEnabled();
  await expect(page.getByRole("listitem").filter({ hasText: "At least one photo (recommended)" }).getByText("Recommended", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(/Publish Flow Test is published/)).toBeVisible();
  await expect(page.getByRole("link", { name: "View public page" })).toBeVisible();

  // Diners can open the booking page of a published restaurant.
  expect((await request.get(`/api/r/${venue}`)).status()).toBe(200);

  await page.getByRole("button", { name: "Unpublish" }).click();
  await page.getByRole("dialog", { name: "Remove from search?" }).getByRole("button", { name: "Unpublish" }).click();
  await expect(page.getByText(/Publish Flow Test is a draft/)).toBeVisible();
  expect((await request.get(`/api/r/${venue}`)).status()).toBe(404);
});
