// Route /my: the events this guest account belongs to, one card each, with
// the seat in words. A message from the join step ("this event filled up")
// arrives in the router state and is shown at the top.
import { Link, useLocation } from "react-router-dom";
import type { MyEvent } from "../../api/guest";
import { EmptyState, ErrorState, PageShell, Skeleton } from "../../design/components";
import { formatDateTime } from "../events/format";
import type { MyNoticeState } from "../join/joinOutcome";
import { AccountBar } from "./AccountBar";
import { useMyAccount } from "./useGuestSession";
import "../events/events.css";
import "./account.css";

export default function MyEventsPage() {
  const { load, retry } = useMyAccount();
  const notice = (useLocation().state as MyNoticeState | null)?.notice ?? null;

  return (
    <PageShell title="My events">
      <div className="acc-page acc-wide">
        <AccountBar email={load.status === "ready" ? load.me.account.email : null} current="events" />
        <h1 className="acc-title">My events</h1>
        {notice && (
          <p className="acc-notice" role="status">
            {notice}
          </p>
        )}
        {load.status === "loading" && <Skeleton lines={3} label="Loading your events" />}
        {load.status === "error" && <ErrorState message={load.error.message} onRetry={() => void retry()} />}
        {load.status === "ready" && <EventList events={load.me.events} />}
      </div>
    </PageShell>
  );
}

function EventList({ events }: { events: MyEvent[] }) {
  if (events.length === 0) {
    return (
      <EmptyState title="No events yet">
        <p>You have not joined any events yet. Open the link the organiser shared to join one.</p>
      </EmptyState>
    );
  }
  return (
    <ul className="acc-events" aria-label="Your events">
      {events.map((event) => (
        <li key={event.event_id} className="ev-card acc-event">
          <h2 className="ev-subtitle">{event.name}</h2>
          <p className="ev-muted">
            <time dateTime={event.starts_at}>{formatDateTime(event.starts_at)}</time> · {event.venue_name}
          </p>
          <p>{seatText(event)}</p>
          <Link to={`/my/${encodeURIComponent(event.event_id)}`} className="btn btn-primary" aria-label={`Open ${event.name}`}>
            Open
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** "Your seat: seat 5 at table T3", or why there is none. */
export function seatText(event: MyEvent): string {
  if (event.rsvp === "no") return "You said you cannot come.";
  if (event.seat) return `Your seat: seat ${event.seat.seat_label} at table ${event.seat.table_label}`;
  return "No seat yet";
}
