// "Preview room light (does not change booking time)": a slider over the stay in 15-minute
// steps. A native range input, so arrows, Page Up/Down, Home and End work, and aria-valuetext
// says the time in words. The track is the booked stay itself, drawn in brass so it reads as
// "your meal", with the sunset marked on it when it falls inside the stay. Moving the thumb only
// repaints the light: the booking time, the table and the hold are not touched.
import { useId } from "react";
import { toMinutes } from "./format";

interface LightCursorProps {
  steps: string[];
  index: number;
  onChange: (index: number) => void;
  failed: boolean;
  /** The time the diner is booking, which the preview never changes. */
  bookingTime: string;
  /** Sunset at the restaurant that day ("20:47"), or null when unknown. */
  sunset: string | null;
}

/** Where the sunset falls along the stay, 0 to 100, or null when it is outside the stay. */
export function sunsetPercent(steps: string[], sunset: string | null): number | null {
  if (!sunset || steps.length < 2) return null;
  const from = toMinutes(steps[0]);
  const to = toMinutes(steps[steps.length - 1]);
  const at = toMinutes(sunset);
  if (to <= from || at < from || at > to) return null;
  return ((at - from) / (to - from)) * 100;
}

export function LightCursorControl({ steps, index, onChange, failed, bookingTime, sunset }: LightCursorProps) {
  const id = useId();
  const first = steps[0];
  const last = steps[steps.length - 1];
  const sun = sunsetPercent(steps, sunset);
  return (
    <div className="rb-light-cursor">
      <label htmlFor={id} className="field-label">
        <span>Preview room light</span> <span className="rb-muted">(does not change booking time)</span>
      </label>
      <div className="rb-light-track">
        <span className="rb-light-stay tabular" aria-hidden="true">
          Your booking {first} → {last}
        </span>
        <div className="st-scrubber-row">
          <span className="rb-muted tabular" aria-hidden="true">
            {first}
          </span>
          <div className="rb-light-range">
            <input
              id={id}
              type="range"
              min={0}
              max={steps.length - 1}
              step={1}
              value={index}
              aria-valuetext={`${steps[index]}, during your stay from ${first} to ${last}`}
              onChange={(event) => onChange(Number(event.target.value))}
            />
            {sun !== null && (
              <span className="rb-light-sunset" style={{ left: `${sun}%` }} aria-hidden="true">
                <span className="rb-light-sunset-mark" />
                <span className="rb-light-sunset-label tabular">Sunset {sunset}</span>
              </span>
            )}
          </div>
          <span className="rb-muted tabular" aria-hidden="true">
            {last}
          </span>
        </div>
      </div>
      <p className="rb-muted" aria-live="polite">
        {steps[index] === first ? `Showing the room at ${steps[index]}.` : `Previewing the room at ${steps[index]}.`} Your booking is at {bookingTime}.
        {sun !== null && sunset ? ` The sun sets at ${sunset}.` : ""}
      </p>
      {failed && (
        <p className="rb-notice" role="status">
          We could not update the light just now. The picture shows an earlier time.
        </p>
      )}
    </div>
  );
}
