import { tmpdir } from "node:os";
import { join } from "node:path";
import { demoLinks, expect, lastPart, test } from "./fixtures";
import { openOwnerRoom } from "./room-session";

for (const width of [1440, 390]) {
  test(`owner creates an L-shaped room and can undo at ${width}px`, async ({ page, request }) => {
    const links = await demoLinks(request);
    const venue = lastPart(links.restaurant_booking);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await openOwnerRoom(page, request, venue);
    await expect(page.getByRole("heading", { name: "Casa Lumen · Rooms" })).toBeVisible();
    await page.getByRole("button", { name: "Add room", exact: true }).click();
    await page.getByLabel("Room name", { exact: true }).fill("L-shaped terrace");
    await page.getByLabel("Initial shape").selectOption("l-shape");
    await page.getByRole("button", { name: "Create room", exact: true }).click();
    await expect(page.getByLabel("Room", { exact: true })).toHaveValue(/r-/);
    await expect(page.locator(".room-status")).toContainText("64 m²");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByLabel("Room", { exact: true })).toHaveValue("implicit-main");
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(page.locator(".room-status")).toContainText("64 m²");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: join(tmpdir(), `seatplan-room-shape-${width}.png`), fullPage: true });
  });
}

test("owner draws a room by tapping corners", async ({ page, request }) => {
  const links = await demoLinks(request);
  await page.setViewportSize({ width: 390, height: 844 });
  await openOwnerRoom(page, request, lastPart(links.restaurant_booking));
  await page.getByRole("button", { name: "Add room", exact: true }).click();
  await page.getByLabel("Room name", { exact: true }).fill("Drawn room");
  await page.getByLabel("Initial shape").selectOption("draw");
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  const canvas = page.locator(".room-canvas");
  await canvas.click({ position: { x: 90, y: 100 } });
  await canvas.click({ position: { x: 260, y: 100 } });
  await canvas.click({ position: { x: 260, y: 260 } });
  await canvas.click({ position: { x: 90, y: 260 } });
  await page.getByRole("button", { name: "Close shape", exact: true }).click();
  await expect(page.getByText("Walls: 4 sides", { exact: true })).toBeVisible();
  await expect(page.locator(".room-outline")).toHaveCount(1);
});
