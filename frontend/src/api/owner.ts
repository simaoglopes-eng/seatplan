import { api, ApiError, setSessionToken } from "./client";

export interface OwnerCard {
  public_id: string;
  slug: string | null;
  name: string;
  status: "draft" | "published";
  cover_url: string | null;
  setup: { done: number; total: number; missing: string[] };
}

export interface OwnerRegistration { name: string; email: string; password: string; consent: true }
export interface OwnerCode { signup_id: string; code_shown?: string }

export function registerOwner(body: OwnerRegistration): Promise<OwnerCode> {
  return api.post<OwnerCode>("/owner/register", body, "none");
}

export async function verifyOwner(email: string, code: string, signup_id: string): Promise<void> {
  const result = await api.post<{ token: string }>("/owner/verify", { email, code, signup_id }, "none");
  setSessionToken(result.token);
}

export function listOwnerRestaurants(): Promise<OwnerCard[]> {
  return api.get<OwnerCard[]>("/owner/restaurants");
}

export const CUISINES = ["portuguese", "seafood", "petiscos", "italian", "pizza", "japanese", "sushi", "chinese", "indian", "nepalese", "brazilian", "mexican", "burgers", "steakhouse", "fish", "mediterranean", "french", "thai", "korean", "african", "vegetarian", "vegan", "brunch", "fusion"] as const;
export interface OwnerProfile {
  public_id: string; slug: string | null; status: "draft" | "published"; name: string;
  description: string; cuisines: string[]; price_level: number | null;
  phone: string | null; website: string | null; instagram: string | null; google_maps_url: string | null;
  address: string; lat: number | null; lng: number | null; timezone: string;
}
export type ProfileChanges = Partial<Omit<OwnerProfile, "public_id" | "status">>;
export function createRestaurant(name: string): Promise<{ public_id: string; slug: string }> { return api.post("/owner/restaurants", { name }); }
export function getOwnerProfile(vid: string): Promise<OwnerProfile> { return api.get(`/owner/restaurants/${vid}`); }
export function saveOwnerProfile(vid: string, body: ProfileChanges): Promise<OwnerProfile> { return api.patch(`/owner/restaurants/${vid}/profile`, body); }

/** One thing that stops publishing (or, for a tip, a recommendation), with the page that fixes it. */
export interface PublishProblem { code: string; message: string; fix_url: string }
export interface PublishCheck { name: string; slug: string | null; status: "draft" | "published"; ready: boolean; problems: PublishProblem[]; tips: PublishProblem[] }
export function getPublishCheck(vid: string): Promise<PublishCheck> { return api.get(`/owner/restaurants/${vid}/publish-check`); }
export function publishRestaurant(vid: string): Promise<{ status: "published"; url: string }> { return api.post(`/owner/restaurants/${vid}/publish`); }
export function unpublishRestaurant(vid: string): Promise<{ status: "draft" }> { return api.post(`/owner/restaurants/${vid}/unpublish`); }
/** The problems in a 422 from publish, or [] for any other error. */
export function publishProblems(error: unknown): PublishProblem[] {
  const found = error instanceof ApiError ? error.details?.problems : undefined;
  return Array.isArray(found) ? (found as PublishProblem[]) : [];
}
