// Events vertical, attendee side, on a laptop-sized screen.
//
// The two tests run in order: the second one checks that the seat the first
// attendee confirmed cannot be taken by anybody else.

import { expectConfirmed, firstRecommendation, goToSeatStep, seatOnMap } from "./attendee-steps";
import { demoLinks, expect, lastPart, test } from "./fixtures";

test.describe.serial("wedding attendees", () => {
  let takenSeatId = 0;
  let takenSeatName = "";

  test("an attendee picks a recommended seat, holds it and confirms it", async ({ page, request }) => {
    const links = await demoLinks(request);
    const link = links.wedding_guest_choosing;
    await goToSeatStep(page, link);

    const { card, seatName } = await firstRecommendation(page);
    await card.click();
    await page.getByRole("button", { name: "Hold this seat for 5 minutes" }).click();

    // While the seat is held, the sticky bar names it and counts down.
    const holdBar = page.getByRole("region", { name: "Seat on hold" });
    await expect(holdBar).toContainText(seatName);
    await expect(holdBar).toContainText(/\d+:\d\d/);
    await holdBar.getByRole("button", { name: "Confirm this seat" }).click();

    await expectConfirmed(page, seatName);

    // The server agrees: the guest now owns exactly that seat.
    const me = await request.get(`/api/a/${lastPart(link)}`);
    expect(me.status()).toBe(200);
    const body = (await me.json()) as { me: { seat_id: number | null } };
    expect(body.me.seat_id).not.toBeNull();
    takenSeatId = body.me.seat_id as number;
    takenSeatName = seatName;
  });

  test("a second attendee cannot take a seat that is already confirmed", async ({ page, request }) => {
    expect(takenSeatId, "the first test must confirm a seat").toBeGreaterThan(0);
    const links = await demoLinks(request);
    const other = links.wedding_guest_seated;

    // This guest already has a seat; they choose to change it.
    await page.goto(other);
    await page.getByRole("button", { name: "Change seat" }).click();
    await expect(page.getByRole("heading", { name: "Choose a new seat" })).toBeVisible();

    // On their map the confirmed seat is shown as taken ("friend" if they know
    // the first attendee) and cannot be picked.
    const seat = seatOnMap(page, takenSeatName);
    await expect(seat).toHaveAttribute("aria-label", /, (taken|friend)(,|$)/);
    await expect(seat).toHaveAttribute("aria-disabled", "true");
    await seat.click({ force: true });
    await expect(page.getByRole("region", { name: "Seat on hold" })).toHaveCount(0);

    // Even going round the page, the database refuses the double booking.
    const hold = await request.post(`/api/a/${lastPart(other)}/hold`, { data: { seat_id: takenSeatId } });
    expect(hold.status()).toBe(409);
    expect(((await hold.json()) as { error: { code: string } }).error.code).toBe("seat_taken");
  });
});
