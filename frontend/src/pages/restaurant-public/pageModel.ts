// Small pure helpers of the public restaurant page: contact links that cannot be
// turned into something else, and the distance from where the diner searched.

/** Metres between two points on the Earth (haversine). */
export function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (deg: number): number => (deg * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Only http and https websites become links: a javascript: address typed by an owner is dropped. */
export function websiteHref(website: string | null): string | null {
  if (!website) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(website) ? website : `https://${website}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** "@casa_lumen" or "casa_lumen" becomes the profile address; anything with odd characters is dropped. */
export function instagramHref(handle: string | null): string | null {
  const name = (handle ?? "").replace(/^@/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(name) ? `https://www.instagram.com/${name}/` : null;
}

/** "+351 210 000 000" becomes "tel:+351210000000". */
export function telHref(phone: string | null): string | null {
  const digits = (phone ?? "").replace(/[^\d+]/g, "");
  return /^\+?\d{6,}$/.test(digits) ? `tel:${digits}` : null;
}

/** A date such as 2026-12-24 as "24 Dec", in English like the rest of the page. */
export function shortDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
