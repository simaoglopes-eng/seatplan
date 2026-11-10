// The bar that appears while a seat is held: which seat, how long is left,
// and the one button that finishes the job. It sticks to the bottom of a
// phone screen so the Confirm button is always under the thumb.
import { Button } from "../../design/components";
import { formatCountdown } from "./format";

interface HoldBarProps {
  seatLabel: string;
  secondsLeft: number;
  busy: boolean;
  onConfirm: () => void;
}

// Under one minute the timer gets a word as well as a colour ("hurry").
const LOW_SECONDS = 60;

export function HoldBar({ seatLabel, secondsLeft, busy, onConfirm }: HoldBarProps) {
  const low = secondsLeft <= LOW_SECONDS;
  return (
    <div className="ev-holdbar" role="region" aria-label="Seat on hold">
      <div className="ev-holdbar-text">
        <span className="ev-holdbar-label">Held for you</span>
        <strong>{seatLabel}</strong>
        <span className={`ev-timer tabular ${low ? "ev-timer-low" : ""}`.trim()}>
          {/* The visible clock is not live: reading it out every second would drown everything else. */}
          <span aria-hidden="true">{formatCountdown(secondsLeft)}</span>
          <span className="visually-hidden">{Math.ceil(secondsLeft / 60)} minutes</span> left{low ? ", hurry" : ""}
        </span>
      </div>
      <Button busy={busy} onClick={onConfirm}>
        Confirm this seat
      </Button>
    </div>
  );
}
