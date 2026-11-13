// One tab per room, above the diner map, each with how many tables are still
// free there. The WAI-ARIA tabs pattern: arrows, Home and End move between
// tabs; the map below is the panel of whichever tab is open.
import { useRef } from "react";
import type { KeyboardEvent } from "react";
import type { RoomTab } from "./ambienceView";

interface RoomTabsProps {
  tabs: RoomTab[];
  /** The open room (null is the implicit room). */
  current: number | null;
  onChange: (id: number | null) => void;
}

function nextIndex(key: string, index: number, count: number): number | null {
  if (key === "ArrowRight") return (index + 1) % count;
  if (key === "ArrowLeft") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

export function RoomTabs({ tabs, current, onChange }: RoomTabsProps) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent, index: number): void => {
    const next = nextIndex(event.key, index, tabs.length);
    if (next === null) return;
    event.preventDefault();
    onChange(tabs[next].id);
    buttons.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label="Rooms" className="rb-room-tabs">
      {tabs.map((tab, index) => {
        const open = tab.id === current;
        return (
          <button
            key={tab.id ?? "implicit"}
            ref={(el) => {
              buttons.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={open}
            tabIndex={open ? 0 : -1}
            className="rb-room-tab"
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.name}
            <span className="rb-room-tab-count"> · {tab.free} free</span>
          </button>
        );
      })}
    </div>
  );
}
