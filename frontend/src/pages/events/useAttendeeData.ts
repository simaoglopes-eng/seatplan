// The attendee page's data: the view (GET /a/{token}, or the account version)
// plus the recommendations, the loading and error state, and live updates.
// Actions live in useAttendee.ts. Which calls are made comes from the
// AttendeeApi passed in (attendeeApi.ts); pages keep it stable with useMemo.
import { useCallback, useState } from "react";
import { ApiError } from "../../api/client";
import type { AttendeeView, SeatRecommendation } from "../../api/events";
import { useLive } from "../../api/useLive";
import type { AttendeeApi } from "./attendeeApi";

export type LoadState = { status: "loading" } | { status: "error"; error: ApiError } | { status: "ready"; view: AttendeeView };

/** One fresh copy of everything the page shows. */
export interface Fresh {
  view: AttendeeView;
  recs: SeatRecommendation[];
}

export function asApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError(0, "unknown", "Something unexpected happened. Please try again.");
}

export function useAttendeeData(attendeeApi: AttendeeApi, onLiveUpdate: (fresh: Fresh) => void) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [recs, setRecs] = useState<SeatRecommendation[] | null>(null);
  const [recsFailed, setRecsFailed] = useState(false);

  const fetchRecs = useCallback(async (view: AttendeeView): Promise<SeatRecommendation[]> => {
    if (view.me.rsvp !== "yes") return [];
    try {
      const list = await attendeeApi.recommendations();
      setRecs(list);
      setRecsFailed(false);
      return list;
    } catch {
      // Recommendations are a help, not a must: the map still works without them.
      setRecsFailed(true);
      return [];
    }
  }, [attendeeApi]);

  const fetchAll = useCallback(async (): Promise<Fresh> => {
    const view = await attendeeApi.view();
    setLoad({ status: "ready", view });
    return { view, recs: await fetchRecs(view) };
  }, [attendeeApi, fetchRecs]);

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
