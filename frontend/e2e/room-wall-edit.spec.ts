import AxeBuilder from "@axe-core/playwright";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { demoLinks, expect, lastPart, test } from "./fixtures";
import { openOwnerRoom } from "./room-session";

test("owner edits curves and corners through accessible forms on a phone", async ({ page, request }) => {
  const links = await demoLinks(request);
  await page.setViewportSize({ width: 390, height: 844 });
  await openOwnerRoom(page, request, lastPart(links.restaurant_booking));
  await page.getByLabel("Selected wall", { exact: true }).selectOption("0");
  await page.getByLabel("Bulge (cm)", { exact: true }).fill("100");
  await page.getByLabel("Bulge (cm)", { exact: true }).press("Tab");
  await expect(page.locator(".room-outline")).toHaveAttribute("d", / A /);
  await page.screenshot({ path: join(tmpdir(), "seatplan-room-wall-curved-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Add corner at midpoint" }).click();
  await expect(page.getByText("Walls: 5 sides", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByText("Walls: 4 sides", { exact: true })).toBeVisible();
  await page.getByLabel("Selected wall", { exact: true }).selectOption("0");
  await page.getByRole("button", { name: "Make straight" }).click();
  await expect(page.locator(".room-outline")).not.toHaveAttribute("d", / A /);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: join(tmpdir(), "seatplan-room-wall-mobile.png"), fullPage: true });
});

for (const width of [1440, 390]) {
test(`dragging a wall midpoint curves it in one undo step at ${width}px`, async ({ page, request }) => {
  const links = await demoLinks(request);
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await openOwnerRoom(page, request, lastPart(links.restaurant_booking));
  const handle = page.locator('[data-shape-handle="side-0"]');
  const bounds = (await handle.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 - 40, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator(".room-outline")).toHaveAttribute("d", / A /);
  expect(Number((await page.getByLabel("Bulge (cm)").inputValue()).replace(",", "."))).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".room-outline")).not.toHaveAttribute("d", / A /);
});
}

test("a double tap straightens a curved wall without inserting a corner", async ({ page, request }) => {
  const links = await demoLinks(request);
  await openOwnerRoom(page, request, lastPart(links.restaurant_booking));
  await page.getByLabel("Selected wall").selectOption("0");
  await page.getByLabel("Bulge (cm)").fill("100");
  await page.getByLabel("Bulge (cm)").press("Tab");
  await page.locator('[data-shape-handle="side-0"]').dblclick();
  await expect(page.locator(".room-outline")).not.toHaveAttribute("d", / A /);
  await expect(page.getByText("Walls: 4 sides", { exact: true })).toBeVisible();
});
