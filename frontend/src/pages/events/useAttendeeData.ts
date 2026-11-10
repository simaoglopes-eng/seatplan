// The attendee page's data: GET /a/{token} plus the recommendations, the
// loading and error state, and live updates. Actions live in useAttendee.ts.
import { useCallback, useState } from "react";
import { ApiError } from "../../api/client";
import * as eventsApi from "../../api/events";
import type { AttendeeView, SeatRecommendation } from "../../api/events";
import { useLive } from "../../api/useLive";

export type LoadState = { status: "loading" } | { status: "error"; error: ApiError } | { status: "ready"; view: AttendeeView };

/** One fresh copy of everything the page shows. */
export interface Fresh {
  view: AttendeeView;
  recs: SeatRecommendation[];
}

export function asApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError(0, "unknown", "Something unexpected happened. Please try again.");
}

export function useAttendeeData(token: string, onLiveUpdate: (fresh: Fresh) => void) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [recs, setRecs] = useState<SeatRecommendation[] | null>(null);
  const [recsFailed, setRecsFailed] = useState(false);

  const fetchRecs = useCallback(async (view: AttendeeView): Promise<SeatRecommendation[]> => {
    if (view.me.rsvp !== "yes") return [];
    try {
      const list = await eventsApi.getRecommendations(token);
      setRecs(list);
      setRecsFailed(false);
      return list;
    } catch {
      // Recommendations are a help, not a must: the map still works without them.
      setRecsFailed(true);
      return [];
    }
  }, [token]);

  const fetchAll = useCallback(async (): Promise<Fresh> => {
    const view = await eventsApi.getAttendeeView(token);
    setLoad({ status: "ready", view });
    return { view, recs: await fetchRecs(view) };
  }, [token, fetchRecs]);

  /** The first load (and "Try again"): failures become the page's error state. */
  const firstLoad = useCallback(async (): Promise<AttendeeView | null> => {
    setLoad({ status: "loading" });
    try {
      return (await fetchAll()).view;
    } catch (error) {
      setLoad({ status: "error", error: asApiError(error) });
      return null;
    }
  }, [fetchAll]);

  // Live: another person's change bumps the version; fetch the truth again.
  const scope = load.status === "ready" ? load.view.event.live_scope : null;
  useLive(scope, () => {
    fetchAll().then(onLiveUpdate, () => undefined); // a failed live refresh waits for the next one
  });

  return { load, setLoad, recs, recsFailed, fetchAll, firstLoad };
}
