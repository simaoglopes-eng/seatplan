// Seconds left until a moment in time, redrawn once a second.
// The server decides when a hold really ends; this only shows it.
import { useEffect, useState } from "react";

export function secondsUntil(iso: string | null, now: number): number {
  if (iso === null) return 0;
  return Math.max(0, Math.round((new Date(iso).getTime() - now) / 1000));
}

export function useCountdown(expiresAt: string | null): number {
  // The counter only exists to make React draw again every second.
  const [, setTicks] = useState(0);

  useEffect(() => {
    if (expiresAt === null) return undefined;
    const timer = window.setInterval(() => setTicks((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  // Worked out on every draw from the real clock, so a brand-new hold is
  // never shown with a stale value or mistaken for an expired one.
  return secondsUntil(expiresAt, Date.now());
}
