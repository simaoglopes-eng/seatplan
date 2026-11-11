// Route /my/:eventId: a guest account holder's seat page. It is the same
// journey as the personal link (/e/:token): Reply, People you know, Choose
// seat, Done. Only the calls differ: accountApi uses /guest/events/{eid}
// with the guest session instead of /a/{token}.
//
// Extras on this page: the account bar, the seat picked as a visitor (kept in
// sessionStorage) offered again, and the email sentence on the Done step.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getMyAccount } from "../../api/guest";
import { ErrorState, PageShell, Skeleton } from "../../design/components";
import { AttendeeJourney } from "../events/AttendeePage";
import { AttendeeSkeleton } from "../events/AttendeeStates";
import { accountApi } from "../events/attendeeApi";
import { useAttendee } from "../events/useAttendee";
import type { AttendeeState } from "../events/useAttendee";
import { forgetWantedSeat, readWantedSeat } from "../join/wantedSeat";
import { AccountBar } from "./AccountBar";
import { useRequireGuest, useSessionExpired } from "./useGuestSession";
import "../events/events.css";
import "./account.css";

export default function MySeatPage() {
  const { eventId = "" } = useParams();
  const signedIn = useRequireGuest();
  if (!signedIn) {
    // useRequireGuest is already on its way to the sign-in page.
    return (
      <PageShell title="Your seat">
        <Skeleton lines={2} label="Opening the sign-in page" />
      </PageShell>
    );
  }
  return <SeatScreen eventId={eventId} />;
}

function SeatScreen({ eventId }: { eventId: string }) {
  // One adapter per event, so the hooks below do not reload on every render.
  const attendeeApi = useMemo(() => accountApi(eventId), [eventId]);
  const state = useAttendee(attendeeApi);
  const expired = useSessionExpired();
  const email = useAccountEmail();
  useWantedSeat(state);

  // A refused session (401) means: sign in again, then come back here.
  useEffect(() => {
    if (state.load.status === "error") expired(state.load.error);
  }, [state.load, expired]);

  const bar = <AccountBar email={email} current="seat" />;
  if (state.load.status === "loading") {
    return (
      <PageShell title="Your seat">
        <AttendeeSkeleton />
      </PageShell>
    );
  }
  if (state.load.status === "error") {
    return (
      <PageShell title="Your seat">
        <div className="acc-page acc-wide">
          {bar}
          <SeatProblem code={state.load.error.code} message={state.load.error.message} onRetry={() => void state.actions.retry()} />
        </div>
      </PageShell>
    );
  }
  const note = email
    ? `We are emailing your seat and a picture of the room to ${email}. It can take up to 15 minutes.`
    : "We are emailing your seat and a picture of the room. It can take up to 15 minutes.";
  return (
    <PageShell title={state.load.view.event.name}>
      <AttendeeJourney state={state} top={bar} doneEmailNote={note} />
    </PageShell>
  );
}

function SeatProblem({ code, message, onRetry }: { code: string; message: string; onRetry: () => void }) {
  if (code === "not_found") {
    return (
      <ErrorState headingLevel={1} title="Not on this guest list" message="You are not on the guest list of this event with this account.">
        <Link to="/my">My events</Link>
      </ErrorState>
    );
  }
  if (code === "unauthorised") return <Skeleton lines={2} label="Opening the sign-in page" />;
  return <ErrorState headingLevel={1} title="We could not load your seat" message={message} onRetry={onRetry} />;
}

/** The account's email for the bar and the Done step; null until it arrives. */
function useAccountEmail(): string | null {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getMyAccount().then(
      (me) => alive && setEmail(me.account.email),
      () => undefined, // the seat page works without it; the view call reports real problems
    );
    return () => {
      alive = false;
    };
  }, []);
  return email;
}

/**
 * The seat this person picked as a visitor, before they had an account. When
 * it is still free and they have no seat or hold yet, the seat step opens with
 * it selected, ready to hold. Used once, then forgotten.
 */
function useWantedSeat(state: AttendeeState): void {
  const used = useRef(false);
  useEffect(() => {
    if (used.current || state.load.status !== "ready") return;
    used.current = true;
    const { event, map, me } = state.load.view;
    const wanted = readWantedSeat(event.live_scope);
    forgetWantedSeat(event.live_scope);
    const stillFree = map.seats.some((s) => s.id === wanted && s.state === "free");
    if (wanted !== null && stillFree && me.seat_id === null && me.held_seat_id === null) state.actions.focusSeat(wanted);
  }, [state.load, state.actions]);
}
