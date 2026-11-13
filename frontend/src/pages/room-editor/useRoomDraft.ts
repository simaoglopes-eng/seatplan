// The owner's room layout in the editor: what the server has, what is being
// edited, saving, and a copy of unsaved work on this device (spec 6.10).
//
// Saving replaces the whole layout and carries the version it was opened at.
// If another tab or device saved first the server answers 409 and changes
// nothing; the owner's work stays on screen and on this device, and they choose:
// load the latest, or save theirs over it.
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { blockedTables, getRooms, layoutOf, putRooms } from "../../api/rooms";
import type { RoomsAnswer } from "../../api/rooms";
import { useHistory } from "../editor/useHistory";
import type { RoomLayout } from "./roomModel";

const AUTOSAVE_MS = 400;
const keyFor = (venueId: string): string => `seatplan.room-draft.${venueId}`;

interface StoredDraft {
  base_version: number;
  saved_at: string;
  layout: RoomLayout;
}

// Private windows and blocked storage can throw: the editor then simply works without a local copy.
function readDraft(venueId: string): StoredDraft | null {
  try {
    const text = window.localStorage.getItem(keyFor(venueId));
    return text ? (JSON.parse(text) as StoredDraft) : null;
  } catch {
    return null;
  }
}
function writeDraft(venueId: string, draft: StoredDraft): void {
  try {
    window.localStorage.setItem(keyFor(venueId), JSON.stringify(draft));
  } catch {
    /* No local copy; the page still works. */
  }
}
function clearDraft(venueId: string): void {
  try {
    window.localStorage.removeItem(keyFor(venueId));
  } catch {
    /* Nothing to clear. */
  }
}

/** The words for tables that cannot be deleted because they have bookings. */
function blockedMessage(tables: { label: string }[]): string {
  const many = tables.length > 1;
  const names = tables.map((t) => `Table ${t.label}`).join(", ");
  return `${names} ${many ? "have" : "has"} bookings, so ${many ? "they cannot" : "it cannot"} be deleted. Switch off "Available for booking" for ${many ? "them" : "it"} instead. Your changes are still here.`;
}

export type SaveState = "idle" | "saving" | "conflict";

export function useRoomDraft(venueId: string, server: RoomsAnswer) {
  const history = useHistory<RoomLayout>(layoutOf(server));
  const [saved, setSaved] = useState<RoomLayout>(layoutOf(server));
  const [state, setState] = useState<SaveState>("idle");
  const [notice, setNotice] = useState("");
  // A copy from an earlier visit, shown as a choice. Until it is decided it is never overwritten.
  const [found, setFound] = useState<StoredDraft | null>(() => {
    const draft = readDraft(venueId);
    return draft && JSON.stringify(draft.layout.rooms) !== JSON.stringify(layoutOf(server).rooms) ? draft : null;
  });
  const dirty = JSON.stringify(history.present.rooms) !== JSON.stringify(saved.rooms);
  const latest = useRef(history.present);
  latest.current = history.present;

  // Keep a copy of unsaved work on this device, a moment after the last change.
  useEffect(() => {
    if (found !== null) return undefined;
    if (!dirty) {
      clearDraft(venueId);
      return undefined;
    }
    const timer = window.setTimeout(
      () => writeDraft(venueId, { base_version: latest.current.base_version, saved_at: new Date().toISOString(), layout: latest.current }),
      AUTOSAVE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [history.present, dirty, found, venueId]);

  const adopt = useCallback(
    (answer: RoomsAnswer) => {
      const layout = layoutOf(answer);
      setSaved(layout);
      history.reset(layout);
    },
    [history.reset],
  );

  const attempt = useCallback(
    async (layout: RoomLayout) => {
      setState("saving");
      setNotice("");
      try {
        adopt(await putRooms(venueId, layout));
        clearDraft(venueId);
        setState("idle");
      } catch (error) {
        if (error instanceof ApiError && error.code === "stale_layout") {
          setState("conflict");
          writeDraft(venueId, { base_version: layout.base_version, saved_at: new Date().toISOString(), layout });
          return;
        }
        setState("idle");
        const blocked = blockedTables(error);
        if (blocked.length > 0) setNotice(blockedMessage(blocked));
        else if (error instanceof ApiError && error.status === 404) {
          setNotice("Something in your changes was deleted from another device, so it could not be saved. Load the latest layout, then redo what you need.");
        } else setNotice(error instanceof Error ? error.message : "We could not save the rooms. Your changes are still here.");
      }
    },
    [venueId, adopt],
  );

  const save = useCallback(() => attempt(latest.current), [attempt]);

  /** Another tab won: take the latest from the server and let go of this draft. */
  const loadLatest = useCallback(async () => {
    try {
      adopt(await getRooms(venueId));
      clearDraft(venueId);
      setState("idle");
      setNotice("");
    } catch {
      setNotice("We could not load the latest layout. Your changes are still here.");
    }
  }, [venueId, adopt]);

  /** Another tab won: save this version on top of the latest one. */
  const saveOverLatest = useCallback(async () => {
    try {
      const newest = await getRooms(venueId);
      await attempt({ ...latest.current, base_version: newest.version });
    } catch {
      setNotice("We could not reach the server. Your changes are still here.");
    }
  }, [venueId, attempt]);

  const restoreFound = useCallback(() => {
    if (found === null) return;
    history.commit({ ...found.layout, base_version: saved.base_version });
    setFound(null);
  }, [found, history.commit, saved.base_version]);

  const discardFound = useCallback(() => {
    clearDraft(venueId);
    setFound(null);
  }, [venueId]);

  return { history, dirty, state, notice, found, save, loadLatest, saveOverLatest, restoreFound, discardFound };
}
