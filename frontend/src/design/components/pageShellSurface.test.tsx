// The Restaurants look is switched on by the route, never by a page: events keep their own look.
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { PageShell, isRestaurantRoute } from "./PageShell";

afterEach(() => {
  delete document.documentElement.dataset.surface;
});

describe("isRestaurantRoute", () => {
  it.each(["/", "/restaurants/tagus-terrace", "/r/abc", "/b/token", "/owner", "/owner/sign-in", "/owner/abc/rooms", "/staff/abc"])("%s is a Restaurants route", (path) => {
    expect(isRestaurantRoute(path)).toBe(true);
  });
  it.each(["/demo", "/login", "/e/token", "/j/token", "/j/token/register", "/my", "/my/account", "/organiser/abc", "/editor/abc", "/restaurantsx", "/ownership"])("%s is not", (path) => {
    expect(isRestaurantRoute(path)).toBe(false);
  });
});

describe("isRestaurantRoute and the sign-in", () => {
  it("treats the sign-in of an owner or staff journey as Restaurants, and every other sign-in as Events", () => {
    expect(isRestaurantRoute("/login", "?next=%2Fowner")).toBe(true);
    expect(isRestaurantRoute("/login", "?next=%2Fowner%2Fabc%2Frooms")).toBe(true);
    expect(isRestaurantRoute("/login", "?next=%2Fstaff%2Fabc")).toBe(true);
    expect(isRestaurantRoute("/login", "?next=%2Fmy")).toBe(false);
    expect(isRestaurantRoute("/login", "?next=%2Fowners-club")).toBe(false);
    expect(isRestaurantRoute("/login", "")).toBe(false);
  });
});

describe("PageShell surface", () => {
  it("sets data-surface on the page only on Restaurants routes, and removes it on the way out", () => {
    const restaurants = render(
      <MemoryRouter initialEntries={["/restaurants/tagus-terrace"]}>
        <PageShell title="Tagus Terrace">x</PageShell>
      </MemoryRouter>,
    );
    expect(document.documentElement.dataset.surface).toBe("restaurants");
    restaurants.unmount();
    expect(document.documentElement.dataset.surface).toBeUndefined();

    render(
      <MemoryRouter initialEntries={["/e/some-token"]}>
        <PageShell title="Your invitation">x</PageShell>
      </MemoryRouter>,
    );
    expect(document.documentElement.dataset.surface).toBeUndefined();
  });
});
