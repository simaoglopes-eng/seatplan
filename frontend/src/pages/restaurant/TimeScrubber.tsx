// A slider over the service in 15-minute steps (the size of one table slot).
// A native range input: arrow keys, Page Up/Down, Home and End work for free,
// and screen readers announce the time through aria-valuetext.
import { Button } from "../../design/components";
import { fromMinutes, toMinutes } from "./format";

export const STEP_MINUTES = 15;

interface Service {
  name: string;
  start_time: string;
  end_time: string;
}

interface TimeScrubberProps {
  services: Service[];
  time: string;
  onChange: (time: string) => void;
}

/** Earliest start and latest end of the day's services, in minutes. Lunch-to-dinner gap included. */
export function serviceRange(services: Service[]): { min: number; max: number } {
  if (services.length === 0) return { min: 12 * 60, max: 23 * 60 };
  const starts = services.map((s) => toMinutes(s.start_time));
  const ends = services.map((s) => toMinutes(s.end_time));
  return { min: Math.min(...starts), max: Math.max(...ends) };
}

/** Rounds a clock time down to the slot grid, e.g. 19:38 -> 19:30. */
export function roundToSlot(time: string): string {
  const minutes = toMinutes(time);
  return fromMinutes(minutes - (minutes % STEP_MINUTES));
}

export function nowTime(now: Date = new Date()): string {
  return roundToSlot(`${now.getHours()}:${now.getMinutes()}`);
}

function serviceAt(services: Service[], minutes: number): string {
  const found = services.find((s) => toMinutes(s.start_time) <= minutes && minutes < toMinutes(s.end_time));
  return found ? found.name : "Between services";
}

export function TimeScrubber({ services, time, onChange }: TimeScrubberProps) {
  const { min, max } = serviceRange(services);
  const value = Math.min(Math.max(toMinutes(time), min), max);
  const label = `${fromMinutes(value)}, ${serviceAt(services, value)}`;
  return (
    <div className="st-scrubber">
      <label htmlFor="st-time" className="field-label">
        Floor at <strong className="tabular st-scrubber-time">{fromMinutes(value)}</strong>{" "}
        <span className="rb-muted">({serviceAt(services, value)})</span>
      </label>
      <div className="st-scrubber-row">
        <span className="rb-muted tabular" aria-hidden="true">
          {fromMinutes(min)}
        </span>
        <input
          id="st-time"
          type="range"
          min={min}
          max={max}
          step={STEP_MINUTES}
          value={value}
          aria-valuetext={label}
          onChange={(e) => onChange(fromMinutes(Number(e.target.value)))}
        />
        <span className="rb-muted tabular" aria-hidden="true">
          {fromMinutes(max)}
        </span>
        <Button variant="ghost" onClick={() => onChange(nowTime())}>
          Now
        </Button>
      </div>
    </div>
  );
}
