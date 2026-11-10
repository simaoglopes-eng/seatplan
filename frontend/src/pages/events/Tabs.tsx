// Accessible tabs (WAI-ARIA tabs pattern): one tab stop for the tab list,
// Left and Right arrows (and Home, End) move between tabs, and each panel is
// labelled by its tab. Only the open panel is rendered.
import { useId, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

interface TabsProps {
  label: string;
  items: TabItem[];
  current: string;
  onChange: (id: string) => void;
}

/** Which tab index a key leads to, or null when the key is not ours. */
function targetIndex(key: string, index: number, count: number): number | null {
  if (key === "ArrowRight") return (index + 1) % count;
  if (key === "ArrowLeft") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

export function Tabs({ label, items, current, onChange }: TabsProps) {
  const baseId = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const open = items.find((item) => item.id === current) ?? items[0];

  const onKeyDown = (event: KeyboardEvent, index: number): void => {
    const next = targetIndex(event.key, index, items.length);
    if (next === null) return;
    event.preventDefault();
    onChange(items[next].id);
    buttons.current[next]?.focus();
  };

  return (
    <div className="ev-tabs">
      <div role="tablist" aria-label={label} className="ev-tablist">
        {items.map((item, index) => (
          <button
            key={item.id}
            ref={(el) => {
              buttons.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${item.id}`}
            aria-selected={item.id === open.id}
            aria-controls={`${baseId}-panel`}
            tabIndex={item.id === open.id ? 0 : -1}
            className="ev-tab"
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${open.id}`} className="ev-tabpanel" tabIndex={0}>
        {open.content}
      </div>
    </div>
  );
}
