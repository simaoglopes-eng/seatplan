import { api, setSessionToken } from "./client";

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
