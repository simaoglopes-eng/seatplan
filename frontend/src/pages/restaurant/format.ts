// Small pure helpers for dates, times and messages on the restaurant screens.
// Pure functions (no React, no fetch) so they are easy to test and explain.
import { ApiError } from "../../api/client";

/** Today's date as "YYYY-MM-DD" in the browser's time zone. */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * "2026-11-12" -> "Thursday 12 November".
 * Built from the parts, not with new Date("2026-11-12"), because that string
 * is read as UTC midnight and shows the day before in time zones west of UTC.
 */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

/** "2026-11-12" -> "Thursday". */
export function weekdayName(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1).toLocaleDateString("en-GB", { weekday: "long" });
}

/** 4 -> "4 people", 1 -> "1 person". */
export function people(count: number): string {
  return count === 1 ? "1 person" : `${count} people`;
}

/** 270 seconds -> "4:30". */
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = String(safe % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/** "19:30" -> minutes after midnight (1170). */
export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** 1170 -> "19:30". */
export function fromMinutes(total: number): string {
  const hours = String(Math.floor(total / 60)).padStart(2, "0");
  const minutes = String(total % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/** 0.234 -> "23%". */
export function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** "Table 4" or "Tables 4 + 5" for combined tables. */
export function tablesText(labels: string[]): string {
  if (labels.length === 0) return "No table yet";
  return labels.length === 1 ? `Table ${labels[0]}` : `Tables ${labels.join(" + ")}`;
}

/** A friendly sentence for any error, preferring the server's own words. */
export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (error instanceof ApiError) return error.message || fallback;
  return fallback;
}

/** True when the error means "you need to sign in", so staff screens can offer the login link. */
export function needsSignIn(error: unknown): boolean {
  return error instanceof ApiError && (error.code === "unauthorised" || error.code === "forbidden");
}
