// The facts of one booking as a definition list. Used on the confirmation
// page and on the manage page, so both always say the same thing.
import type { BookingStatus, BookingView } from "../../api/restaurant";
import { Badge } from "../../design/components";
import type { BadgeTone } from "../../design/components";
import { formatDate, people, tablesText } from "./format";

const STATUS_TEXT: Record<BookingStatus, { label: string; tone: BadgeTone }> = {
  confirmed: { label: "Confirmed", tone: "success" },
  seated: { label: "Seated", tone: "info" },
  finishing: { label: "Finishing", tone: "info" },
  completed: { label: "Completed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "danger" },
  no_show: { label: "Marked as no-show", tone: "danger" },
};

/** A cancelled booking has no table; "No table yet" would suggest one is still coming. */
function tableText(booking: BookingView): string {
  if (booking.status === "cancelled") return "None, the booking is cancelled";
  return tablesText(booking.table_labels);
}

function needsText(booking: BookingView): string {
  const needs: string[] = [];
  if (booking.needs_accessible) needs.push("Accessible table");
  if (booking.high_chairs > 0) needs.push(booking.high_chairs === 1 ? "1 high chair" : `${booking.high_chairs} high chairs`);
  return needs.length > 0 ? needs.join(", ") : "None";
}

export function BookingSummary({ booking }: { booking: BookingView }) {
  const status = STATUS_TEXT[booking.status];
  return (
    <dl className="rb-summary">
      <div>
        <dt>Status</dt>
        <dd>
          <Badge tone={status.tone}>{status.label}</Badge>
        </dd>
      </div>
      <div>
        <dt>Restaurant</dt>
        <dd>{booking.venue_name}</dd>
      </div>
      <div>
        <dt>When</dt>
        <dd>
          {formatDate(booking.date)}, {booking.time} to {booking.end_time}
        </dd>
      </div>
      <div>
        <dt>Party</dt>
        <dd>{people(booking.party_size)}</dd>
      </div>
      <div>
        <dt>Table</dt>
        <dd>{tableText(booking)}</dd>
      </div>
      <div>
        <dt>Name</dt>
        <dd>{booking.name}</dd>
      </div>
      <div>
        <dt>Needs</dt>
        <dd>{needsText(booking)}</dd>
      </div>
      {booking.notes && (
        <div>
          <dt>Notes</dt>
          <dd>{booking.notes}</dd>
        </div>
      )}
    </dl>
  );
}
