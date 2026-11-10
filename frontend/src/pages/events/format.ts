// Small pure helpers that turn data into words for the events screens.
// Pure functions (no React) so they are easy to test and to explain.
import type { MapSeat, MapTable } from "../../api/types";
import type { PrivacyMode, ScoreBreakdown } from "../../api/events";
import { tableName } from "../../seatmap/describe";

/**
 * "Saturday 14 March 2026, 19:30". Uses the browser's own language and time
 * zone, but always a 24-hour clock: "12:00 AM" leaves people unsure which
 * midnight is meant.
 */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

const ONE_MINUTE_MS = 60 * 1000;

/**
 * A deadline, with its time zone. A deadline at exactly midnight is written
 * as 23:59 of the day before, because "until Sunday 00:00" is easily read as
 * the end of Sunday rather than its start.
 */
export function formatDeadline(iso: string): string {
  const date = new Date(iso);
  const atMidnight = date.getHours() === 0 && date.getMinutes() === 0;
  const shown = atMidnight ? new Date(date.getTime() - ONE_MINUTE_MS) : date;
  return shown.toLocaleString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  });
}

/** 299 -> "4:59". Never negative, so an expired hold shows "0:00". */
export function formatCountdown(secondsLeft: number): string {
  const safe = Math.max(0, Math.floor(secondsLeft));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** True when a change deadline exists and is already behind us. */
export function deadlinePassed(deadline: string | null, now: number = Date.now()): boolean {
  return deadline !== null && new Date(deadline).getTime() <= now;
}

/** "Table 4, seat 3" for a seat id, or a neutral fallback if the seat is unknown. */
export function seatName(seatId: number, seats: MapSeat[], tables: MapTable[]): string {
  const seat = seats.find((s) => s.id === seatId);
  if (!seat) return "this seat";
  const table = tables.find((t) => t.id === seat.table_id);
  return `${tableName(table)}, seat ${seat.label}`;
}

/**
 * Same rule as backend/app/core/privacy.py display_name(). It is repeated
 * here ONLY to preview a mode before the organiser saves it; the real names
 * attendees see always come from the server.
 */
export function previewName(name: string, mode: PrivacyMode, wantsAnonymous: boolean): string {
  const parts = name.split(" ").filter((part) => part !== "");
  if (wantsAnonymous || mode === "anonymous" || parts.length === 0) return "Guest";
  if (mode === "full_name") return parts.join(" ");
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

/** Labels for the score terms, in the words an organiser uses. */
export const SCORE_TERMS: { key: keyof ScoreBreakdown; label: string }[] = [
  { key: "friend_adjacent", label: "Friends sitting next to each other" },
  { key: "friend_same_table", label: "Friends at the same table" },
  { key: "group_adjacent", label: "Groups sitting together" },
  { key: "group_same_table", label: "Groups at the same table" },
  { key: "changes", label: "Penalty for moving people" },
];

/** "+12", "-8" or "0": signed, so a change is never shown by colour alone. */
export function signed(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded > 0) return `+${rounded}`;
  return String(rounded);
}
