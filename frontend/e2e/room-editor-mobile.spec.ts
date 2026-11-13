import { demoLinks, expect, lastPart, test } from "./fixtures";
import { openOwnerRoom } from "./room-session";

test("a touch hold enables multiple selection, with accessible table choices", async ({ page, request, context }) => {
  const links = await demoLinks(request);
  await openOwnerRoom(page, request, lastPart(links.restaurant_booking));
  await page.getByRole("button", { name: "Tables", exact: true }).tap();
  const body = page.locator("[data-room-table]").filter({ has: page.locator(".room-table-label").filter({ hasText: /^W3$/ }) }).locator(".room-table");
  const box = (await body.boundingBox())!;
  const touch = await context.newCDPSession(page);
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
  await expect(page.getByRole("button", { name: "Multiple selection", exact: true })).toHaveAttribute("aria-pressed", "true");
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.getByText("Choose tables from a list", { exact: true }).tap();
  await page.getByLabel("Select W4", { exact: true }).check();
  await expect(page.getByRole("button", { name: "Align top", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
