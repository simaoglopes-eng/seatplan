// The top of every attendee screen: which event, when, and where.
// Shown first so a first-time visitor knows at once that the link is right.
import type { EventSummary } from "../../api/events";
import { formatDateTime } from "./format";

export function EventHeader({ event, venueName }: { event: EventSummary; venueName?: string }) {
  return (
    <header className="ev-header">
      <p className="ev-eyebrow">Your invitation</p>
      <h1 className="ev-title">{event.name}</h1>
      <p className="ev-when">
        <time dateTime={event.starts_at}>{formatDateTime(event.starts_at)}</time>
        {venueName && <span> · {venueName}</span>}
      </p>
    </header>
  );
}
