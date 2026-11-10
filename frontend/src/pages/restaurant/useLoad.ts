// Loads data for a screen and keeps track of the three states every screen
// must show: loading, error and ready. One hook instead of the same three
// useState calls in every component.
import { useCallback, useEffect, useRef, useState } from "react";

export type LoadState<T> = { status: "loading" } | { status: "error"; error: unknown } | { status: "ready"; data: T };

export interface Loaded<T> {
  state: LoadState<T>;
  /**
   * Fetch again. A normal reload shows the skeleton. A `quiet` reload (used by
   * live updates) keeps the old data on screen and ignores a failure, because
   * the next live update will simply try again.
   */
  reload: (quiet?: boolean) => void;
  /** Replace the data after a successful write, without another request. */
  setData: (data: T) => void;
}

/**
 * Calls `load` when `key` changes. `key` is a string such as "2026-11-12|19:30"
 * that says which data we want; a change of key means "load something else".
 * While the new data is on its way the old data stays on screen, so dragging
 * a time slider does not flash a skeleton on every step.
 */
export function useLoad<T>(load: () => Promise<T>, key: string): Loaded<T> {
  const [state, setState] = useState<LoadState<T>>({ status: "loading" });
  // The newest loader, so a reload always uses the current page values.
  const loadRef = useRef(load);
  loadRef.current = load;
  // Counts requests, so an old slow answer can never overwrite a newer one.
  const requestId = useRef(0);
  // Whether something has been shown yet; decides if a key change needs the skeleton.
  const hasData = useRef(false);

  const run = useCallback((showSkeleton: boolean, ignoreErrors: boolean) => {
    const id = ++requestId.current;
    if (showSkeleton) setState({ status: "loading" });
    loadRef.current().then(
      (data) => {
        if (id !== requestId.current) return;
        hasData.current = true;
        setState({ status: "ready", data });
      },
      (error: unknown) => {
        if (id !== requestId.current) return;
        setState((current) => (ignoreErrors && current.status === "ready" ? current : { status: "error", error }));
      },
    );
  }, []);

  useEffect(() => {
    // Skeleton only when nothing is on screen yet.
    run(!hasData.current, false);
  }, [key, run]);

  const reload = useCallback((quiet = false) => run(!quiet, quiet), [run]);
  const setData = useCallback((data: T) => {
    hasData.current = true;
    setState({ status: "ready", data });
  }, []);
  return { state, reload, setData };
}
