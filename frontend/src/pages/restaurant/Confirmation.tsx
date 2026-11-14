// Step 5: done. The summary and the manage link are ALWAYS shown here,
// because email can fail; this page alone must be enough to manage the booking.
// The first thing on it is the result, and the next action is "Manage booking".
import type { BookingConfirmation } from "../../api/restaurant";
import { Badge } from "../../design/components";
import { BookingSummary } from "./BookingSummary";
import { CopyLink, absoluteUrl } from "./CopyLink";
import { StepHeading } from "./StepHeading";

export function Confirmation({ confirmation }: { confirmation: BookingConfirmation }) {
  const { booking, manage_url: manageUrl } = confirmation;
  return (
    <section className="rb-step rb-done">
      <div className="rb-done-mark" aria-hidden="true">
        <svg viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="21" />
          <path d="M14 25l7 7 13-15" />
        </svg>
      </div>
      <Badge tone="success">Booking confirmed</Badge>
      <StepHeading>You are booked, {booking.name.split(" ")[0]}</StepHeading>
      <BookingSummary booking={booking} hideStatus />
      <div className="rb-card rb-confirm-actions">
        <a className="btn btn-primary" href={absoluteUrl(manageUrl)}>
          Manage booking
        </a>
        <p className="rb-muted">Use it to change the time, the party size or a chair request, or to cancel. It works even if the email never arrives.</p>
        <CopyLink url={absoluteUrl(manageUrl)} label="Your manage link" />
      </div>
      <p>
        A confirmation email with a calendar invite is on its way to <strong>{confirmation.email}</strong>. It can take a few minutes; check your
        spam folder if you do not see it.
      </p>
    </section>
  );
}
