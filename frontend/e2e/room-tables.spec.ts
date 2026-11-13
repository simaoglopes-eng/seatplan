import { join } from "node:path";
import { tmpdir } from "node:os";
import AxeBuilder from "@axe-core/playwright";
import { demoLinks, expect, lastPart, test } from "./fixtures";
import { openOwnerRoom } from "./room-session";

for (const width of [1440, 390]) {
  test(`owner edits a counter and its chairs at ${width}px`, async ({ page, request }) => {
    const links = await demoLinks(request);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await openOwnerRoom(page, request, lastPart(links.restaurant_booking));
    await page.getByRole("button", { name: "Tables", exact: true }).click();
    await page.getByRole("button", { name: "Place Counter", exact: true }).click();
    await page.getByRole("button", { name: "Place selected in room", exact: true }).click();
    await page.getByLabel("Table label", { exact: true }).fill("Counter A");
    await page.getByLabel("Table label", { exact: true }).press("Tab");
    await page.getByRole("button", { name: "Add chair", exact: true }).click();
    await expect(page.getByText("6 chairs", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByText("5 chairs", { exact: true })).toBeVisible();
    await page.getByLabel("Wheelchair accessible", { exact: true }).check();
    await page.getByLabel("Room for a high chair", { exact: true }).check();
    await page.getByLabel("Can be joined with", { exact: true }).fill("A");
    await page.getByLabel("Can be joined with", { exact: true }).press("Tab");
    await page.getByLabel("Selected chair", { exact: true }).selectOption({ label: "1" });
    await page.getByLabel("Chair label", { exact: true }).fill("Window seat");
    await page.getByLabel("Chair label", { exact: true }).press("Tab");
    await page.getByLabel("Chair accessible", { exact: true }).check();
    await page.getByLabel("Chair blocked", { exact: true }).check();
    await page.getByLabel("Chair x (cm)", { exact: true }).fill("520");
    await page.getByLabel("Chair x (cm)", { exact: true }).press("Tab");
    await expect(page.getByLabel("Chair x (cm)", { exact: true })).toHaveValue("520");
    await page.screenshot({ path: join(tmpdir(), `seatplan-room-tables-${width}.png`), fullPage: true });
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("moving a table carries its chairs, and a chair can then move independently", async ({ page, request }) => {
  const links = await demoLinks(request);
  await openOwnerRoom(page, request, lastPart(links.restaurant_booking));
  await page.getByRole("button", { name: "Tables", exact: true }).click();
  await page.getByRole("button", { name: "Place Counter", exact: true }).click();
  await page.getByRole("button", { name: "Place selected in room", exact: true }).click();
  const key = await page.getByLabel("Selected table", { exact: true }).inputValue();
  const body = (await page.locator(`[data-room-table="${key}"] .room-table`).boundingBox())!;
  await page.mouse.move(body.x + body.width / 2, body.y + body.height / 2);
  await page.mouse.down();
  await page.mouse.move(body.x + body.width / 2 + 60, body.y + body.height / 2, { steps: 5 });
  await page.mouse.up();
  expect(Number(await page.getByLabel("Object x (cm)").inputValue())).toBeGreaterThan(500);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Object x (cm)")).toHaveValue("500");
  await page.getByLabel("Selected chair").selectOption({ label: "1" });
  const chairKey = await page.getByLabel("Selected chair").inputValue();
  const seat = (await page.locator(`[data-room-chair="${chairKey}"] .room-seat`).boundingBox())!;
  const originalX = await page.getByLabel("Chair x (cm)").inputValue();
  await page.mouse.move(seat.x + seat.width / 2, seat.y + seat.height / 2);
  await page.mouse.down();
  await page.mouse.move(seat.x + seat.width / 2 + 30, seat.y + seat.height / 2, { steps: 5 });
  await page.mouse.up();
  expect(Number(await page.getByLabel("Chair x (cm)").inputValue())).toBeGreaterThan(Number(originalX));
  await expect(page.getByLabel("Object x (cm)")).toHaveValue("500");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Chair x (cm)")).toHaveValue(originalX);
});
