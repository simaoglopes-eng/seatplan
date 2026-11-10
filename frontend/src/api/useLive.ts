// Live updates for one scope, such as "event-abc123".
//
// The server keeps a version number per scope and bumps it on every write.
// This hook tells the page "the version changed, fetch again"; it never
// carries the data itself, so the page always reloads the truth from the API.
//
// First choice: server-sent events (one HTTP response that streams events).
// The server closes each stream after about 25 s (serverless limit) and the
// browser reconnects by itself. If streaming does not work at all, we fall
// back to asking GET /version every 2 seconds.
import { useEffect, useRef, useState } from "react";
import { getLiveVersion, liveStreamUrl } from "./client";

export type LiveStatus = "connecting" | "live" | "polling" | "off";

export const POLL_INTERVAL_MS = 2000;

// After a stream was open, a few errors in a row (without a successful
// reconnect in between) mean streaming is broken, not just recycling.
const MAX_ERRORS_BEFORE_FALLBACK = 3;

/** The server sends either a bare number or {"version": n}; accept both. */
export function parseVersion(data: string): number | null {
  try {
    const value: unknown = JSON.parse(data);
    if (typeof value === "number") return value;
    if (typeof value === "object" && value !== null && "version" in value) {
      const version = (value as { version: unknown }).version;
      return typeof version === "number" ? version : null;
    }
  } catch {
    return null;
  }
  return null;
}

/** Starts polling; returns a function that stops it. */
function startPolling(scope: string, report: (version: number) => void): () => void {
  let stopped = false;
  const poll = async (): Promise<void> => {
    try {
      const { version } = await getLiveVersion(scope);
      if (!stopped) report(version);
    } catch {
      // A failed poll is not fatal: the next tick tries again.
    }
  };
  void poll();
  const timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
  return () => {
    stopped = true;
    window.clearInterval(timer);
  };
}

/**
 * Calls `onVersion` every time the scope's version goes up.
 * Pass `null` as scope to switch live updates off (for example before load).
 */
export function useLive(scope: string | null, onVersion: (version: number) => void): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>(scope ? "connecting" : "off");
  // Keep the latest callback in a ref, so a new function on every render
  // does not tear down and reopen the connection.
  const callbackRef = useRef(onVersion);
  callbackRef.current = onVersion;

  useEffect(() => {
    if (!scope) {
      setStatus("off");
      return undefined;
    }
    let lastVersion = -1;
    const report = (version: number): void => {
      // Only real changes reach the page, never repeats.
      if (version <= lastVersion) return;
      lastVersion = version;
      callbackRef.current(version);
    };
    return connect(scope, report, setStatus);
  }, [scope]);

  return status;
}

/** Opens the stream and wires the fallback; returns the cleanup function. */
function connect(scope: string, report: (version: number) => void, setStatus: (s: LiveStatus) => void): () => void {
  let stopPolling: (() => void) | null = null;
  const fallBack = (): void => {
    if (stopPolling) return;
    setStatus("polling");
    stopPolling = startPolling(scope, report);
  };

  if (typeof EventSource === "undefined") {
    fallBack();
    return () => stopPolling?.();
  }

  setStatus("connecting");
  const source = new EventSource(liveStreamUrl(scope));
  let everOpened = false;
  let errorsSinceOpen = 0;

  const onVersionEvent = (event: MessageEvent<string>): void => {
    const version = parseVersion(event.data);
    if (version !== null) report(version);
  };
  // The contract names the event "version"; unnamed messages are accepted too
  // so a small server-side difference does not silently stop live updates.
  source.addEventListener("version", onVersionEvent as EventListener);
  source.onmessage = onVersionEvent;
  source.onopen = () => {
    everOpened = true;
    errorsSinceOpen = 0;
    setStatus("live");
  };
  source.onerror = () => {
    errorsSinceOpen += 1;
    const broken = !everOpened || errorsSinceOpen >= MAX_ERRORS_BEFORE_FALLBACK || source.readyState === EventSource.CLOSED;
    if (broken) {
      source.close();
      fallBack();
    }
  };

  return () => {
    source.close();
    stopPolling?.();
  };
}
