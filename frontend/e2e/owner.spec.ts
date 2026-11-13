// An owner creates a restaurant, publishes it and a diner finds it; unpublishing hides it again.
// The setup goes through the API (the screens have their own specs); what is checked here is the loop
// "published" -> "found by a diner" -> "private again".
import { expect, test } from "./fixtures";
import { ownerToken } from "./room-session";

test("a published restaurant is found by name, and unpublishing takes it off the search", async ({ page, request }) => {
  const token = await ownerToken(request);
  const headers = { Authorization: `Bearer ${token}` };
  const name = `Findable Loop ${Date.now()}`;
  const created = await request.post("/api/owner/restaurants", { data: { name }, headers });
  expect(created.status()).toBe(201);
  const venue = ((await created.json()) as { public_id: string }).public_id;
  expect((await request.patch(`/api/owner/restaurants/${venue}/profile`, {
    data: { cuisines: ["japanese"], price_level: 2, address: "Rua Augusta 1, Lisboa", lat: 38.7223, lng: -9.1393, timezone: "Europe/Lisbon" },
    headers,
  })).status()).toBe(200);
  expect((await request.put(`/api/staff/${venue}/schedule`, {
    data: { service_periods: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ name: "Dinner", weekday, start_time: "19:00", end_time: "23:00", slot_minutes: 15, max_covers_per_slot: 30 })), turn_times: [{ max_party: 4, minutes: 105 }], blackout_dates: [] },
    headers,
  })).ok()).toBe(true);
  const url = `/api/owner/restaurants/${venue}/rooms`;
  const initial = (await (await request.get(url, { headers })).json()) as { base_version: number; rooms: Record<string, unknown>[] };
  (initial.rooms[0] as Record<string, unknown>).tables = [{ id: null, key: "t1", zone_key: null, label: "T1", shape: "rect", x: 100, y: 100, w: 80, h: 80, max_party: 4, seats: [] }];
  expect((await request.put(url, { data: { base_version: initial.base_version, rooms: initial.rooms }, headers })).status()).toBe(200);

  // A draft is not on the search.
  expect(((await (await request.get(`/api/restaurants?q=${encodeURIComponent(name)}`)).json()) as { total: number }).total).toBe(0);

  const published = await request.post(`/api/owner/restaurants/${venue}/publish`, { headers });
  expect(published.status()).toBe(200);
  const slug = ((await published.json()) as { url: string }).url.split("/").pop();

  await page.goto("/");
  await page.getByLabel("Restaurant or cuisine").fill(name);
  const card = page.getByRole("article").filter({ hasText: name });
  await expect(card).toBeVisible();
  await card.getByRole("link", { name }).click();
  await expect(page).toHaveURL(new RegExp(`/restaurants/${slug}$`));
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByText("Rua Augusta 1, Lisboa")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Book a table" })).toBeVisible();

  expect((await request.post(`/api/owner/restaurants/${venue}/unpublish`, { headers })).status()).toBe(200);
  await page.goto("/");
  await page.getByLabel("Restaurant or cuisine").fill(name);
  await expect(page.getByText("No restaurants match. Try removing a filter.")).toBeVisible();
  expect((await request.get(`/api/restaurants/${slug}`)).status()).toBe(404);
});
