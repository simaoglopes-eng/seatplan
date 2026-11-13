// Finding restaurants and the public restaurant page (docs/CONTRACT.md, "Discovery").
// Field names are snake_case, exactly as the Python backend sends them.
import { api } from "./client";
import type { ClockTime, IsoDate, ServerSchedule } from "./restaurant";

export type FeatureKey = "sun" | "view" | "accessible" | "terrace";
export type Features = Record<FeatureKey, boolean>;

/** One restaurant on a search card or a map pin. */
export interface RestaurantCard {
  slug: string;
  public_id: string;
  name: string;
  cuisines: string[];
  price_level: number | null;
  cover_url: string | null;
  cover_alt: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  /** Metres from the place searched from; null without a place or a pin. */
  distance_m: number | null;
  features: Features;
  /** The free seatings nearest the time asked, only when a date, time and party were asked. */
  next_times: ClockTime[];
}

export interface SearchAnswer {
  items: RestaurantCard[];
  total: number;
}

export interface SearchWhen {
  date: IsoDate;
  time: ClockTime;
  party: number;
}

export interface SearchQuery {
  q: string;
  cuisines: string[];
  prices: number[];
  features: FeatureKey[];
  place: { lat: number; lng: number } | null;
  when: SearchWhen | null;
  /** Only restaurants with a free table near the time asked; ignored without `when`. */
  availableOnly: boolean;
  limit: number;
  offset: number;
}

/** The query string of GET /restaurants. Empty things are left out. */
export function searchQueryString(query: SearchQuery): string {
  const params = new URLSearchParams();
  const text = query.q.trim();
  if (text) params.set("q", text);
  query.cuisines.forEach((c) => params.append("cuisine", c));
  query.prices.forEach((p) => params.append("price", String(p)));
  query.features.forEach((f) => params.append("features", f));
  if (query.place) {
    params.set("lat", String(query.place.lat));
    params.set("lng", String(query.place.lng));
  }
  if (query.when) {
    params.set("date", query.when.date);
    params.set("time", query.when.time);
    params.set("party", String(query.when.party));
    if (query.availableOnly) params.set("available", "true");
  }
  params.set("limit", String(query.limit));
  if (query.offset > 0) params.set("offset", String(query.offset));
  return params.toString();
}

export function searchRestaurants(query: SearchQuery): Promise<SearchAnswer> {
  return api.get<SearchAnswer>(`/restaurants?${searchQueryString(query)}`);
}

export interface PublicPhoto {
  url: string;
  alt: string;
  is_cover: boolean;
}

/** GET /restaurants/{slug}: everything the public page shows. */
export interface PublicRestaurant {
  slug: string | null;
  public_id: string;
  name: string;
  /** True when the owner is looking at a restaurant that is not published yet. */
  preview: boolean;
  description: string;
  cuisines: string[];
  price_level: number | null;
  address: string;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  timezone: string;
  features: Features;
  rooms_summary: string[];
  photos: PublicPhoto[];
  max_party: number;
  schedule: ServerSchedule;
  book_url: string;
  maps_url: string;
}

export function getPublicRestaurant(slug: string): Promise<PublicRestaurant> {
  return api.get<PublicRestaurant>(`/restaurants/${encodeURIComponent(slug)}`);
}
