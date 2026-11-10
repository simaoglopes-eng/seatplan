// Shared state of the organiser workspace: the event data, live updates,
// one busy flag, one announcement line, and the few things both the map and
// the side panel need (the scenario being previewed, the guest being placed,
// what-if mode). Each tab keeps its own small form state locally.
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import * as eventsApi from "../../api/events";
import type { Move, OrganiserEvent, Scenario, WhatIfResult } from "../../api/events";
import { useLive } from "../../api/useLive";
import { useToast } from "../../design/components";

export type OrganiserLoad = { status: "loading" } | { status: "error"; error: ApiError } | { status: "ready"; data: OrganiserEvent };

export interface PendingMove {
  move: Move;
  result: WhatIfResult;
}

function asApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError(0, "unknown", "Something unexpected happened. Please try again.");
}

export function useOrganiser(eventId: string) {
  const toast = useToast();
  const [load, setLoad] = useState<OrganiserLoad>({ status: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<Scenario | null>(null);
  const [selectedGuest, setSelectedGuest] = useState<number | null>(null);
  const [whatIfMode, setWhatIfMode] = useState(false);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  // Personal links exist only in the answer that created them (the server keeps a hash).
  const [links, setLinks] = useState<Record<number, string>>({});
  // The map box, so the Guests tab can bring it into view on a phone.
  const mapRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async (): Promise<void> => {
    const data = await eventsApi.getOrganiserEvent(eventId);
    setLoad({ status: "ready", data });
  }, [eventId]);

  const firstLoad = useCallback(async (): Promise<void> => {
    setLoad({ status: "loading" });
    try {
      await reload();
    } catch (error) {
      setLoad({ status: "error", error: asApiError(error) });
    }
  }, [reload]);

  useEffect(() => {
    void firstLoad();
  }, [firstLoad]);

  const scope = load.status === "ready" ? `event-${load.data.event.public_id}` : null;
  useLive(scope, () => {
    reload().catch(() => undefined); // the next live tick tries again
  });

  /**
   * Runs one action: busy flag on, call, reload, then say what happened in the
   * live region and a toast. Returns true when it worked.
   */
  const run = async (name: string, done: string, action: () => Promise<void>): Promise<boolean> => {
    setBusy(name);
    try {
      await action();
      await reload();
      setMessage(done);
      toast.show(done, "success");
      return true;
    } catch (error) {
      const text = asApiError(error).message;
      setMessage(`Problem: ${text}`);
      toast.show(text, "danger");
      return false;
    } finally {
      setBusy(null);
    }
  };

  return {
    eventId,
    load,
    busy,
    message,
    preview,
    selectedGuest,
    whatIfMode,
    pendingMove,
    links,
    mapRef,
    retry: firstLoad,
    run,
    announce: setMessage,
    setPreview,
    setSelectedGuest,
    setWhatIfMode,
    setPendingMove,
    rememberLink: (guestId: number, link: string) => setLinks((current) => ({ ...current, [guestId]: link })),
  };
}

export type OrganiserState = ReturnType<typeof useOrganiser>;
