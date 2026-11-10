// Keyboard rules for the map. The whole map is ONE tab stop; inside it the
// arrow keys move a cursor from seat to seat (like a spreadsheet), so a
// keyboard user does not have to press Tab 400 times to reach row K.
import type { KeyboardEvent } from "react";
import { nearestInDirection } from "./geometry";
import type { Direction, Point } from "./geometry";

const ARROWS: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

export interface KeyboardActions {
  points: Point[];
  activeId: number | null;
  moveTo: (id: number) => void;
  pick: (id: number) => void;
  zoomBy: (factor: number) => void;
  fit: () => void;
  leave: () => void;
}

/** Returns true when the key was handled, so the caller can stop page scrolling. */
export function handleMapKey(event: KeyboardEvent, actions: KeyboardActions): boolean {
  const direction = ARROWS[event.key];
  if (direction) {
    if (actions.activeId === null) return false;
    const next = nearestInDirection(actions.points, actions.activeId, direction);
    if (next !== null) actions.moveTo(next);
    return true; // even at the edge, the arrow must not scroll the page
  }
  switch (event.key) {
    case "Enter":
    case " ":
      if (actions.activeId !== null) actions.pick(actions.activeId);
      return true;
    case "Escape":
      actions.leave();
      return true;
    case "+":
    case "=":
      actions.zoomBy(1.25);
      return true;
    case "-":
      actions.zoomBy(0.8);
      return true;
    case "0":
      actions.fit();
      return true;
    default:
      return false;
  }
}
