import { describe, expect, it } from "vitest";
import { instagramHref, metersBetween, shortDate, telHref, websiteHref } from "./pageModel";

describe("contact links", () => {
  it("accepts only http and https websites", () => {
    expect(websiteHref("https://example.com")).toBe("https://example.com/");
    expect(websiteHref("example.com/menu")).toBe("https://example.com/menu");
    expect(websiteHref("javascript:alert(1)")).toBeNull();
    expect(websiteHref(null)).toBeNull();
  });

  it("builds an Instagram address only from a plain handle", () => {
    expect(instagramHref("@casa_lumen")).toBe("https://www.instagram.com/casa_lumen/");
    expect(instagramHref("a/b")).toBeNull();
    expect(instagramHref(null)).toBeNull();
  });

  it("builds a tel link from the digits", () => {
    expect(telHref("+351 210 000 000")).toBe("tel:+351210000000");
    expect(telHref("call me")).toBeNull();
  });
});

describe("distance and dates", () => {
  it("measures Lisbon to Porto at about 274 km", () => {
    const km = metersBetween({ lat: 38.7223, lng: -9.1393 }, { lat: 41.1496, lng: -8.611 }) / 1000;
    expect(km).toBeGreaterThan(270);
    expect(km).toBeLessThan(280);
  });

  it("writes a closed day short", () => {
    expect(shortDate("2026-12-24")).toBe("24 Dec");
  });
});
