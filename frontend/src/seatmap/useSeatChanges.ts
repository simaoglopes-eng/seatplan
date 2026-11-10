// Notices when seats change state between two renders (usually because a
// live update arrived) and turns that into:
//   1. a sentence for screen readers ("Table 4, seat 3 was just taken."), and
//   2. a short motion cue on the seats that changed (hold, confirm, conflict).
import { useCallback, useEffect, useRef, useState } from "react";
import type { SeatState } from "../api/types";
import { STATE_TEXT } from "./describe";

export type MotionKind = "hold" | "confirm" | "conflict";

export interface TrackedTarget {
  id: number;
  state: SeatState;
  /** Human name without the state, e.g. "Table 4, seat 3". */
  name: string;
}

export interface SeatChanges {
  messages: string[];
  motion: Map<number, MotionKind>;
}

// Reading out twenty changes one by one is noise; summarise instead.
const MAX_SPOKEN_CHANGES = 3;
// Long enough for the CSS animation (--dur-slow) to finish.
const MOTION_CLEAR_MS = 900;

/** What the map knows about the person looking at it, needed to read changes correctly. */
export interface DiffContext {
  selectedId: number | null;
  /** Targets this person changed themselves (their own hold, their last pick). */
  ownIds: ReadonlySet<number>;
  /** Targets whose next change, of any kind, is this person's own action. */
  actedIds: ReadonlySet<number>;
  /** "seat" on event maps, "table" on restaurant maps. */
  noun: "seat" | "table";
}

/** Pure comparison of old and new states; exported so tests can call it directly. */
export function diffStates(previous: Map<number, SeatState>, next: TrackedTarget[], context: DiffContext): SeatChanges {
  const urgent: string[] = [];
  const ordinary: string[] = [];
  const motion = new Map<number, MotionKind>();
  for (const target of next) {
    const before = previous.get(target.id);
    if (before === undefined || before === target.state) continue;
    const myTarget = context.ownIds.has(target.id) || target.id === context.selectedId;
    if (context.actedIds.has(target.id) || isOwnResult(target, context)) {
      // The person did this themselves and the page already said so: move, but stay quiet.
      motion.set(target.id, target.state === "held" ? "hold" : "confirm");
    } else if (myTarget && (target.state === "taken" || target.state === "held")) {
      motion.set(target.id, "conflict");
      const what = target.state === "taken" ? "taken" : "put on hold";
      urgent.push(`${target.name} was just ${what} by someone else. Please choose another ${context.noun}.`);
    } else if (target.state === "mine") {
      motion.set(target.id, "confirm");
      urgent.push(`${target.name} is now your ${context.noun}.`);
    } else {
      if (target.state === "held") motion.set(target.id, "hold");
      ordinary.push(sentenceFor(target));
    }
  }
  const spoken = ordinary.length > MAX_SPOKEN_CHANGES ? [`${ordinary.length} ${context.noun}s changed on the map.`] : ordinary;
  return { messages: [...urgent, ...spoken], motion };
}

/**
 * A change the person caused: their own target becoming held or theirs, or
 * the selected target becoming theirs ("mine" can only ever mean this viewer).
 * The server shows a person's own hold as "held", the same as anyone's, so
 * without this rule their own hold would be read out as a conflict.
 */
function isOwnResult(target: TrackedTarget, context: DiffContext): boolean {
  if (target.state === "mine") return context.ownIds.has(target.id) || target.id === context.selectedId;
  return target.state === "held" && context.ownIds.has(target.id);
}

function sentenceFor(target: TrackedTarget): string {
  if (target.state === "taken") return `${target.name} was just taken.`;
  if (target.state === "free") return `${target.name} is free again.`;
  return `${target.name} is now ${STATE_TEXT[target.state]}.`;
}

export interface SeatChangeTracker {
  announcement: string;
  motion: Map<number, MotionKind>;
  /** Lets the map add its own sentences, such as "Selected Table 4, seat 3." */
  announce: (message: string) => void;
  /** Remembers what the person just picked, so its next change counts as their own. */
  notePick: (id: number) => void;
}

export interface ChangeOptions {
  selectedId: number | null;
  /** The page's own hold, when it knows it. */
  ownId: number | null;
  /** What the person's last action changed; see SeatMapProps.actedOn. */
  actedOn: readonly number[] | null;
  noun: "seat" | "table";
}

export function useSeatChanges(targets: TrackedTarget[], options: ChangeOptions): SeatChangeTracker {
  const previous = useRef<Map<number, SeatState> | null>(null);
  // The last target picked on this map. Cleared once its state has changed, so
  // a later change to it (for example someone else taking it) is news again.
  const picked = useRef<number | null>(null);
  // Targets of the person's last action, each forgotten once its change arrived.
  const acted = useRef<Set<number>>(new Set());
  const [announcement, setAnnouncement] = useState("");
  const [motion, setMotion] = useState<Map<number, MotionKind>>(new Map());

  // Declared before the diff below, so a new action is known when its result arrives.
  useEffect(() => {
    acted.current = new Set(options.actedOn ?? []);
  }, [options.actedOn]);

  useEffect(() => {
    const current = new Map(targets.map((t) => [t.id, t.state] as const));
    // The first render is the starting picture, not a change.
    if (previous.current !== null) {
      const ownIds = new Set([options.ownId, picked.current].filter((id): id is number => id !== null));
      const context = { selectedId: options.selectedId, ownIds, actedIds: acted.current, noun: options.noun };
      const changes = diffStates(previous.current, targets, context);
      if (changes.messages.length > 0) setAnnouncement(changes.messages.join(" "));
      if (changes.motion.size > 0) setMotion(changes.motion);
      if (picked.current !== null && changes.motion.has(picked.current)) picked.current = null;
      for (const id of changes.motion.keys()) acted.current.delete(id);
    }
    previous.current = current;
    // The options are read but deliberately not dependencies: selecting a seat
    // is not a state change of the map and must not trigger a diff.
  }, [targets]);

  useEffect(() => {
    if (motion.size === 0) return undefined;
    const timer = window.setTimeout(() => setMotion(new Map()), MOTION_CLEAR_MS);
    return () => window.clearTimeout(timer);
  }, [motion]);

  const announce = useCallback((message: string) => setAnnouncement(message), []);
  const notePick = useCallback((id: number) => {
    picked.current = id;
  }, []);
  return { announcement, motion, announce, notePick };
}
