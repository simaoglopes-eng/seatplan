import AxeBuilder from "@axe-core/playwright";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, ORGANISER, test } from "./fixtures";

test("owner sign-in defaults to the private restaurant cards", async ({ page }) => {
  await page.goto("/owner/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(ORGANISER.email);
  await page.getByLabel("Password", { exact: true }).fill(ORGANISER.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/owner$/);
  await expect(page.getByRole("heading", { name: "Casa Lumen" })).toBeVisible();
  // The demo organiser also owns the four showcase restaurants. Each published card opens its service floor first;
  // editing is one quiet link away, and the side menu leads to every step of one restaurant.
  await expect(page.getByRole("link", { name: /^Open service floor/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /^Edit restaurant/ }).first()).toBeVisible();
  await page.screenshot({ path: join(tmpdir(), "seatplan-owner-cards.png"), fullPage: true });
});

for (const width of [1440, 390]) {
  test(`owner creates an account and sees an empty private list at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto("/owner/sign-up");
    await page.getByLabel("Name", { exact: true }).fill("Robin Owner");
    await page.getByLabel("Email", { exact: true }).fill(`owner-${width}@example.com`);
    await page.getByLabel("Password", { exact: true }).fill("a long safe owner password");
    await page.getByRole("checkbox").check();
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: join(tmpdir(), `seatplan-owner-signup-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Send verification code" }).click();
    const code = (await page.getByRole("status").filter({ hasText: "Demo code" }).innerText()).match(/\d{6}/)?.[0];
    expect(code).toBeTruthy();
    await page.getByLabel("Verification code").fill(code!);
    await page.getByRole("button", { name: "Verify and continue" }).click();
    await expect(page).toHaveURL(/\/owner$/);
    await expect(page.getByRole("heading", { name: "You have no restaurants yet" })).toBeVisible();
    await page.screenshot({ path: join(tmpdir(), `seatplan-owner-home-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  });
}
