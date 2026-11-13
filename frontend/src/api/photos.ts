import { api, API_BASE, ApiError, getSessionToken } from "./client";

export interface OwnerPhoto { id: number; public_id: string; kind: "gallery" | "view"; opening_id: number | null; content_type: string; width: number; height: number; alt_text: string; position: number; is_cover: boolean; url: string }
const path = (vid: string) => `/owner/restaurants/${encodeURIComponent(vid)}/photos`;
export function listPhotos(vid: string): Promise<OwnerPhoto[]> { return api.get(path(vid)); }
export function uploadPhoto(vid: string, data: { content_type: string; data_base64: string; kind: "gallery" | "view"; opening_key?: string; alt_text: string }): Promise<OwnerPhoto> { return api.post(path(vid), data); }
export function describePhoto(vid: string, id: number, alt_text: string): Promise<OwnerPhoto> { return api.patch(`${path(vid)}/${id}`, { alt_text }); }
export function orderPhotos(vid: string, ids: number[], cover: number | null): Promise<OwnerPhoto[]> { return api.put(`${path(vid)}/order`, { photo_ids: ids, cover_id: cover }); }
export function deletePhoto(vid: string, id: number): Promise<void> { return api.delete(`${path(vid)}/${id}`); }

export async function photoObjectUrl(url: string, signal: AbortSignal): Promise<string> {
  if (!url.startsWith(`${API_BASE}/photos/`)) throw new Error("Invalid photo link.");
  const token = getSessionToken();
  const answer = await fetch(url, { signal, cache: "no-store", headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!answer.ok) throw new ApiError(answer.status, "unknown", "Could not load the photo.");
  return URL.createObjectURL(await answer.blob());
}
