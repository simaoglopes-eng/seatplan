// The top of every attendee screen: which event, when, and where.
// Shown first so a first-time visitor knows at once that the link is right.
import type { EventSummary } from "../../api/events";
import { formatDateTime } from "./format";

/** `eyebrow` is the small line above the title; the shared link says "Shared event" instead. */
export function EventHeader({ event, venueName, eyebrow = "Your invitation" }: { event: EventSummary; venueName?: string; eyebrow?: string }) {
  return (
    <header className="ev-header">
      <p className="ev-eyebrow">{eyebrow}</p>
      <h1 className="ev-title">{event.name}</h1>
      <p className="ev-when">
        <time dateTime={event.starts_at}>{formatDateTime(event.starts_at)}</time>
        {venueName && <span> · {venueName}</span>}
      </p>
    </header>
  );
}
