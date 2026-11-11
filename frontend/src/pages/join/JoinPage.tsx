// Route /j/:token: the event's shared link. Anyone who opens it is a visitor:
// they see the event and the live seat map (names filtered by the server,
// exactly as an attendee sees them), but cannot hold or confirm a seat.
// To choose a seat they create a guest account (RegisterPage) or sign in.
//
// States (docs/guest-accounts.md section 10.4): loading, open, signed in,
// a seat picked, full, deadline passed, link switched off (403), link wrong
// or replaced (404), rate limited (429), network error, live update.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getGuestToken } from "../../api/client";
import type { ApiError } from "../../api/client";
import { getVisitorView, joinEvent } from "../../api/guest";
import type { VisitorView } from "../../api/guest";
import { useLive } from "../../api/useLive";
import { Button, ErrorState, Legend, PageShell, Skeleton, useToast } from "../../design/components";
import { SeatMap } from "../../seatmap/SeatMap";
import { asApiError } from "../account/FormProblem";
import { EventHeader } from "../events/EventHeader";
import { JoinPanel } from "./JoinPanel";
import { joinOutcome, statusFromError } from "./joinOutcome";
import { rememberWantedSeat } from "./wantedSeat";
import "../events/events.css";
import "./join.css";

type Load = { status: "loading" } | { status: "error"; error: ApiError } | { status: "ready"; view: VisitorView };

export default function JoinPage() {
  const { token = "" } = useParams();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  // True when the last live refresh failed: the map on screen may be old.
  const [stale, setStale] = useState(false);

  const reload = useCallback(async (): Promise<void> => {
    setLoad({ status: "ready", view: await getVisitorView(token) });
  }, [token]);

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

  // Someone else's change bumps the event's version: fetch the map again.
  // A failed refresh keeps the old map on screen and says so; the next
  // change (or a successful refresh) clears the warning.
  const refresh = useCallback((): void => {
    reload().then(
      () => setStale(false),
      () => setStale(true),
    );
  }, [reload]);
  const scope = load.status === "ready" ? load.view.event.live_scope : null;
  useLive(scope, refresh);

  if (load.status === "loading") {
    return (
      <PageShell title="Shared event link">
        <Skeleton lines={4} label="Loading the event" />
      </PageShell>
    );
  }
  if (load.status === "error") {
    return (
      <PageShell title="Shared event link">
        <LinkError error={load.error} onRetry={firstLoad} />
      </PageShell>
    );
  }
  return (
    <PageShell title={load.view.event.name}>
      <VisitorScreen token={token} view={load.view} stale={stale} onRefresh={refresh} onStale={firstLoad} />
    </PageShell>
  );
}

/** The four ways the page can fail before showing anything. */
function LinkError({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  if (error.code === "not_found") {
    return (
      <ErrorState
        headingLevel={1}
        title="This link does not work"
        message="This link does not work. It may have been replaced by a new one. Ask the organiser for the current link."
      />
    );
  }
  if (error.code === "link_closed") {
    return (
      <section className="join-closed" aria-labelledby="join-closed-title">
        <h1 id="join-closed-title">This link is closed for now</h1>
        <p>The organiser is not taking new guests through this link at the moment. If you already joined, sign in to see your seat.</p>
        <Link to="/my/sign-in" className="btn btn-primary">
          Sign in
        </Link>
      </section>
    );
  }
  if (error.code === "rate_limited") {
    return (
      <ErrorState
        headingLevel={1}
        title="Please wait a minute"
        message="Too many people are opening this page from your network. Please wait a minute and try again."
        onRetry={onRetry}
      />
    );
  }
  return <ErrorState headingLevel={1} title="We could not load this event" message={error.message} onRetry={onRetry} />;
}

interface VisitorScreenProps {
  token: string;
  view: VisitorView;
  /** The last live refresh failed, so the map may be out of date. */
  stale: boolean;
  /** Fetches the view again quietly, keeping this screen (and its messages) on show. */
  onRefresh: () => void;
  /** Called when the link stopped working while the page was open. */
  onStale: () => void;
}

function VisitorScreen({ token, view, stale, onRefresh, onStale }: VisitorScreenProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const [seatId, setSeatId] = useState<number | null>(null);
  const [signedIn, setSignedIn] = useState(() => getGuestToken() !== null);
  const [joining, setJoining] = useState(false);
  const [message, setMessage] = useState("");
  const [joinProblem, setJoinProblem] = useState<string | null>(null);
  const mapBox = useRef<HTMLDivElement>(null);
  const { join, map, event } = view;

  // A live update may take the seat this visitor is looking at: close the panel and say so.
  const picked = seatId === null ? undefined : map.seats.find((s) => s.id === seatId);
  useEffect(() => {
    if (seatId !== null && (picked?.state !== "free" || !join.open)) {
      setSeatId(null);
      setMessage(
        join.open ? "The seat you picked is no longer free. Choose another free seat." : "Joining this event closed while you were looking.",
      );
    }
  }, [seatId, picked?.state, join.open]);

  const pickSeat = (id: number): void => {
    setSeatId(id);
    setJoinProblem(null);
    rememberWantedSeat(event.live_scope, id);
  };

  const closePanel = (): void => {
    setSeatId(null);
    // Back to the map, where the keyboard cursor still sits on the same seat.
    mapBox.current?.querySelector<HTMLElement>('[role="listbox"]')?.focus();
  };

  const joinNow = async (): Promise<void> => {
    setJoining(true);
    setJoinProblem(null);
    try {
      const outcome = joinOutcome(await joinEvent(token), false);
      if (outcome.toast) toast.show(outcome.toast, "success");
      navigate(outcome.to, outcome.notice ? { state: { notice: outcome.notice } } : undefined);
    } catch (error) {
      handleJoinError(error);
    } finally {
      setJoining(false);
    }
  };

  const handleJoinError = (error: unknown): void => {
    const apiError = asApiError(error);
    const status = statusFromError(apiError);
    if (status) {
      setJoinProblem(joinOutcome({ status, event_id: null }, false).notice);
      onRefresh();
    } else if (apiError.code === "unauthorised") {
      setSignedIn(false); // api/client.ts already forgot the token
      setJoinProblem("Please sign in again.");
    } else if (apiError.code === "not_found") {
      onStale();
    } else {
      setJoinProblem(apiError.message);
    }
  };

  const actions = (
    <JoinActions
      token={token}
      open={join.open}
      full={join.reason === "full"}
      signedIn={signedIn}
      joining={joining}
      onJoin={() => void joinNow()}
    />
  );
  const seatHeading = picked ? seatHeadingFor(view, picked.id) : "";

  return (
    <div className="ev-page join-page">
      <EventHeader event={event} venueName={view.venue.name} eyebrow="Shared event" />
      <StatusPanel view={view} actions={actions} problem={joinProblem} />
      <p className="visually-hidden" role="status" aria-live="polite">
        {message}
      </p>
      {stale && (
        <p className="ev-warning" role="status">
          The map may be out of date: we could not refresh it. It will try again at the next change.
        </p>
      )}
      <div ref={mapBox} className="ev-map">
        <SeatMap
          label={`Seat map, ${event.name}`}
          zones={map.zones}
          tables={map.tables}
          seats={map.seats}
          selectable={(id) => join.open && map.seats.some((s) => s.id === id && s.state === "free")}
          selectedId={seatId}
          onSelect={pickSeat}
        />
      </div>
      {picked && (
        <JoinPanel
          seatId={picked.id}
          heading={seatHeading}
          text={
            signedIn
              ? "Join this event first. You can then hold this seat and confirm it, and we will email your seat and a picture of the room."
              : "To choose it, create an account. It takes a minute; we will email your seat and a picture of the room."
          }
          actions={actions}
          onClose={closePanel}
        />
      )}
      <h2 className="ev-subtitle">What the symbols mean</h2>
      <Legend states={["free", "held", "taken", "blocked"]} showAccessible />
    </div>
  );
}

/** "Seat 5 at table T3 is free". */
function seatHeadingFor(view: VisitorView, seatId: number): string {
  const seat = view.map.seats.find((s) => s.id === seatId);
  const table = view.map.tables.find((t) => t.id === seat?.table_id);
  if (!seat) return "This seat is free";
  return table ? `Seat ${seat.label} at table ${table.label} is free` : `Seat ${seat.label} is free`;
}

interface JoinActionsProps {
  token: string;
  open: boolean;
  /** Joining is closed because every place has a guest. */
  full: boolean;
  signedIn: boolean;
  joining: boolean;
  onJoin: () => void;
}

/** The buttons that lead on. When joining is closed, only signing in is left. */
function JoinActions({ token, open, full, signedIn, joining, onJoin }: JoinActionsProps) {
  const base = `/j/${encodeURIComponent(token)}`;
  if (signedIn && open) {
    return (
      <Button busy={joining} onClick={onJoin}>
        Join this event
      </Button>
    );
  }
  if (signedIn) {
    return (
      <Link to="/my" className="btn btn-secondary">
        My events
      </Link>
    );
  }
  return (
    <>
      {open && (
        <Link to={`${base}/register`} className="btn btn-primary">
          Create an account to choose a seat
        </Link>
      )}
      {full && (
        // Invited guests still have a place: their account links to their invitation.
        <Link to={`${base}/register`} className="btn btn-secondary">
          I was invited: create my account
        </Link>
      )}
      <Link to={`${base}/sign-in`} className="btn btn-secondary">
        I already have an account
      </Link>
    </>
  );
}

interface StatusPanelProps {
  view: VisitorView;
  actions: ReactNode;
  problem: string | null;
}

/** Places left (or why joining is closed), and the main buttons. */
function StatusPanel({ view, actions, problem }: StatusPanelProps) {
  const { join } = view;
  return (
    <section className="ev-card join-status" aria-label="Joining this event">
      {join.open ? (
        <p className="join-places" aria-live="polite">
          {join.places_left === 1 ? "1 place left." : `${join.places_left} places left.`}
        </p>
      ) : (
        <p className="join-places" aria-live="polite">
          {join.reason === "deadline_passed" ? "Seat choices for this event have closed." : "This event is full. Every place has a guest."}
        </p>
      )}
      {join.open && <p>Pick a free seat on the map to see it, or create an account to choose one.</p>}
      {problem && (
        <p className="ev-warning" role="alert">
          {problem}
        </p>
      )}
      <div className="join-actions">{actions}</div>
    </section>
  );
}
