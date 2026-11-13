// The small toggle controls of the discovery filters. A chip is a real button that says
// "pressed" or not to a screen reader; the look (filled green) is only the second signal.
import type { ReactNode } from "react";

export function Chips({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="discover-chips">
      <span className="discover-chips-label" aria-hidden="true">
        {label}
      </span>
      {children}
    </div>
  );
}

export function Chip({ pressed, onClick, children, label }: { pressed: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button type="button" className={`discover-chip${pressed ? " is-on" : ""}`} aria-pressed={pressed} aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

export function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}
