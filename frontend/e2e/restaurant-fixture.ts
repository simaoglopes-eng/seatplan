// Real owner APIs prepare isolated restaurants; diner journeys use the UI.
import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "./fixtures";
import { ownerToken } from "./room-session";

export async function preparedRestaurant(request: APIRequestContext, name: string) {
  const headers = { Authorization: `Bearer ${await ownerToken(request)}` };
  const created = await request.post("/api/owner/restaurants", { headers, data: { name } });
  expect(created.status()).toBe(201);
  const { public_id: id, slug } = await created.json() as { public_id: string; slug: string };
  expect((await request.patch(`/api/owner/restaurants/${id}/profile`, { headers, data: {
    cuisines: ["portuguese"], price_level: 2, address: "Lisboa", lat: 38.7223, lng: -9.1393,
  } })).status()).toBe(200);
  expect((await request.put(`/api/staff/${id}/schedule`, { headers, data: {
    service_periods: Array.from({ length: 7 }, (_, weekday) => ({ name: "All day", weekday,
      start_time: "12:00", end_time: "23:00", slot_minutes: 15, max_covers_per_slot: 20 })),
    turn_times: [{ max_party: 2, minutes: 90 }], blackout_dates: [],
  } })).status()).toBe(200);
  const point = (x: number, y: number) => ({ x, y, curve: 0 });
  const table = (key: string, label: string, x: number) => ({ id: null, key, zone_key: null, label,
    shape: "rect", x, y: 550, w: 80, h: 80, max_party: 2, seats: [
      { id: null, key: `${key}-s1`, label: "1", x: x + 40, y: 525 },
      { id: null, key: `${key}-s2`, label: "2", x: x + 40, y: 655 },
    ] });
  const rooms = ["River room", "Garden room"].map((roomName, i) => ({
    id: null, key: `r${i}`, name: roomName, north_deg: 0, is_outdoor: false, position: i,
    outline: { points: [point(0, 0), point(1000, 0), point(1000, 700), point(0, 700)] },
    openings: [{ id: null, key: `o${i}`, side: 2, offset: 0, width: 1000, kind: "glass_wall",
      view_text: i === 0 ? "river" : "garden", view_tags: [i === 0 ? "river" : "garden"] }],
    fixtures: [], zones: [], tables: [table(`t${i}-a`, i === 0 ? "River 1" : "Garden 1", 200), table(`t${i}-b`, i === 0 ? "River 2" : "Garden 2", 600)],
  }));
  const saved = await request.put(`/api/owner/restaurants/${id}/rooms`, { headers, data: { base_version: 0, rooms } });
  expect(saved.status()).toBe(200);
  const year = new Date().getFullYear() + 1;
  return { id, slug, headers, day: `${year}-06-21` };
}

export async function publishRestaurant(request: APIRequestContext, venue: Awaited<ReturnType<typeof preparedRestaurant>>) {
  const answer = await request.post(`/api/owner/restaurants/${venue.id}/publish`, { headers: venue.headers });
  expect(answer.status(), await answer.text()).toBe(200);
}

export async function dinerMap(page: Page, id: string, day: string, time = "13:00") {
  await page.goto(`/r/${id}?date=${day}&party=2`);
  await page.getByRole("button", { name: "See free times" }).click();
  await page.getByRole("button", { name: `${time} Available`, exact: true }).click();
  await page.getByRole("button", {name:`Choose a table at ${time}`}).click();
  await expect(page.getByRole("heading", { name: "Choose your table" })).toBeVisible();
}
