import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RestaurantCard } from "../../api/discovery";
import DiscoverPage from "./DiscoverPage";

// Leaflet needs a real browser layout; the map has its own browser test.
vi.mock("../../maps/ResultsMap", () => ({ default: ({ pins }: { pins: unknown[] }) => <div data-testid="map">{pins.length} pins</div> }));

function card(index: number, patch: Partial<RestaurantCard> = {}): RestaurantCard {
  return {
    slug: `casa-${index}`,
    public_id: `pid${index}`,
    name: `Casa ${index}`,
    cuisines: ["portuguese", "seafood"],
    price_level: 2,
    cover_url: `/api/photos/photo${index}`,
    cover_alt: `The room of Casa ${index}`,
    address: "Rua Augusta 1",
    lat: 38.7 + index / 100,
    lng: -9.1,
    distance_m: null,
    features: { sun: true, view: false, accessible: true, terrace: false },
    next_times: [],
    ...patch,
  };
}

function server(answer: (params: URLSearchParams) => { items: RestaurantCard[]; total: number } | Response) {
  const asked: URLSearchParams[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      asked.push(url.searchParams);
      const result = answer(url.searchParams);
      return result instanceof Response ? result : new Response(JSON.stringify(result));
    }),
  );
  return asked;
}

function renderPage(): void {
  render(
    <MemoryRouter>
      <DiscoverPage />
    </MemoryRouter>,
  );
}

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("DiscoverPage", () => {
  it("shows the title, the search box and a card per restaurant with its features in words", async () => {
    server(() => ({ items: [card(1), card(2)], total: 2 }));
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Find a table you will love" })).toBeTruthy();
    expect(screen.getByText("See the room, the light and the view before you book.")).toBeTruthy();
    expect(screen.getByLabelText("Restaurant or cuisine")).toBeTruthy();
    const first = (await screen.findByRole("heading", { name: "Casa 1" })).closest("article") as HTMLElement;
    expect(within(first).getByText("Portuguese, Seafood", { exact: false })).toBeTruthy();
    expect(within(first).getByText("Sunny tables")).toBeTruthy();
    expect(within(first).getByText("Wheelchair accessible")).toBeTruthy();
    expect(within(first).getByRole("link", { name: "Casa 1" }).getAttribute("href")).toBe("/restaurants/casa-1");
    const photo = first.querySelector("img");
    expect(photo?.getAttribute("loading")).toBe("lazy");
    expect(photo?.getAttribute("alt")).toBe("The room of Casa 1");
    expect(screen.getByText("2 restaurants")).toBeTruthy();
  });

  it("links the header to the owners page and to the demo", async () => {
    server(() => ({ items: [], total: 0 }));
    renderPage();
    expect(screen.getByRole("link", { name: "For restaurant owners" }).getAttribute("href")).toBe("/owner/sign-in");
    expect(screen.getByRole("link", { name: "Plan an event" }).getAttribute("href")).toBe("/demo");
    await screen.findByText("No restaurants match. Try removing a filter.");
  });

  it("asks the server after a pause in typing, not on every key", async () => {
    const asked = server(() => ({ items: [card(1)], total: 1 }));
    renderPage();
    await screen.findByRole("heading", { name: "Casa 1" });
    const box = screen.getByLabelText("Restaurant or cuisine");
    fireEvent.change(box, { target: { value: "c" } });
    fireEvent.change(box, { target: { value: "cafe" } });
    await waitFor(() => expect(asked.at(-1)?.get("q")).toBe("cafe"));
    expect(asked.filter((p) => p.has("q")).length).toBe(1);
  });

  it("sends the chosen cuisines, prices and features", async () => {
    const asked = server(() => ({ items: [card(1)], total: 1 }));
    renderPage();
    await screen.findByRole("heading", { name: "Casa 1" });
    fireEvent.click(screen.getByRole("button", { name: "Sushi" }));
    fireEvent.click(screen.getByRole("button", { name: "Pizza" }));
    fireEvent.click(screen.getByRole("button", { name: /^€€, price level 2/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sunny tables" }));
    await waitFor(() => expect(asked.at(-1)?.getAll("cuisine")).toEqual(["sushi", "pizza"]));
    expect(asked.at(-1)?.getAll("price")).toEqual(["2"]);
    expect(asked.at(-1)?.getAll("features")).toEqual(["sun"]);
    expect(screen.getByRole("button", { name: "Sushi" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("falls back to a city when the browser refuses the location, and remembers the city", async () => {
    const asked = server(() => ({ items: [card(1, { distance_m: 850 })], total: 1 }));
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: (_ok: unknown, fail: () => void) => fail() } });
    renderPage();
    await screen.findByRole("heading", { name: "Casa 1" });
    fireEvent.click(screen.getByRole("button", { name: "Near me" }));
    expect(await screen.findByText("We could not get your location. Choose a city instead.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Choose a city"), { target: { value: "Porto" } });
    await waitFor(() => expect(asked.at(-1)?.get("lat")).toBe("41.1579"));
    expect(asked.at(-1)?.get("lng")).toBe("-8.6291");
    expect(await screen.findByText("850 m", { exact: false })).toBeTruthy();
    expect(sessionStorage.getItem("seatplan.discover.place")).toContain("Porto");
  });

  it("uses the location when the browser gives it", async () => {
    const asked = server(() => ({ items: [card(1)], total: 1 }));
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 38.71, longitude: -9.14 } }) } });
    renderPage();
    await screen.findByRole("heading", { name: "Casa 1" });
    fireEvent.click(screen.getByRole("button", { name: "Near me" }));
    await waitFor(() => expect(asked.at(-1)?.get("lat")).toBe("38.71"));
    expect(screen.getByText(/Sorted by distance/)).toBeTruthy();
  });

  it("with When? shows the next free times as links that carry the date, time and party", async () => {
    const asked = server((params) => ({ items: [card(1, { next_times: params.has("date") ? ["20:00", "20:15", "19:45"] : [] }), card(2)], total: 2 }));
    renderPage();
    await screen.findByRole("heading", { name: "Casa 1" });
    fireEvent.click(screen.getByRole("button", { name: "When?" }));
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2030-05-01" } });
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "20:00" } });
    fireEvent.change(screen.getByLabelText("People"), { target: { value: "4" } });
    await waitFor(() => expect(asked.at(-1)?.get("party")).toBe("4"));
    expect(asked.at(-1)?.get("available")).toBe("true");
    const link = await screen.findByRole("link", { name: "20:15" });
    expect(link.getAttribute("href")).toBe("/restaurants/casa-1?date=2030-05-01&time=20%3A15&party=4");
    expect(screen.getByText("No free table near 20:00.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Available at that time" }));
    await waitFor(() => expect(asked.at(-1)?.has("available")).toBe(false));
  });

  it("shows twenty at a time and adds the rest on Show more", async () => {
    const all = Array.from({ length: 25 }, (_, i) => card(i + 1));
    const asked = server((params) => {
      const offset = Number(params.get("offset") ?? 0);
      return { items: all.slice(offset, offset + 20), total: 25 };
    });
    renderPage();
    await screen.findByRole("heading", { name: "Casa 20" });
    expect(screen.queryByRole("heading", { name: "Casa 21" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    await screen.findByRole("heading", { name: "Casa 25" });
    expect(asked.at(-1)?.get("offset")).toBe("20");
    expect(screen.getAllByRole("article")).toHaveLength(25);
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("says so when nothing matches and clears the filters", async () => {
    const asked = server((params) => (params.has("cuisine") ? { items: [], total: 0 } : { items: [card(1)], total: 1 }));
    renderPage();
    await screen.findByRole("heading", { name: "Casa 1" });
    fireEvent.click(screen.getByRole("button", { name: "Sushi" }));
    expect(await screen.findByText("No restaurants match. Try removing a filter.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await screen.findByRole("heading", { name: "Casa 1" });
    expect(asked.at(-1)?.has("cuisine")).toBe(false);
  });

  it("shows an error with a working retry", async () => {
    let fail = true;
    server(() => (fail ? new Response(JSON.stringify({ error: { code: "internal", message: "Boom" } }), { status: 500 }) : { items: [card(1)], total: 1 }));
    renderPage();
    expect(await screen.findByText("Boom")).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { name: "Casa 1" });
  });
});
