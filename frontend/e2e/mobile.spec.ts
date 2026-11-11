// The attendee journey on a phone-sized screen (390 x 844, touch), run by the
// "mobile" project in playwright.config.ts. The seat is chosen by tapping the
// map itself, as a guest on a phone would.

import { expectConfirmed, firstRecommendation, goToSeatStep, seatOnMap } from "./attendee-steps";
import { demoLinks, expect, test } from "./fixtures";

test("on a phone, an attendee taps a seat on the map and confirms it", async ({ page, request }) => {
  const links = await demoLinks(request);
  await goToSeatStep(page, links.conference_guest_choosing);

  // "Show on map" zooms in on the recommended seat, so it is big enough to tap.
  const { card, seatName } = await firstRecommendation(page);
  await card.tap();
  await seatOnMap(page, seatName).tap();

  const holdBar = page.getByRole("region", { name: "Seat on hold" });
  await expect(holdBar).toContainText(seatName);
  await holdBar.getByRole("button", { name: "Confirm this seat" }).tap();
  await expectConfirmed(page, seatName);

  // Nothing is wider than the phone: no sideways scrolling.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("on a phone, a visitor with the shared link creates an account", async ({ page, request }) => {
  const links = await demoLinks(request);
  await page.goto(links.conference_share);
  await expect(page.getByText(/\d+ places? left\./)).toBeVisible();
  const noSideways = async () =>
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await noSideways();

  await page.getByRole("link", { name: "Create an account to choose a seat" }).first().tap();
  await page.getByLabel("Your name").fill("Pia Phone");
  await page.getByRole("textbox", { name: "Email" }).fill("zq.phone@example.com");
  await page.getByLabel("Password", { exact: true }).fill("a long phone password");
  await page.getByRole("checkbox", { name: /I agree that SeatPlan stores my details/ }).tap();
  await noSideways();
  await page.getByRole("button", { name: "Send my code" }).tap();
  const badge = page.getByText(/Demo only: your code is \d{6}/);
  const code = ((await badge.innerText()).match(/\d{6}/) ?? [""])[0];
  await page.getByLabel("Code").fill(code);
  await page.getByRole("button", { name: "Create my account" }).tap();

  await page.waitForURL((url) => url.pathname.startsWith("/my/") && url.pathname.length > 4);
  await expect(page.getByText("Signed in as zq.phone@example.com")).toBeVisible();
  await noSideways();
});
