// Undo and redo for any immutable value. Because layoutModel.ts never edits
// a layout in place, "history" is just a list of earlier layouts.
import { useCallback, useState } from "react";

// Enough for a long editing session, small enough to never matter for memory.
const MAX_STEPS = 100;

interface Timeline<T> {
  past: T[];
  present: T;
  future: T[];
}

export interface History<T> {
  present: T;
  /** A new step that can be undone. */
  commit: (next: T) => void;
  /** Change the present WITHOUT a new undo step (used while dragging). */
  replace: (next: T) => void;
  /** Saves the present as an undo step before a drag starts. */
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  /** Start over with a value and an empty history (after loading or saving). */
  reset: (value: T) => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useHistory<T>(initial: T): History<T> {
  const [timeline, setTimeline] = useState<Timeline<T>>({ past: [], present: initial, future: [] });

  const commit = useCallback((next: T) => {
    setTimeline((t) => ({ past: [...t.past, t.present].slice(-MAX_STEPS), present: next, future: [] }));
  }, []);

  const replace = useCallback((next: T) => {
    setTimeline((t) => ({ ...t, present: next }));
  }, []);

  const checkpoint = useCallback(() => {
    setTimeline((t) => ({ past: [...t.past, t.present].slice(-MAX_STEPS), present: t.present, future: [] }));
  }, []);

  const undo = useCallback(() => {
    setTimeline((t) => {
      if (t.past.length === 0) return t;
      return { past: t.past.slice(0, -1), present: t.past[t.past.length - 1], future: [t.present, ...t.future] };
    });
  }, []);

  const redo = useCallback(() => {
    setTimeline((t) => {
      if (t.future.length === 0) return t;
      return { past: [...t.past, t.present], present: t.future[0], future: t.future.slice(1) };
    });
  }, []);

  const reset = useCallback((value: T) => setTimeline({ past: [], present: value, future: [] }), []);

  return {
    present: timeline.present,
    commit,
    replace,
    checkpoint,
    undo,
    redo,
    reset,
    canUndo: timeline.past.length > 0,
    canRedo: timeline.future.length > 0,
  };
}
