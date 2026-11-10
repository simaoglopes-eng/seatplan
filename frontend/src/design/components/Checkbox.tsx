// A native checkbox with a large, clickable label (the whole row is a 44px target).
import { useId } from "react";
import type { InputHTMLAttributes } from "react";

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  hint?: string;
}

export function Checkbox({ label, hint, id, ...rest }: CheckboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="checkbox">
      <input {...rest} id={inputId} type="checkbox" className="checkbox-input" aria-describedby={hint ? `${inputId}-hint` : undefined} />
      <label htmlFor={inputId} className="checkbox-label">
        {label}
        {hint && (
          <span id={`${inputId}-hint`} className="checkbox-hint">
            {hint}
          </span>
        )}
      </label>
    </div>
  );
}
