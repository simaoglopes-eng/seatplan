import { demoLinks, expect, lastPart, test } from "./fixtures";
import { openOwnerRoom } from "./room-session";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";

test("owner uploads a resized photo and manages a private gallery", async ({ page, request }) => {
  const links = await demoLinks(request);
  await openOwnerRoom(page, request, lastPart(links.restaurant_booking));
  const token = await page.evaluate(() => sessionStorage.getItem("seatplan.session"));
  const made = await request.post("/api/owner/restaurants", { data: { name: "Photo gallery" }, headers: { Authorization: `Bearer ${token}` } });
  const vid = ((await made.json()) as { public_id: string }).public_id;
  await page.goto(`/owner/${vid}/photos`);
  const encoded = await page.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = 2400; canvas.height = 1800; const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#325c48"; ctx.fillRect(0, 0, 2400, 1800); return canvas.toDataURL("image/png").split(",")[1]; });
  await page.getByLabel("Add photos", { exact: true }).setInputFiles({ name: "room.png", mimeType: "image/png", buffer: Buffer.from(encoded, "base64") });
  await expect(page.getByLabel("Describe photo 1", { exact: true })).toBeVisible();
  await expect(page.locator(".owner-photo-card img")).toHaveJSProperty("naturalWidth", 1600);
  await page.getByLabel("Describe photo 1", { exact: true }).fill("Green dining room");
  await page.getByLabel("Describe photo 1", { exact: true }).press("Tab");
  await page.reload();
  await expect(page.getByLabel("Describe photo 1", { exact: true })).toHaveValue("Green dining room");
  await page.getByLabel("Add photos", { exact: true }).setInputFiles({ name: "other.png", mimeType: "image/png", buffer: Buffer.from(encoded, "base64") });
  await expect(page.getByLabel("Describe photo 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Set photo 2 as cover", exact: true }).click();
  await expect(page.locator(".owner-photo-card").nth(1)).toContainText("Cover");
  await page.getByRole("button", { name: "Move photo 2 left", exact: true }).click();
  await expect(page.locator(".owner-photo-card").first()).toContainText("Cover");
  await page.getByRole("button", { name: "Remove photo 1", exact: true }).click();
  await expect(page.locator(".owner-photo-card")).toHaveCount(1);
  await page.screenshot({ path: join(tmpdir(), "seatplan-owner-photos-1440.png"), fullPage: true });
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(tmpdir(), "seatplan-owner-photos-390.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const listed = await request.get(`/api/owner/restaurants/${vid}/photos`, { headers: { Authorization: `Bearer ${token}` } });
  const photo = ((await listed.json()) as { url: string }[])[0];
  expect((await request.get(photo.url)).status()).toBe(404);
  await page.goto("/owner");
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Photo gallery", exact: true }) });
  await expect(card.locator("img")).toHaveJSProperty("naturalWidth", 1600);
});

test("a detailed photo retries at 1200 pixels when the 1600 JPEG is too large", async ({ page, request }) => {
  const links = await demoLinks(request);
  await openOwnerRoom(page, request, lastPart(links.restaurant_booking));
  const token = await page.evaluate(() => sessionStorage.getItem("seatplan.session"));
  const made = await request.post("/api/owner/restaurants", { data: { name: "Detailed photo" }, headers: { Authorization: `Bearer ${token}` } });
  const vid = ((await made.json()) as { public_id: string }).public_id;
  await page.goto(`/owner/${vid}/photos`);
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1600;
    const ctx = canvas.getContext("2d")!, pixels = ctx.createImageData(1600, 1600);
    let state = 123456789;
    for (let i = 0; i < pixels.data.length; i += 4) { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; const gray = state & 255; pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = gray; pixels.data[i + 3] = 255; }
    ctx.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const uploaded = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/photos"));
  await page.getByLabel("Add photos", { exact: true }).setInputFiles({ name: "detailed.png", mimeType: "image/png", buffer: Buffer.from(encoded, "base64") });
  const answer = await uploaded;
  expect(answer.status()).toBe(201);
  expect(((await answer.json()) as { width: number }).width).toBe(1200);
});
