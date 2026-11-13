import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicRestaurant } from "../../api/discovery";
import BookingPage from "../restaurant/BookingPage";
import { INFO, SLOTS, VENUE, dinerMap } from "../restaurant/__tests__/fixtures";
import { apiError, callsTo, mockApi } from "../restaurant/__tests__/mockApi";
import RestaurantPage from "./RestaurantPage";

vi.mock("../../maps/ResultsMap", () => ({ default: ({ pins }: { pins: { name: string }[] }) => <div data-testid="map">{pins.map((p) => p.name).join(",")}</div> }));

const API = `/api/r/${VENUE}`;

function page(patch: Partial<PublicRestaurant> = {}): PublicRestaurant {
  return {
    slug: "casa-linho",
    public_id: VENUE,
    name: "Casa Linho",
    preview: false,
    description: "A calm place by the river.",
    cuisines: ["portuguese", "seafood"],
    price_level: 2,
    address: "Rua Augusta 1, Lisboa",
    lat: 38.7,
    lng: -9.1,
    phone: "+351 210 000 000",
    website: "https://example.com",
    instagram: "casa_linho",
    timezone: "Europe/Lisbon",
    features: { sun: true, view: true, accessible: false, terrace: false },
    rooms_summary: ["Main room"],
    photos: [
      { url: "/api/photos/a", alt: "The dining room", is_cover: false },
      { url: "/api/photos/b", alt: "The terrace", is_cover: true },
    ],
    max_party: 8,
    schedule: {
      timezone: "Europe/Lisbon",
      service_periods: [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
        { name: "Lunch", weekday, start_time: "12:00", end_time: "15:00", slot_minutes: 15, max_covers_per_slot: 20 },
        { name: "Dinner", weekday, start_time: "19:00", end_time: "23:00", slot_minutes: 15, max_covers_per_slot: 20 },
      ]),
      turn_times: [],
      blackout_dates: [{ date: "2099-12-24", reason: "Christmas Eve" }],
    },
    book_url: `/r/${VENUE}`,
    maps_url: "https://www.google.com/maps/search/?api=1&query=38.7%2C-9.1",
    ...patch,
  };
}

function renderAt(url: string): void {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/restaurants/:slug" element={<RestaurantPage />} />
        <Route path="/r/:venueId" element={<BookingPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("Restaurant page", () => {
  it("shows the gallery, the facts, the weekly hours, the closed days and the contacts", async () => {
    mockApi({ "GET /api/restaurants/casa-linho": () => page(), [`GET ${API}`]: () => INFO });
    renderAt("/restaurants/casa-linho");
    expect(await screen.findByRole("heading", { level: 1, name: "Casa Linho" })).toBeTruthy();
    // The cover is first and large; the other photo is a thumbnail. Both have their alt text.
    const open = screen.getAllByRole("button", { name: /Open photo/ });
    expect(open[0].getAttribute("aria-label")).toContain("The terrace");
    expect(screen.getByAltText("The dining room")).toBeTruthy();
    expect(screen.getByText("Portuguese, Seafood", { exact: false })).toBeTruthy();
    expect(screen.getByText("Rua Augusta 1, Lisboa")).toBeTruthy();
    expect(screen.getByText("Sunny tables")).toBeTruthy();
    expect(screen.getByText("With a view")).toBeTruthy();
    const hours = screen.getByRole("table");
    expect(within(hours).getByRole("row", { name: /Mon Closed/ })).toBeTruthy();
    expect(within(hours).getByRole("row", { name: /Tue-Sun 12:00-15:00, 19:00-23:00/ })).toBeTruthy();
    expect(screen.getByText(/Closed 24 Dec: Christmas Eve/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "+351 210 000 000" }).getAttribute("href")).toBe("tel:+351210000000");
    expect(screen.getByRole("link", { name: /Website/ }).getAttribute("href")).toBe("https://example.com/");
    expect(screen.getByRole("link", { name: /Instagram/ }).getAttribute("href")).toBe("https://www.instagram.com/casa_linho/");
    const maps = screen.getByRole("link", { name: /Open in Google Maps/ });
    expect(maps.getAttribute("href")).toContain("https://www.google.com/maps/search/");
    expect(maps.getAttribute("rel")).toContain("noopener");
    expect(await screen.findByTestId("map")).toBeTruthy();
  });

  it("opens a photo full screen, moves with the arrows and closes on Escape", async () => {
    mockApi({ "GET /api/restaurants/casa-linho": () => page(), [`GET ${API}`]: () => INFO });
    renderAt("/restaurants/casa-linho");
    await screen.findByRole("heading", { level: 1, name: "Casa Linho" });
    fireEvent.click(screen.getAllByRole("button", { name: /Open photo 1 of 2/ })[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Photo 1 of 2: The terrace/)).toBeTruthy();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(within(dialog).getByText(/Photo 2 of 2: The dining room/)).toBeTruthy();
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(within(dialog).getByText(/Photo 1 of 2/)).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("embeds the booking, starting from the date and party in the link", async () => {
    const calls = mockApi({
      "GET /api/restaurants/casa-linho": () => page(),
      [`GET ${API}`]: () => INFO,
      [`GET ${API}/slots`]: () => SLOTS,
    });
    renderAt("/restaurants/casa-linho?date=2099-05-01&party=4");
    expect(await screen.findByRole("heading", { name: "Book a table" })).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "See free times" }));
    await screen.findByRole("button", { name: /19:30/ });
    const asked = callsTo(calls, "GET", `${API}/slots`)[0]?.query;
    expect(asked?.get("date")).toBe("2099-05-01");
    expect(asked?.get("party")).toBe("4");
  });

  it("goes straight to the tables when the time in the link is still free", async () => {
    const calls = mockApi({
      "GET /api/restaurants/casa-linho": () => page(),
      [`GET ${API}`]: () => INFO,
      [`GET ${API}/slots`]: () => SLOTS,
      [`GET ${API}/map`]: () => dinerMap(),
    });
    renderAt("/restaurants/casa-linho?date=2099-05-01&time=19:30&party=2");
    expect(await screen.findByRole("heading", { name: "Choose your table" })).toBeTruthy();
    expect(callsTo(calls, "GET", `${API}/map`)[0]?.query.get("time")).toBe("19:30");
  });

  it("lands on the list of times with a message when the linked time is gone", async () => {
    mockApi({
      "GET /api/restaurants/casa-linho": () => page(),
      [`GET ${API}`]: () => INFO,
      [`GET ${API}/slots`]: () => SLOTS,
    });
    renderAt("/restaurants/casa-linho?date=2099-05-01&time=20:00&party=2");
    expect(await screen.findByText("20:00 is not free any more. Please pick another time.")).toBeTruthy();
    expect(await screen.findByRole("button", { name: /19:30/ })).toBeTruthy();
  });

  it("ignores a time that is not a clock time", async () => {
    const calls = mockApi({ "GET /api/restaurants/casa-linho": () => page(), [`GET ${API}`]: () => INFO, [`GET ${API}/slots`]: () => SLOTS });
    renderAt("/restaurants/casa-linho?date=2099-05-01&time=banana&party=2");
    expect(await screen.findByRole("button", { name: "See free times" })).toBeTruthy();
    expect(callsTo(calls, "GET", `${API}/slots`)).toHaveLength(0);
  });

  it("shows the Preview banner and no booking for an unpublished restaurant", async () => {
    const calls = mockApi({ "GET /api/restaurants/casa-linho": () => page({ preview: true }) });
    renderAt("/restaurants/casa-linho");
    expect(await screen.findByText(/Preview: this restaurant is not published yet/)).toBeTruthy();
    expect(screen.getByText(/Booking opens as soon as you publish/)).toBeTruthy();
    expect(callsTo(calls, "GET", API)).toHaveLength(0);
  });

  it("says the restaurant cannot be found for a 404", async () => {
    mockApi({ "GET /api/restaurants/nope": () => apiError(404, "not_found", "Restaurant not found.") });
    renderAt("/restaurants/nope");
    expect(await screen.findByText("We cannot find this restaurant")).toBeTruthy();
  });

  it("drops a website that is not http or https", async () => {
    mockApi({ "GET /api/restaurants/casa-linho": () => page({ website: "javascript:alert(1)" }), [`GET ${API}`]: () => INFO });
    renderAt("/restaurants/casa-linho");
    await screen.findByRole("heading", { level: 1, name: "Casa Linho" });
    expect(screen.queryByRole("link", { name: /Website/ })).toBeNull();
  });
});

describe("the old booking link", () => {
  it("forwards a restaurant with a public page there, keeping the date, time and party", async () => {
    mockApi({
      [`GET ${API}`]: () => ({ ...INFO, slug: "casa-linho" }),
      "GET /api/restaurants/casa-linho": () => page(),
    });
    renderAt(`/r/${VENUE}?date=2099-05-01&party=3`);
    expect(await screen.findByRole("heading", { level: 1, name: "Casa Linho" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Book a table" })).toBeTruthy();
  });

  it("keeps the plain booking page for a restaurant without a public page", async () => {
    mockApi({ [`GET ${API}`]: () => INFO });
    renderAt(`/r/${VENUE}`);
    expect(await screen.findByRole("button", { name: "See free times" })).toBeTruthy();
  });
});
