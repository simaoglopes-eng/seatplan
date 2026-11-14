// The small pure rules of the discovery page: places, labels, distances and the
// link a card sends the diner to. No React here, so they are easy to test.
import type { FeatureKey, Features, RestaurantCard, SearchWhen } from "../../api/discovery";

export interface Place {
  label: string;
  lat: number;
  lng: number;
}

/** Fixed coordinates for "Choose a city" (spec 9.1), used when the browser cannot say where the diner is. */
export const CITIES: Place[] = [
  { label: "Lisboa", lat: 38.7223, lng: -9.1393 },
  { label: "Porto", lat: 41.1579, lng: -8.6291 },
  { label: "Braga", lat: 41.5454, lng: -8.4265 },
  { label: "Coimbra", lat: 40.2033, lng: -8.4103 },
  { label: "Aveiro", lat: 40.6405, lng: -8.6538 },
  { label: "Faro", lat: 37.0194, lng: -7.9304 },
  { label: "Évora", lat: 38.5714, lng: -7.9135 },
  { label: "Setúbal", lat: 38.5244, lng: -8.8882 },
  { label: "Cascais", lat: 38.6979, lng: -9.4215 },
  { label: "Sintra", lat: 38.8029, lng: -9.3817 },
  { label: "Leiria", lat: 39.7436, lng: -8.8071 },
  { label: "Viseu", lat: 40.661, lng: -7.9097 },
  { label: "Funchal", lat: 32.6669, lng: -16.9241 },
  { label: "Ponta Delgada", lat: 37.7412, lng: -25.6756 },
];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  sun: "Sunny tables",
  view: "With a view",
  accessible: "Wheelchair accessible",
  terrace: "Terrace",
};
export const FEATURE_KEYS = Object.keys(FEATURE_LABELS) as FeatureKey[];
// Public restaurant pages share FEATURE_LABELS; keep discovery copy local to this flow.
export const DISCOVERY_FEATURE_LABELS = { ...FEATURE_LABELS, sun: "Has sunny tables", view: "Tables with a view" };

/** "petiscos" becomes "Petiscos". */
export function cuisineLabel(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** "€€" for price level 2, "" when the owner gave none. */
export function priceText(level: number | null): string {
  return level ? "€".repeat(Math.min(Math.max(level, 1), 4)) : "";
}

/** "850 m" under a kilometre, "3.2 km" up to ten, then whole kilometres. */
export function formatDistance(meters: number | null): string {
  if (meters === null) return "";
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/** The names of the features a restaurant has, for the card (text, never icons alone). */
export function featureNames(features: Features): string[] {
  return FEATURE_KEYS.filter((key) => features[key]).map((key) => FEATURE_LABELS[key]);
}

/** One line about the room for the card, from the three facts the restaurant already has: "Sunny tables · With a view · Terrace". */
export function ambienceLine(features: Features): string {
  return (["sun", "view", "terrace"] as FeatureKey[])
    .filter((key) => features[key])
    .map((key) => DISCOVERY_FEATURE_LABELS[key])
    .join(" · ");
}

/** The public page of a restaurant, with the date, time and party already chosen when we know them. */
export function restaurantHref(card: Pick<RestaurantCard, "slug">, when: SearchWhen | null, time?: string): string {
  const base = `/restaurants/${encodeURIComponent(card.slug)}`;
  if (!when) return base;
  const params = new URLSearchParams({ date: when.date, time: time ?? when.time, party: String(when.party) });
  return `${base}?${params}`;
}

/** A complete "When?" or null: the server needs date, time and party together. */
export function completeWhen(date: string, time: string, party: number | null): SearchWhen | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time) && party !== null && party >= 1 ? { date, time, party } : null;
}

const PLACE_KEY = "seatplan.discover.place";

/** The last place the diner chose, kept for this browser tab only. */
export function loadPlace(): Place | null {
  try {
    const raw = sessionStorage.getItem(PLACE_KEY);
    const found = raw ? (JSON.parse(raw) as Partial<Place>) : null;
    return found && typeof found.lat === "number" && typeof found.lng === "number" && typeof found.label === "string"
      ? { label: found.label, lat: found.lat, lng: found.lng }
      : null;
  } catch {
    return null;
  }
}

export function savePlace(place: Place | null): void {
  try {
    if (place) sessionStorage.setItem(PLACE_KEY, JSON.stringify(place));
    else sessionStorage.removeItem(PLACE_KEY);
  } catch {
    // No storage (private window): the choice just lasts until the page closes.
  }
}
