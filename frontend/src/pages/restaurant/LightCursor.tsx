// "See how the light changes during your meal": a slider over the stay in
// 15-minute steps. A native range input, so arrows, Page Up/Down, Home and End
// work, and aria-valuetext says the time in words.
import { useId } from "react";

interface LightCursorProps {
  steps: string[];
  index: number;
  onChange: (index: number) => void;
  failed: boolean;
}

export function LightCursorControl({ steps, index, onChange, failed }: LightCursorProps) {
  const id = useId();
  const first = steps[0];
  const last = steps[steps.length - 1];
  return (
    <div className="rb-light-cursor">
      <label htmlFor={id} className="field-label">
        See how the light changes during your meal
      </label>
      <div className="st-scrubber-row">
        <span className="rb-muted tabular" aria-hidden="true">
          {first}
        </span>
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
        <span className="rb-muted tabular" aria-hidden="true">
          {last}
        </span>
      </div>
      <p className="rb-muted" aria-hidden="true">
        {first} → {last}, showing {steps[index]}
      </p>
      {failed && (
        <p className="rb-notice" role="status">
          We could not update the light just now. The picture shows an earlier time.
        </p>
      )}
    </div>
  );
}
