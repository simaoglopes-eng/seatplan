// The shared event link and guest accounts (docs/guest-accounts.md), on a
// laptop-sized screen. The phone version of the sign-up is in mobile.spec.ts.
//
// The tests run in order and share one visitor: they open the wedding's
// shared link, make an account with the demo code, choose a seat, find the
// seat email with its picture in the outbox, sign out and back in, check a
// second visitor cannot take that seat, and finally the organiser switches
// the link off. The last test switches it on again, so later test files see
// the demo as it was.

import type { APIRequestContext, Page } from "@playwright/test";
import { expectConfirmed, firstRecommendation, seatOnMap } from "./attendee-steps";
import { ORGANISER, demoLinks, expect, lastPart, signIn, test } from "./fixtures";

/** A made-up address on example.com: the demo shows its code on screen. */
const VISITOR = { name: "Zoe Visitor", email: "zq.visitor@example.com", password: "a long visitor password" };
/** How the organiser's email log shows that address (core/privacy.mask_email). */
const VISITOR_MASKED = "zq***@example.com";

interface EmailLogItem {
  kind: string;
  to: string;
  has_picture: boolean;
}

/** An organiser session for API calls, through the real login route. */
async function organiserHeaders(request: APIRequestContext): Promise<Record<string, string>> {
  const answer = await request.post("/api/auth/login", { data: ORGANISER });
  expect(answer.status()).toBe(200);
  const { token } = (await answer.json()) as { token: string };
  return { Authorization: `Bearer ${token}` };
}

/** From the seat page of an account holder to the "Choose your seat" step. */
async function reachSeatStep(page: Page): Promise<void> {
  const seatHeading = page.getByRole("heading", { name: "Choose your seat" });
  const yes = page.getByRole("button", { name: "Yes, I will be there" });
  const skip = page.getByRole("button", { name: "Skip this step" });
  await expect(seatHeading.or(yes).or(skip)).toBeVisible();
  if (await yes.isVisible()) await yes.click();
  await expect(seatHeading.or(skip)).toBeVisible();
  if (await skip.isVisible()) await skip.click();
  await expect(seatHeading).toBeVisible();
}

test.describe.serial("a visitor with the shared link", () => {
  let shareLink = "";
  let eventId = "";
  let seatName = "";
  let seatId = 0;

  test("sees the event and the live map, but cannot choose a seat", async ({ page, request }) => {
    const links = await demoLinks(request);
    shareLink = links.wedding_share;
    eventId = lastPart(links.wedding_organiser);
    expect(shareLink).toMatch(/^\/j\/[A-Za-z0-9_-]{43}$/);

    const seatWrites: string[] = [];
    page.on("request", (sent) => {
      if (/\/(hold|confirm|seat)$/.test(new URL(sent.url()).pathname)) seatWrites.push(sent.url());
    });
    await page.goto(shareLink);
    await expect(page.getByText(/\d+ places? left\./)).toBeVisible();
    const free = page.getByRole("option", { name: /, free(,|$)/ }).first();
    await free.click();
    // Picking a seat only opens the panel that explains how to choose it.
    await expect(page.getByRole("heading", { name: /^Seat .+ is free$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Hold/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Create an account to choose a seat" }).first()).toBeVisible();
    expect(seatWrites, "a visitor never holds or confirms").toEqual([]);

    // The server has no hold route for visitors at all.
    const hold = await request.post(`/api${shareLink}/hold`, { data: { seat_id: 1 } });
    expect([404, 405]).toContain(hold.status());
  });

  test("creates an account with the emailed code and lands on their seat page", async ({ page }) => {
    await page.goto(shareLink);
    await page.getByRole("link", { name: "Create an account to choose a seat" }).first().click();
    await page.getByLabel("Your name").fill(VISITOR.name);
    await page.getByRole("textbox", { name: "Email" }).fill(VISITOR.email);
    await page.getByLabel("Password", { exact: true }).fill(VISITOR.password);
    await page.getByRole("checkbox", { name: /I agree that SeatPlan stores my details/ }).check();
    await page.getByRole("button", { name: "Send my code" }).click();

    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    // Demo only: the code is shown on screen instead of being emailed.
    const badge = page.getByText(/Demo only: your code is \d{6}/);
    const code = ((await badge.innerText()).match(/\d{6}/) ?? [""])[0];
    await page.getByLabel("Code").fill(code);
    await page.getByRole("button", { name: "Create my account" }).click();

    await page.waitForURL((url) => url.pathname === `/my/${eventId}`);
    await expect(page.getByText(`Signed in as ${VISITOR.email}`)).toBeVisible();
  });

  test("chooses, holds and confirms a seat", async ({ page }) => {
    // A new page has no guest session yet: signing in is part of this step.
    await page.goto(`/my/${eventId}`);
    await page.waitForURL((url) => url.pathname === "/my/sign-in");
    await page.getByRole("textbox", { name: "Email" }).fill(VISITOR.email);
    await page.getByLabel("Password").fill(VISITOR.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => url.pathname === `/my/${eventId}`);

    await reachSeatStep(page);
    const recommended = await firstRecommendation(page);
    seatName = recommended.seatName;
    await recommended.card.click();
    await page.getByRole("button", { name: "Hold this seat for 5 minutes" }).click();
    const holdBar = page.getByRole("region", { name: "Seat on hold" });
    await expect(holdBar).toContainText(seatName);
    await holdBar.getByRole("button", { name: "Confirm this seat" }).click();
    await expectConfirmed(page, seatName);
    await expect(page.getByText(new RegExp(`picture of the room to ${VISITOR.email.replace(".", "\\.")}`))).toBeVisible();
  });

  test("the outbox holds one seat email for them, with the picture inline", async ({ request }) => {
    const headers = await organiserHeaders(request);
    const answer = await request.get("/api/emails/log?limit=200", { headers });
    expect(answer.status()).toBe(200);
    const mine = ((await answer.json()) as EmailLogItem[]).filter((row) => row.to === VISITOR_MASKED && row.kind.startsWith("seat_"));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ kind: "seat_confirmed", has_picture: true });

    // The organiser's guest list marks them as joined with the link.
    const guests = await request.get(`/api/events/${eventId}/guests`, { headers });
    const rows = (await guests.json()) as { name: string; source: string; has_account: boolean; seat_id: number | null }[];
    const row = rows.find((guest) => guest.name === VISITOR.name);
    expect(row).toMatchObject({ source: "self_registered", has_account: true });
    seatId = row?.seat_id ?? 0;
    expect(seatId).toBeGreaterThan(0);
  });

  test("signs out, and signing back in brings the seat back", async ({ page }) => {
    await page.goto("/my/sign-in");
    await page.getByRole("textbox", { name: "Email" }).fill(VISITOR.email);
    await page.getByLabel("Password").fill(VISITOR.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => url.pathname === "/my");
    await expect(page.getByText(new RegExp(`Your seat: seat`))).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL((url) => url.pathname === "/my/sign-in");
    // Without a session the seat page sends people to sign in, then back.
    await page.goto(`/my/${eventId}`);
    await page.waitForURL((url) => url.pathname === "/my/sign-in" && url.search.includes("next="));
    await page.getByRole("textbox", { name: "Email" }).fill(VISITOR.email);
    await page.getByLabel("Password").fill(VISITOR.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => url.pathname === `/my/${eventId}`);
    await expectConfirmed(page, seatName);
  });

  test("a second visitor cannot take that seat", async ({ page, request }) => {
    await page.goto(shareLink);
    const seat = seatOnMap(page, seatName);
    await expect(seat).toHaveAttribute("aria-label", /, taken(,|$)/);
    await expect(seat).toHaveAttribute("aria-disabled", "true");

    // A second account, made through the API, is refused by the database too.
    const sent = await request.post(`/api${shareLink}/register`, {
      data: { name: "Second Visitor", email: "zq.second@example.com", password: "another long password", consent: true },
    });
    expect(sent.status()).toBe(202);
    const { demo_code: code, signup_id: signupId } = (await sent.json()) as { demo_code: string; signup_id: string };
    const verified = await request.post("/api/guest/verify", {
      data: { email: "zq.second@example.com", code, signup_id: signupId },
    });
    expect(verified.status()).toBe(201);
    const { token } = (await verified.json()) as { token: string };
    const hold = await request.post(`/api/guest/events/${eventId}/hold`, {
      data: { seat_id: seatId },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(hold.status()).toBe(409);
    expect(((await hold.json()) as { error: { code: string } }).error.code).toBe("seat_taken");
  });

  test("the organiser switches the link off and the visitor page says so", async ({ page, request }) => {
    const links = await demoLinks(request);
    await signIn(page, ORGANISER, links.wedding_organiser);
    await page.getByRole("tab", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Shared link" })).toBeVisible();
    const allow = page.getByRole("checkbox", { name: "Allow people to join with the shared link" });
    await expect(allow).toBeChecked();
    // The box follows the server's answer, so wait for that, not for the click.
    await allow.click();
    await expect(allow).not.toBeChecked();
    await expect(page.getByText("The link is off. Nobody new can join with it.").first()).toBeVisible();

    await page.goto(shareLink);
    await expect(page.getByRole("heading", { name: "This link is closed for now" })).toBeVisible();
    await expect(page.getByRole("listbox")).toHaveCount(0);

    // Back on for the test files that run after this one.
    const headers = await organiserHeaders(request);
    const on = await request.patch(`/api/events/${eventId}/share`, { data: { enabled: true }, headers });
    expect(on.status()).toBe(200);
  });
});
