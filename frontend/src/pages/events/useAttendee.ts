// Everything the attendee can do, in one hook: hold, confirm, release,
// RSVP, "people I know", privacy, plus the seat on hold, the seat being
// looked at, and friendly notices when something goes wrong.
// The data itself (loading, live updates) comes from useAttendeeData.
//
// The page component only draws; every API call starts here.
import { useEffect, useRef, useState } from "react";
import * as eventsApi from "../../api/events";
import type { SeatRecommendation } from "../../api/events";
import { useToast } from "../../design/components";
import { knowsSavedMessage, lostSeat, nextBest } from "./attendeeRules";
import type { ActiveHold } from "./attendeeRules";
import { seatName } from "./format";
import { asApiError, useAttendeeData } from "./useAttendeeData";
import type { Fresh } from "./useAttendeeData";
import { useCountdown } from "./useCountdown";

export type Notice =
  | { kind: "conflict"; seatId: number; suggestion: SeatRecommendation | null }
  | { kind: "expired"; seatId: number }
  | { kind: "deadline" }
  | { kind: "problem"; message: string };

export function useAttendee(token: string) {
  const toast = useToast();
  const [hold, setHold] = useState<ActiveHold | null>(null);
  const [lookingAt, setLookingAt] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [changingSeat, setChangingSeat] = useState(false);
  const secondsLeft = useCountdown(hold?.expires_at ?? null);

  // Refs let the live callback read the newest hold without reconnecting.
  const holdRef = useRef(hold);
  holdRef.current = hold;
  const lookingRef = useRef(lookingAt);
  lookingRef.current = lookingAt;

  /** After a live update: show the conflict message if the seat I hold or look at was just taken. */
  const checkForLoss = ({ view, recs }: Fresh): void => {
    // My own earlier hold (from before a reload) shows as "held" and is not a loss.
    const looking = lookingRef.current === view.me.held_seat_id ? null : lookingRef.current;
    const lost = lostSeat(view.map.seats, holdRef.current, looking);
    if (lost === null) return;
    if (holdRef.current?.seat_id === lost) setHold(null);
    setLookingAt(null);
    setNotice({ kind: "conflict", seatId: lost, suggestion: nextBest(recs, view.map.seats, lost) });
  };

  const { load, setLoad, recs, recsFailed, fetchAll, firstLoad } = useAttendeeData(token, checkForLoss);

  useEffect(() => {
    void firstLoad().then((view) => {
      // A hold from before a page reload: the server sends its end time, so
      // the countdown simply carries on.
      if (view && view.me.held_seat_id !== null && view.me.held_until !== null) {
        setHold({ seat_id: view.me.held_seat_id, expires_at: view.me.held_until });
        setLookingAt(view.me.held_seat_id);
      }
    });
  }, [firstLoad]);

  // The countdown is only a display; when it reaches zero we stop pretending.
  useEffect(() => {
    if (!hold || secondsLeft > 0) return;
    setHold(null);
    setNotice({ kind: "expired", seatId: hold.seat_id });
  }, [hold, secondsLeft]);

  useEffect(() => {
    if (hold && secondsLeft === 60) setMessage("One minute left to confirm your seat.");
  }, [hold, secondsLeft]);

  const nameOf = (seatId: number): string =>
    load.status === "ready" ? seatName(seatId, load.view.map.seats, load.view.map.tables) : "this seat";

  /** Turns an API error into the right friendly notice. */
  const handleError = async (error: unknown, seatId: number | null): Promise<void> => {
    const apiError = asApiError(error);
    if (apiError.code === "not_found") {
      setLoad({ status: "error", error: apiError });
      return;
    }
    if (apiError.code === "seat_taken" && seatId !== null) {
      const fresh = await fetchAll().catch(() => null);
      if (holdRef.current?.seat_id === seatId) setHold(null);
      setLookingAt(null);
      setNotice({ kind: "conflict", seatId, suggestion: fresh ? nextBest(fresh.recs, fresh.view.map.seats, seatId) : null });
      return;
    }
    if (apiError.code === "hold_expired" && seatId !== null) {
      setHold(null);
      setNotice({ kind: "expired", seatId });
      return;
    }
    if (apiError.code === "deadline_passed") {
      setNotice({ kind: "deadline" });
      await fetchAll().catch(() => null);
      return;
    }
    setNotice({ kind: "problem", message: apiError.message });
  };

  /** Runs one action with a busy flag, so buttons show a spinner and cannot double-submit. */
  const run = async (name: string, seatId: number | null, action: () => Promise<void>): Promise<void> => {
    setBusy(name);
    try {
      await action();
    } catch (error) {
      await handleError(error, seatId);
    } finally {
      setBusy(null);
    }
  };

  const actions = {
    retry: firstLoad,
    dismissNotice: () => setNotice(null),
    focusSeat: (seatId: number) => {
      setLookingAt(seatId);
      setNotice(null);
      setMessage(`Showing ${nameOf(seatId)} on the map.`);
    },
    startChange: () => {
      setChangingSeat(true);
      setMessage("Choose a new seat. You keep your current seat until you confirm another one.");
    },
    cancelChange: () => {
      setChangingSeat(false);
      setHold(null);
    },
    rsvp: (answer: "yes" | "no") =>
      run("rsvp", null, async () => {
        await eventsApi.sendRsvp(token, answer);
        setMessage(answer === "yes" ? "Thank you, we have noted that you are coming." : "Thank you, we have noted that you cannot come.");
        await fetchAll();
      }),
    saveKnows: (ids: number[], onDone: () => void) =>
      run("knows", null, async () => {
        if (ids.length > 0) await eventsApi.sendKnows(token, ids);
        onDone();
        // Read the fresh list first: the message depends on whether these people have seats.
        const fresh = await fetchAll();
        setMessage(knowsSavedMessage(ids, fresh.view.people));
      }),
    hold: (seatId: number) =>
      run("hold", seatId, async () => {
        const answer = await eventsApi.holdSeat(token, seatId);
        setHold({ seat_id: seatId, expires_at: answer.expires_at });
        setLookingAt(seatId);
        setNotice(null);
        setMessage(`${nameOf(seatId)} is held for you for 5 minutes. Confirm to keep it.`);
        await fetchAll();
      }),
    confirm: () => {
      const seatId = holdRef.current?.seat_id ?? null;
      if (seatId === null) return Promise.resolve();
      return run("confirm", seatId, async () => {
        await eventsApi.confirmSeat(token, seatId);
        setHold(null);
        setChangingSeat(false);
        setLookingAt(null);
        setMessage(`Done. ${nameOf(seatId)} is now your seat.`);
        toast.show(`${nameOf(seatId)} is yours.`, "success");
        await fetchAll();
      });
    },
    release: () =>
      run("release", null, async () => {
        await eventsApi.releaseSeat(token);
        setChangingSeat(false);
        setMessage("Your seat is free again. You can choose a new one at any time before the deadline.");
        await fetchAll();
      }),
    setAnonymous: (value: boolean) =>
      run("privacy", null, async () => {
        await eventsApi.sendPrivacy(token, value);
        setMessage(value ? "Other guests now see you as Guest." : "Other guests can see your name again.");
        await fetchAll();
      }),
  };

  return { load, recs, recsFailed, hold, secondsLeft, lookingAt, notice, busy, message, changingSeat, actions };
}

export type AttendeeState = ReturnType<typeof useAttendee>;
