// Events vertical, organiser side: auto-fill shows a preview first, applying
// it seats the waiting guests, and Undo puts the plan back as it was.

import { type Page } from "@playwright/test";
import { ORGANISER, demoLinks, expect, signIn, test } from "./fixtures";

/** The "12 of 40 guests seated" line in the page header, as numbers. */
async function seatedCount(page: Page): Promise<{ seated: number; coming: number }> {
  const text = await page.locator(".ev-progress").innerText();
  const match = text.match(/(\d+) of (\d+)/);
  expect(match, `unexpected header text: ${text}`).not.toBeNull();
  return { seated: Number(match?.[1]), coming: Number(match?.[2]) };
}

test("the organiser previews auto-fill, applies it and undoes it", async ({ page, request }) => {
  const links = await demoLinks(request);
  await signIn(page, ORGANISER, links.conference_organiser);
  await expect(page.getByRole("heading", { level: 1, name: "Lisbon Data Summit" })).toBeVisible();

  const before = await seatedCount(page);
  expect(before.seated).toBeLessThan(before.coming);

  await page.getByRole("tab", { name: "Optimise" }).click();
  await page.getByRole("button", { name: "Preview auto-fill" }).click();

  // A preview changes nothing yet.
  await expect(page.getByRole("heading", { name: /^Preview: / })).toBeVisible();
  expect(await seatedCount(page)).toEqual(before);

  await page.getByRole("button", { name: "Apply this plan" }).click();
  await expect(page.getByRole("heading", { name: /^Preview: / })).toHaveCount(0);
  await expect.poll(async () => (await seatedCount(page)).seated).toBeGreaterThan(before.seated);

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await seatedCount(page)).seated).toBe(before.seated);
});
