// Steps of the attendee journey that both the desktop and the phone tests use.

import { expect, type Page } from "@playwright/test";

/**
 * From a fresh personal link to the "Choose your seat" step. The demo data
 * decides whether the guest still has to reply and whether the optional
 * "People you know" step shows, so each of those is answered only if it appears.
 */
export async function goToSeatStep(page: Page, link: string): Promise<void> {
  await page.goto(link);
  const seatHeading = page.getByRole("heading", { name: "Choose your seat" });
  const yes = page.getByRole("button", { name: "Yes, I will be there" });
  const skip = page.getByRole("button", { name: "Skip this step" });

  await expect(seatHeading.or(yes).or(skip)).toBeVisible();
  if (await yes.isVisible()) await yes.click();
  await expect(seatHeading.or(skip)).toBeVisible();
  if (await skip.isVisible()) await skip.click();
  await expect(seatHeading).toBeVisible();
}

/** The first card under "Recommended for you", and the seat name it shows, such as "Table 4, seat 3". */
export async function firstRecommendation(page: Page) {
  const card = page.getByRole("list", { name: "Recommended for you" }).getByRole("button").first();
  await expect(card).toBeVisible();
  const seatName = (await card.locator(".ev-rec-seat").innerText()).trim();
  expect(seatName).toMatch(/^(Table|Row) .+, seat .+$/);
  return { card, seatName };
}

/** The seat on the SVG map whose spoken name starts with `seatName`. */
export function seatOnMap(page: Page, seatName: string) {
  const escaped = seatName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.getByRole("option", { name: new RegExp(`^${escaped}, `) });
}

/** The page should now show the success step with that seat. */
export async function expectConfirmed(page: Page, seatName: string): Promise<void> {
  await expect(page.getByRole("heading", { name: "You are all set" })).toBeVisible();
  await expect(page.locator(".ev-seat-big")).toHaveText(seatName);
}
