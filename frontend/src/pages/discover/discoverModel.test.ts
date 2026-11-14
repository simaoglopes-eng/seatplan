import { afterEach, describe, expect, it } from "vitest";
import { searchQueryString } from "../../api/discovery";
import type { SearchQuery } from "../../api/discovery";
import { ambienceLine, CITIES, completeWhen, cuisineLabel, featureNames, formatDistance, loadPlace, priceText, restaurantHref, savePlace } from "./discoverModel";

const EMPTY: SearchQuery = { q: "", cuisines: [], prices: [], features: [], place: null, when: null, availableOnly: false, limit: 20, offset: 0 };

afterEach(() => sessionStorage.clear());

describe("searchQueryString", () => {
  it("sends only the limit when nothing is chosen", () => {
    expect(searchQueryString(EMPTY)).toBe("limit=20");
  });

  it("repeats cuisines, prices and features, and sends the place and the time together", () => {
    const query: SearchQuery = {
      ...EMPTY,
      q: " café ",
      cuisines: ["sushi", "pizza"],
      prices: [1, 3],
      features: ["sun", "view"],
      place: { lat: 38.7, lng: -9.1 },
      when: { date: "2026-12-01", time: "20:00", party: 2 },
      availableOnly: true,
      offset: 20,
    };
    const params = new URLSearchParams(searchQueryString(query));
    expect(params.get("q")).toBe("café");
    expect(params.getAll("cuisine")).toEqual(["sushi", "pizza"]);
    expect(params.getAll("price")).toEqual(["1", "3"]);
    expect(params.getAll("features")).toEqual(["sun", "view"]);
    expect([params.get("lat"), params.get("lng")]).toEqual(["38.7", "-9.1"]);
    expect([params.get("date"), params.get("time"), params.get("party"), params.get("available")]).toEqual(["2026-12-01", "20:00", "2", "true"]);
    expect(params.get("offset")).toBe("20");
  });

  it("ignores available without a time, because the server would refuse a half answer", () => {
    expect(new URLSearchParams(searchQueryString({ ...EMPTY, availableOnly: true })).has("available")).toBe(false);
  });
});

describe("labels", () => {
  it("shows distances the way a diner reads them", () => {
    expect(formatDistance(null)).toBe("");
    expect(formatDistance(850)).toBe("850 m");
    expect(formatDistance(3)).toBe("10 m");
    expect(formatDistance(3240)).toBe("3.2 km");
    expect(formatDistance(274_000)).toBe("274 km");
  });

  it("names features in words and price in euro signs", () => {
    expect(featureNames({ sun: true, view: false, accessible: true, terrace: false })).toEqual(["Sunny tables", "Wheelchair accessible"]);
    expect(priceText(3)).toBe("€€€");
    expect(priceText(null)).toBe("");
    expect(cuisineLabel("petiscos")).toBe("Petiscos");
  });

  it("writes one line about the room from the three facts a restaurant has, and nothing when it has none", () => {
    expect(ambienceLine({ sun: true, view: true, accessible: true, terrace: true })).toBe("Has sunny tables · Tables with a view · Terrace");
    expect(ambienceLine({ sun: false, view: false, accessible: true, terrace: true })).toBe("Terrace");
    expect(ambienceLine({ sun: false, view: false, accessible: true, terrace: false })).toBe("");
  });

  it("lists the fourteen cities of the spec with Lisboa first", () => {
    expect(CITIES).toHaveLength(14);
    expect(CITIES[0].label).toBe("Lisboa");
  });
});

describe("links and when", () => {
  it("carries the chosen date, time and party to the restaurant page, or a chosen seating's time", () => {
    const when = { date: "2026-12-01", time: "20:00", party: 4 };
    expect(restaurantHref({ slug: "casa-a" }, null)).toBe("/restaurants/casa-a");
    expect(restaurantHref({ slug: "casa-a" }, when)).toBe("/restaurants/casa-a?date=2026-12-01&time=20%3A00&party=4");
    expect(restaurantHref({ slug: "casa-a" }, when, "20:30")).toContain("time=20%3A30");
  });

  it("needs all three parts", () => {
    expect(completeWhen("2026-12-01", "20:00", 2)).toEqual({ date: "2026-12-01", time: "20:00", party: 2 });
    expect(completeWhen("", "20:00", 2)).toBeNull();
    expect(completeWhen("2026-12-01", "", 2)).toBeNull();
    expect(completeWhen("2026-12-01", "20:00", null)).toBeNull();
  });
});

describe("the remembered place", () => {
  it("round-trips and survives a damaged value", () => {
    savePlace({ label: "Porto", lat: 41.1, lng: -8.6 });
    expect(loadPlace()).toEqual({ label: "Porto", lat: 41.1, lng: -8.6 });
    sessionStorage.setItem("seatplan.discover.place", "{nope");
    expect(loadPlace()).toBeNull();
    savePlace(null);
    expect(loadPlace()).toBeNull();
  });
});
