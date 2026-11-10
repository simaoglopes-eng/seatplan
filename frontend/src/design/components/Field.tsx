// A labelled text input with an optional hint and error. The label, hint and
// error are wired to the input with ids, so a screen reader reads all three.
import { useId } from "react";
import type { InputHTMLAttributes } from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | null;
}

export function Field({ label, hint, error, id, className = "", ...rest }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`field ${error ? "field-invalid" : ""} ${className}`.trim()}>
      <label className="field-label" htmlFor={inputId}>
        {label}
      </label>
      {hint && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      <input {...rest} id={inputId} className="field-input" aria-invalid={error ? true : undefined} aria-describedby={describedBy} />
      {error && <FieldError id={errorId} message={error} />}
    </div>
  );
}

/** Error text with an icon, so the problem is not shown by red colour alone. */
export function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p id={id} className="field-error">
      <svg viewBox="0 0 16 16" aria-hidden="true" className="field-error-icon">
        <circle cx="8" cy="8" r="7" />
        <path d="M8 4.5v4.2M8 11.2v.3" />
      </svg>
      {message}
    </p>
  );
}
