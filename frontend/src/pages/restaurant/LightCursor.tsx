// "Preview light (does not change your booking)": a slider over the stay in 15-minute
// steps. A native range input, so arrows, Page Up/Down, Home and End work, and aria-valuetext
// says the time in words. The track is the booked stay itself, drawn in brass so it reads as
// "your meal", with the sunset marked on it when it falls inside the stay. Moving the thumb only
// repaints the light: the booking time, the table and the hold are not touched.
import { useId, useState } from "react";
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
  /** The light of the table in front of the diner, in words ("After dark"), for the one-line form on a phone. */
  summary?: string | null;
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

/** Wide screens open the light control; on a phone it starts as one line with an Explore button. */
function startsOpen(): boolean {
  try {
    return typeof window.matchMedia !== "function" || window.matchMedia("(min-width: 48rem)").matches;
  } catch {
    return true;
  }
}

export function LightCursorControl({ steps, index, onChange, failed, bookingTime, sunset, summary }: LightCursorProps) {
  const id = useId();
  const regionId = useId();
  const [open, setOpen] = useState(startsOpen);
  const first = steps[0];
  const last = steps[steps.length - 1];
  const sun = sunsetPercent(steps, sunset);
  return (
    <section className="rb-light-cursor" aria-label="Light during your visit">
      <div className="rb-light-head">
        <div>
          <h3 className="rb-light-title">
            <span className="rb-light-title-wide">Light during your visit</span>
            <span className="rb-light-title-narrow">Light preview{summary ? ` · ${summary}` : ""}</span>
          </h3>
          <p className="rb-muted rb-light-booking tabular">Booking stays at {bookingTime}</p>
        </div>
        <span className="rb-light-chip tabular" aria-hidden="true">
          Preview {steps[index]}
        </span>
        <button type="button" className="rb-light-explore" aria-expanded={open} aria-controls={regionId} onClick={() => setOpen(!open)}>
          {open ? "Hide" : "Explore"}
        </button>
      </div>
      <div id={regionId} className="rb-light-body" hidden={!open}>
        <label htmlFor={id} className="visually-hidden">
          Preview light (does not change your booking)
        </label>
        <div className="rb-light-track">
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
          <strong>Light preview at {steps[index]}.</strong> Booking at {bookingTime}.
          {sun !== null && sunset ? ` The sun sets at ${sunset}.` : ""}
        </p>
        {failed && (
          <p className="rb-notice" role="status">
            We could not update the light just now. The picture shows an earlier time.
          </p>
        )}
      </div>
    </section>
  );
}
