import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RestaurantCard } from "../../api/discovery";
import DiscoverPage from "./DiscoverPage";

// Leaflet needs a real browser layout; the map has its own browser test.
vi.mock("../../maps/ResultsMap", () => ({
  default: ({ pins, onFallback }: { pins: unknown[]; onFallback?: (on: boolean) => void }) => (
    <div data-testid="map">
      {pins.length} pins
      <button type="button" onClick={() => onFallback?.(true)}>
        simulate failed tiles
      </button>
    </div>
  ),
}));

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
    features: { sun: true, view: false, accessible: true, terrace: true },
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

/** A wide screen has the where-and-when capsule and the quick filters in the bar; a phone keeps them in the drawer. */
function screenIs(kind: "wide" | "phone"): void {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: kind === "wide", media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
}

function renderPage(): void {
  render(
    <MemoryRouter>
      <DiscoverPage />
    </MemoryRouter>,
  );
}

async function openDrawer(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
  return screen.findByRole("dialog", { name: "Filters" });
}

beforeEach(() => {
  sessionStorage.clear();
  screenIs("wide");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("DiscoverPage: the command bar", () => {
  it("shows the title, one search bar and a card per restaurant with four things on it", async () => {
    server(() => ({ items: [card(1), card(2)], total: 2 }));
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Find a table you will love" })).toBeTruthy();
    expect(screen.getByText("See the room, the light and the view before you book.")).toBeTruthy();
    const bar = screen.getByRole("search");
    expect(within(bar).getByLabelText("Restaurant or cuisine")).toBeTruthy();
    // On a wide screen the bar holds where and when, near me, the three quick filters and the drawer button.
    expect(within(bar).getByLabelText("Choose a city")).toBeTruthy();
    expect(within(bar).getByLabelText("Date")).toBeTruthy();
    expect(within(bar).getByRole("button", { name: "Near me" })).toBeTruthy();
    for (const name of ["Has sunny tables", "Tables with a view", "Terrace"]) expect(within(bar).getByRole("button", { name })).toBeTruthy();
    const first = (await screen.findByRole("heading", { name: "Casa 1" })).closest("article") as HTMLElement;
    expect(within(first).getByText("Portuguese, Seafood", { exact: false })).toBeTruthy();
    // One line about the room, from the three facts the restaurant has. Wheelchair access is a filter, not card clutter.
    expect(within(first).getByText("Has sunny tables · Terrace")).toBeTruthy();
    expect(within(first).queryByText("Wheelchair accessible")).toBeNull();
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
    await screen.findByText("No restaurants match");
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

  it("filters at once with the quick chips in the bar", async () => {
    const asked = server(() => ({ items: [card(1)], total: 1 }));
    renderPage();
    await screen.findByRole("heading", { name: "Casa 1" });
    fireEvent.click(screen.getByRole("button", { name: "Has sunny tables" }));
    fireEvent.click(screen.getByRole("button", { name: "Terrace" }));
    await waitFor(() => expect(asked.at(-1)?.getAll("features")).toEqual(["sun", "terrace"]));
    expect(screen.getByRole("button", { name: "Terrace" }).getAttribute("aria-pressed")).toBe("true");
    // The drawer button counts only what is inside the drawer, so quick chips do not inflate it.
    expect(screen.getByRole("button", { name: "Filters" })).toBeTruthy();
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

  it("uses the location when the browser gives it, and names it in the city list", async () => {
    const asked = server(() => ({ items: [card(1)], total: 1 }));
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 38.71, longitude: -9.14 } }) } });
    renderPage();
    await screen.findByRole("heading", { name: "Casa 1" });
    fireEvent.click(screen.getByRole("button", { name: "Near me" }));
    await waitFor(() => expect(asked.at(-1)?.get("lat")).toBe("38.71"));
    expect(screen.getByText(/Sorted by distance/)).toBeTruthy();
    expect((screen.getByLabelText("Choose a city") as HTMLSelectElement).value).toBe("__near");
  });
});

describe("DiscoverPage: when", () => {
  it("picking a date asks for free times at dinner, and the cards offer links that carry date, time and party", async () => {
    const asked = server((params) => ({ items: [card(1, { next_times: params.has("date") ? ["20:00", "20:15", "19:45"] : [] }), card(2)], total: 2 }));
    renderPage();
    await screen.findByRole("heading", { name: "Casa 1" });
    expect(asked.at(-1)?.has("date")).toBe(false);
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2030-05-01" } });
    // The time is filled in at 20:00 for the diner, who can change it.
    expect((screen.getByLabelText("Time") as HTMLInputElement).value).toBe("20:00");
    fireEvent.change(screen.getByLabelText("People"), { target: { value: "4" } });
    await waitFor(() => expect(asked.at(-1)?.get("party")).toBe("4"));
    expect(asked.at(-1)?.get("available")).toBe("true");
    const link = await screen.findByRole("link", { name: "20:15" });
    expect(link.getAttribute("href")).toBe("/restaurants/casa-1?date=2030-05-01&time=20%3A15&party=4");
    expect(screen.getByText("No free table near 20:00.")).toBeTruthy();
    // "Available at that time" lives in the drawer and can be switched off.
    const drawer = await openDrawer();
    fireEvent.click(within(drawer).getByRole("button", { name: "Available at that time" }));
    await waitFor(() => expect(asked.at(-1)?.has("available")).toBe(false));
  });

  it("clears the date and time with the cross", async () => {
    const asked = server(() => ({ items: [card(1)], total: 1 }));
    renderPage();
    await screen.findByRole("heading", { name: "Casa 1" });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2030-05-01" } });
    await waitFor(() => expect(asked.at(-1)?.has("date")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Clear the date" }));
    await waitFor(() => expect(asked.at(-1)?.has("date")).toBe(false));
  });
});

describe("DiscoverPage: the filters drawer", () => {
  it("sends the chosen cuisines, prices and wheelchair access", async () => {
    const asked = server(() => ({ items: [card(1)], total: 1 }));
    renderPage();
    await screen.findByRole("heading", { name: "Casa 1" });
    const drawer = await openDrawer();
    fireEvent.click(within(drawer).getByRole("button", { name: "Sushi" }));
    fireEvent.click(within(drawer).getByRole("button", { name: "Pizza" }));
    fireEvent.click(within(drawer).getByRole("button", { name: /^€€, price level 2/ }));
    fireEvent.click(within(drawer).getByRole("button", { name: "Wheelchair accessible" }));
    await waitFor(() => expect(asked.at(-1)?.getAll("cuisine")).toEqual(["sushi", "pizza"]));
    expect(asked.at(-1)?.getAll("price")).toEqual(["2"]);
    expect(asked.at(-1)?.getAll("features")).toEqual(["accessible"]);
    expect(within(drawer).getByRole("button", { name: "Sushi" }).getAttribute("aria-pressed")).toBe("true");
    // The button on the bar counts what is inside the drawer: two cuisines, one price, wheelchair.
    fireEvent.click(within(drawer).getByRole("button", { name: /^Show 1 restaurant/ }));
    expect(screen.getByRole("button", { name: "Filters (4)" })).toBeTruthy();
  });

  it("shows the common cuisines first, the rest on More cuisines, and keeps a chosen one visible", async () => {
    server(() => ({ items: [card(1)], total: 1 }));
    renderPage();
    await screen.findByRole("heading", { name: "Casa 1" });
    const drawer = await openDrawer();
    expect(within(drawer).queryByRole("button", { name: "Korean" })).toBeNull();
    const more = within(drawer).getByRole("button", { name: "More cuisines" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(more);
    fireEvent.click(within(drawer).getByRole("button", { name: "Korean" }));
    fireEvent.click(within(drawer).getByRole("button", { name: "Fewer cuisines" }));
    expect(within(drawer).getByRole("button", { name: "Korean" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(drawer).queryByRole("button", { name: "Thai" })).toBeNull();
  });

  it("closes with Escape and gives focus back to the Filters button", async () => {
    server(() => ({ items: [card(1)], total: 1 }));
    renderPage();
    await screen.findByRole("heading", { name: "Casa 1" });
    const button = screen.getByRole("button", { name: "Filters" });
    button.focus();
    await openDrawer();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(button);
  });

  it("says so when nothing matches and clears the filters", async () => {
    const asked = server((params) => (params.has("cuisine") ? { items: [], total: 0 } : { items: [card(1)], total: 1 }));
    renderPage();
    await screen.findByRole("heading", { name: "Casa 1" });
    const drawer = await openDrawer();
    fireEvent.click(within(drawer).getByRole("button", { name: "Sushi" }));
    fireEvent.click(within(drawer).getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(asked.at(-1)?.has("cuisine")).toBe(false));
    fireEvent.click(within(drawer).getByRole("button", { name: /^Show / }));
    await screen.findByRole("heading", { name: "Casa 1" });
  });
});

describe("DiscoverPage: on a phone", () => {
  beforeEach(() => screenIs("phone"));

  it("keeps only the search and the Filters button in the bar, with a summary of where and when under it", async () => {
    server(() => ({ items: [card(1)], total: 1 }));
    renderPage();
    await screen.findByRole("heading", { name: "Casa 1" });
    const bar = screen.getByRole("search");
    expect(within(bar).queryByLabelText("Choose a city")).toBeNull();
    expect(within(bar).queryByRole("button", { name: "Near me" })).toBeNull();
    expect(screen.getByRole("button", { name: /When and where.*Anywhere · Any date · 2 people/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Map" })).toBeTruthy();
  });

  it("puts where and when, and the quick filters, in the drawer, and counts them on the button", async () => {
    const asked = server(() => ({ items: [card(1)], total: 1 }));
    renderPage();
    await screen.findByRole("heading", { name: "Casa 1" });
    fireEvent.click(screen.getByRole("button", {name:/When and where/}));
    const context = screen.getByRole("dialog", {name:"When and where"});
    fireEvent.change(within(context).getByLabelText("Choose a city"), { target: { value: "Porto" } });
    fireEvent.change(within(context).getByLabelText("Date"), { target: { value: "2030-05-01" } });
    fireEvent.click(within(context).getByRole("button", {name:"Show restaurants"}));
    const drawer = await openDrawer();
    fireEvent.click(within(drawer).getByRole("button", { name: "Tables with a view" }));
    await waitFor(() => expect(asked.at(-1)?.getAll("features")).toEqual(["view"]));
    expect(asked.at(-1)?.get("lat")).toBe("41.1579");
    expect(asked.at(-1)?.get("time")).toBe("20:00");
    fireEvent.click(within(drawer).getByRole("button", { name: /^Show / }));
    expect(screen.getByRole("button", { name: "Filters (1)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /When and where.*Porto · 1 May, 20:00 · 2 people/ })).toBeTruthy();
  });
});

describe("DiscoverPage: when the map tiles fail", () => {
  it("numbers the cards like the pins of the diagram that replaces the map, and only then", async () => {
    server(() => ({ items: [card(1), card(2, { lat: null, lng: null })], total: 2 }));
    renderPage();
    const first = (await screen.findByRole("heading", { name: "Casa 1" })).closest("article") as HTMLElement;
    expect(first.querySelector(".discover-card-number")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "simulate failed tiles" }));
    await waitFor(() => expect(first.querySelector(".discover-card-number")?.textContent).toBe("1"));
    // A restaurant with no pin has no number: there is nothing on the diagram to match.
    const second = screen.getByRole("heading", { name: "Casa 2" }).closest("article") as HTMLElement;
    expect(second.querySelector(".discover-card-number")).toBeNull();
  });
});

describe("DiscoverPage: results", () => {
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

  it("offers Clear filters next to the count while something is filtered", async () => {
    const asked = server(() => ({ items: [card(1)], total: 1 }));
    renderPage();
    await screen.findByRole("heading", { name: "Casa 1" });
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tables with a view" }));
    const clear = await screen.findByRole("button", { name: "Clear filters" });
    fireEvent.click(clear);
    await waitFor(() => expect(asked.at(-1)?.has("features")).toBe(false));
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

it("never presents old availability as a new party, and ignores an older response", async () => {
  const pending = new Map<string, (response: Response) => void>();
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
    const params = new URL(String(input), "http://localhost").searchParams;
    if (!params.has("date")) return Promise.resolve(new Response(JSON.stringify({items:[card(1)],total:1})));
    return new Promise<Response>(resolve => pending.set(params.get("party")!, resolve));
  }));
  renderPage();
  await screen.findByRole("heading", {name:"Casa 1"});
  fireEvent.change(screen.getByLabelText("Date"), {target:{value:"2030-05-01"}});
  await waitFor(() => expect(pending.has("2")).toBe(true));
  pending.get("2")!(new Response(JSON.stringify({items:[card(1,{next_times:["19:45"]})],total:1})));
  await screen.findByRole("link", {name:"19:45"});
  fireEvent.change(screen.getByLabelText("People"), {target:{value:"4"}});
  await waitFor(() => expect(pending.has("4")).toBe(true));
  expect(screen.queryByRole("link", {name:"19:45"})).toBeNull();
  expect(screen.getByText("Updating availability…")).toBeTruthy();
  expect(screen.getByRole("button", {name:"19:45"}).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("link", {name:"Casa 1"}).getAttribute("href")).toContain("party=4");
  fireEvent.change(screen.getByLabelText("People"), {target:{value:"6"}});
  await waitFor(() => expect(pending.has("6")).toBe(true));
  pending.get("6")!(new Response(JSON.stringify({items:[card(1,{next_times:["20:15"]})],total:1})));
  const latest = await screen.findByRole("link", {name:"20:15"});
  expect(latest.getAttribute("href")).toContain("party=6");
  pending.get("4")!(new Response(JSON.stringify({items:[card(2,{next_times:["20:00"]})],total:1})));
  await waitFor(() => expect(screen.queryByRole("heading", {name:"Casa 2"})).toBeNull());
  expect(screen.getByRole("link", {name:"20:15"}).getAttribute("href")).toContain("time=20%3A15&party=6");
});

it("keeps restaurant search criteria when the diner returns from a restaurant", async () => {
  server(() => ({items:[card(1)],total:1}));
  const first = render(<MemoryRouter><DiscoverPage /></MemoryRouter>);
  await screen.findByRole("heading", {name:"Casa 1"});
  fireEvent.change(screen.getByLabelText("Restaurant or cuisine"), {target:{value:"patio"}});
  fireEvent.change(screen.getByLabelText("Date"), {target:{value:"2030-05-01"}});
  fireEvent.change(screen.getByLabelText("People"), {target:{value:"4"}});
  fireEvent.click(screen.getByRole("button", {name:"Terrace"}));
  await waitFor(() => expect(screen.getByLabelText("Restaurant or cuisine")).toBeTruthy());
  first.unmount();
  renderPage();
  expect((screen.getByLabelText("Restaurant or cuisine") as HTMLInputElement).value).toBe("patio");
  expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("2030-05-01");
  expect((screen.getByLabelText("People") as HTMLSelectElement).value).toBe("4");
  expect(screen.getByRole("button", {name:"Terrace"}).getAttribute("aria-pressed")).toBe("true");
  await screen.findByRole("heading", {name:"Casa 1"});
});

it("removes one advanced filter without losing another or the booking context", async () => {
  const asked = server(() => ({items:[card(1)],total:1}));
  renderPage();
  await screen.findByRole("heading", {name:"Casa 1"});
  fireEvent.change(screen.getByLabelText("Date"), {target:{value:"2030-05-01"}});
  const drawer = await openDrawer();
  fireEvent.click(within(drawer).getByRole("button", {name:/price level 2 of 4/}));
  fireEvent.click(within(drawer).getByRole("button", {name:"Wheelchair accessible"}));
  await within(drawer).findByRole("button", {name:"Show 1 restaurant"});
  fireEvent.keyDown(document, {key:"Escape"});
  fireEvent.click(screen.getByRole("button", {name:"Remove price level 2"}));
  await waitFor(() => expect(asked.at(-1)?.has("price")).toBe(false));
  expect(asked.at(-1)?.getAll("features")).toEqual(["accessible"]);
  expect(asked.at(-1)?.get("date")).toBe("2030-05-01");
  expect(screen.getByRole("button", {name:"Remove Wheelchair accessible"})).toBeTruthy();
});

it("uses a neutral photo fallback after an image error", async () => {
  server(() => ({items:[card(1)],total:1}));
  renderPage();
  const article = (await screen.findByRole("heading", {name:"Casa 1"})).closest("article")!;
  fireEvent.error(article.querySelector("img")!);
  expect(within(article).getByText("Photo unavailable")).toBeTruthy();
  expect(within(article).getByRole("link", {name:"Casa 1"}).getAttribute("href")).toBe("/restaurants/casa-1");
});
