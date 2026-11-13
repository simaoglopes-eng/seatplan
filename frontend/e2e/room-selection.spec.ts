import { demoLinks, expect, lastPart, test } from "./fixtures";
import { openOwnerRoom } from "./room-session";
import { join } from "node:path";
import { tmpdir } from "node:os";
import AxeBuilder from "@axe-core/playwright";

test("owner aligns, duplicates and deletes a table selection with keyboard undo", async ({ page, request }) => {
  const links = await demoLinks(request);
  await openOwnerRoom(page, request, lastPart(links.restaurant_booking));
  await page.getByRole("button", { name: "Tables", exact: true }).click();
  const keys: string[] = [];
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Place Square table", exact: true }).click();
    await page.getByRole("button", { name: "Place selected in room", exact: true }).click();
    keys.push(await page.getByLabel("Selected table", { exact: true }).inputValue());
    await page.getByLabel("Object x (cm)").fill(String(100 + i * 300));
    await page.getByLabel("Object x (cm)").press("Tab");
    await page.getByLabel("Object y (cm)").fill(String(200 + i * 100));
    await page.getByLabel("Object y (cm)").press("Tab");
  }
  await page.getByText("Choose tables from a list", { exact: true }).click();
  await page.getByLabel("Select Table 1", { exact: true }).check();
  await page.getByLabel("Select Table 2", { exact: true }).check();
  await expect(page.getByText("3 tables selected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Align top", exact: true }).click();
  await page.getByLabel("Selected table", { exact: true }).selectOption(keys[1]);
  await expect(page.getByLabel("Object y (cm)")).toHaveValue("200");
  await page.getByLabel("Select Table 1", { exact: true }).check();
  await page.getByLabel("Select Table 3", { exact: true }).check();
  await page.locator(".room-canvas").focus();
  await page.keyboard.press("Control+d");
  await expect(page.getByText("Tables: 24", { exact: true })).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(page.getByText("Tables: 21", { exact: true })).toBeVisible();
  await page.keyboard.press("Control+y");
  await expect(page.getByText("Tables: 24", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete selected tables", exact: true }).click();
  await expect(page.getByText("Tables: 21", { exact: true })).toBeVisible();
  await page.locator(".room-canvas").focus();
  await page.keyboard.press("Control+z");
  await expect(page.getByText("Tables: 24", { exact: true })).toBeVisible();
});

test("shift and area selection, rotation and resize gestures have form equivalents", async ({ page, request }) => {
  const links = await demoLinks(request);
  await openOwnerRoom(page, request, lastPart(links.restaurant_booking));
  await page.getByRole("button", { name: "Add room", exact: true }).click();
  await page.getByLabel("Room name", { exact: true }).fill("Selection gestures");
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  await page.getByRole("button", { name: "Tables", exact: true }).click();
  const keys: string[] = [];
  for (const x of [100, 400]) {
    await page.getByRole("button", { name: "Place Square table", exact: true }).click();
    await page.getByRole("button", { name: "Place selected in room", exact: true }).click();
    keys.push(await page.getByLabel("Selected table").inputValue());
    await page.getByLabel("Object x (cm)").fill(String(x)); await page.getByLabel("Object x (cm)").press("Tab");
    await page.getByLabel("Object y (cm)").fill("100"); await page.getByLabel("Object y (cm)").press("Tab");
  }
  await page.locator(`[data-room-table="${keys[0]}"] .room-table`).click({ modifiers: ["Shift"] });
  await expect(page.getByText("2 tables selected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear table selection", exact: true }).click();
  await page.getByRole("button", { name: "Select area", exact: true }).click();
  const a = (await page.locator(`[data-room-table="${keys[0]}"] .room-table`).boundingBox())!, b = (await page.locator(`[data-room-table="${keys[1]}"] .room-table`).boundingBox())!;
  await page.mouse.move(a.x - 15, a.y - 15); await page.mouse.down();
  await page.mouse.move(b.x + b.width + 15, b.y + b.height + 15, { steps: 5 }); await page.mouse.up();
  await expect(page.getByText("2 tables selected", { exact: true })).toBeVisible();
  await page.getByLabel("Selected table").selectOption(keys[0]);
  const currentBody = (await page.locator(`[data-room-table="${keys[0]}"] .room-table`).boundingBox())!;
  const handle = (await page.locator('[data-table-handle="rotate"]').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
  await page.mouse.move(currentBody.x + currentBody.width / 2 + 100, currentBody.y + currentBody.height / 2, { steps: 5 }); await page.mouse.up();
  await expect(page.getByLabel("Object rotation (degrees)")).toHaveValue("90");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Object rotation (degrees)")).toHaveValue("0");
  await page.getByLabel("Show 50 cm grid").uncheck();
  const resize = (await page.locator('[data-table-handle="resize"]').boundingBox())!;
  await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2); await page.mouse.down();
  await page.mouse.move(resize.x + resize.width / 2 + 60, resize.y + resize.height / 2 + 30, { steps: 5 }); await page.mouse.up();
  expect(Number(await page.getByLabel("Object width (cm)").inputValue())).toBeGreaterThan(80);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Object width (cm)")).toHaveValue("80");
  await page.screenshot({ path: join(tmpdir(), "seatplan-room-selection-1440.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Fit room", exact: true }).click();
  await page.screenshot({ path: join(tmpdir(), "seatplan-room-selection-390.png"), fullPage: true });
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
});
