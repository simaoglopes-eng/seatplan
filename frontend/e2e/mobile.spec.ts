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
