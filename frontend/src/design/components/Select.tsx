// A native <select> with the same label, hint and error wiring as Field.
// Native on purpose: it is keyboard and screen-reader friendly for free.
import { useId } from "react";
import type { SelectHTMLAttributes } from "react";
import { FieldError } from "./Field";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[];
  hint?: string;
  error?: string | null;
}

export function Select({ label, options, hint, error, id, className = "", ...rest }: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const hintId = `${selectId}-hint`;
  const errorId = `${selectId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`field ${error ? "field-invalid" : ""} ${className}`.trim()}>
      <label className="field-label" htmlFor={selectId}>
        {label}
      </label>
      {hint && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      <div className="select-wrap">
        <select {...rest} id={selectId} className="field-input select-input" aria-invalid={error ? true : undefined} aria-describedby={describedBy}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {error && <FieldError id={errorId} message={error} />}
    </div>
  );
}
