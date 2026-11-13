// Spec 9.1 and 9.2: a diner searches, filters, picks a city, asks for a time and
// opens a restaurant. The new public pages are also scanned with axe, with real cards on screen.
import AxeBuilder from "@axe-core/playwright";
import { expect, isoDaysFromToday, test } from "./fixtures";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

test("the home page lists the demo restaurants and has no accessibility problems", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Find a table you will love" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Tagus Terrace" })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(5);
  const found = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(found.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test("search ignores accents, chips filter, and the city sorts by distance", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("article")).toHaveCount(5);
  await page.getByLabel("Restaurant or cuisine").fill("patio das laranjeiras");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 3, name: "Pátio das Laranjeiras" })).toBeVisible();

  await page.getByLabel("Restaurant or cuisine").fill("");
  await expect(page.getByRole("article")).toHaveCount(5);
  // On a phone the chips sit behind the Filters button.
  const filters = page.getByRole("button", { name: /^Filters/ });
  if (await filters.isVisible()) await filters.click();
  await page.getByRole("button", { name: "Terrace", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  await page.getByRole("button", { name: "Terrace", exact: true }).click();

  await page.getByLabel("Choose a city").selectOption("Lisboa");
  await expect(page.getByRole("article").first()).toContainText(/\d+(\.\d)? (m|km)/);
});

test("with a date, time and people the cards offer free times that open the booking", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "When?" }).click();
  await page.getByLabel("Date").fill(isoDaysFromToday(4));
  await page.getByLabel("Time").fill("20:00");
  const card = page.getByRole("article").filter({ hasText: "Tasca do Bairro" });
  await expect(card.getByRole("link", { name: /^\d\d:\d\d$/ }).first()).toBeVisible();
  await card.getByRole("link", { name: /^\d\d:\d\d$/ }).first().click();
  await expect(page).toHaveURL(/\/restaurants\/tasca-do-bairro\?date=.*&time=.*&party=2/);
  await expect(page.getByRole("heading", { name: "Choose your table" })).toBeVisible();
});

test("the public restaurant page has no accessibility problems and opens a photo", async ({ page }) => {
  await page.goto("/restaurants/tagus-terrace");
  await expect(page.getByRole("heading", { level: 1, name: "Tagus Terrace" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  const found = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(found.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  await page.getByRole("button", { name: /Open photo 1/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Open in Google Maps/ })).toBeVisible();
});

test("an unknown restaurant says so", async ({ page }) => {
  await page.goto("/restaurants/does-not-exist");
  await expect(page.getByText("We cannot find this restaurant")).toBeVisible();
});

test("the old booking link of a restaurant with a public page forwards there", async ({ page, request }) => {
  const info = (await (await request.get("/api/restaurants/casa-lumen")).json()) as { public_id: string };
  await page.goto(`/r/${info.public_id}?date=${isoDaysFromToday(3)}&party=2`);
  await expect(page).toHaveURL(/\/restaurants\/casa-lumen\?date=/);
  await expect(page.getByRole("heading", { name: "Book a table" })).toBeVisible();
});
