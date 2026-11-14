// The visible 5-minute countdown while a table is held.
//
// The clock ticks every second for sighted people, but a screen reader
// would go mad hearing every second, so the live region only speaks at
// "1 minute left" and "time is up".
import { useEffect, useState } from "react";
import { formatCountdown } from "./format";

/** Seconds left until `expiresAt` (ISO date-time), updated every second. Null when nothing is held. */
export function useSecondsLeft(expiresAt: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  if (!expiresAt) return null;
  return Math.max(0, Math.round((Date.parse(expiresAt) - now) / 1000));
}

function spokenMessage(seconds: number): string {
  if (seconds === 0) return "Your hold has ended. The table may be taken by someone else.";
  if (seconds <= 60) return "One minute left to finish your booking.";
  return "";
}

interface HoldCountdownProps {
  tableLabel: string;
  secondsLeft: number;
  /** "chip" is the small "Held for 4:38" beside a heading; "banner" is the full sentence. */
  variant?: "banner" | "chip";
}

export function HoldCountdown({ tableLabel, secondsLeft, variant = "banner" }: HoldCountdownProps) {
  const urgent = secondsLeft <= 60;
  if (variant === "chip") {
    return (
      <div className={`rb-hold-chip${urgent ? " rb-hold-chip-urgent" : ""}`}>
        <svg className="rb-hold-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 2.5M9.5 3h5" />
        </svg>
        {secondsLeft > 0 ? (
          <span>
            Held for{" "}
            <strong className="tabular" role="timer" aria-label={`${formatCountdown(secondsLeft)} minutes`}>
              {formatCountdown(secondsLeft)}
            </strong>
            <span className="visually-hidden"> (table {tableLabel})</span>
            {urgent && <span className="rb-hold-flag"> (almost up)</span>}
          </span>
        ) : (
          <span>Hold ended</span>
        )}
        <span className="visually-hidden" role="status" aria-live="polite">
          {spokenMessage(secondsLeft)}
        </span>
      </div>
    );
  }
  return (
    <div className={`rb-hold ${urgent ? "rb-hold-urgent" : ""}`.trim()}>
      <svg className="rb-hold-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2.5M9.5 3h5" />
      </svg>
      <p className="rb-hold-text">
        {secondsLeft > 0 ? (
          <>
            Table {tableLabel} is held for you for{" "}
            <strong className="tabular" role="timer" aria-label={`${formatCountdown(secondsLeft)} minutes`}>
              {formatCountdown(secondsLeft)}
            </strong>
            {urgent && <span className="rb-hold-flag"> (almost up)</span>}
          </>
        ) : (
          <>Your hold on table {tableLabel} has ended. Pick a table again to continue.</>
        )}
      </p>
      <span className="visually-hidden" role="status" aria-live="polite">
        {spokenMessage(secondsLeft)}
      </span>
    </div>
  );
}
