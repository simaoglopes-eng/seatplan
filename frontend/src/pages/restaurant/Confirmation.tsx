// Step 5: done. The summary and the manage link are ALWAYS shown here,
// because email can fail; this page alone must be enough to manage the booking.
import type { BookingConfirmation } from "../../api/restaurant";
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
      <StepHeading>You are booked, {booking.name.split(" ")[0]}</StepHeading>
      <p>
        A confirmation email with a calendar invite is on its way to <strong>{confirmation.email}</strong>. It can take a few minutes; check your
        spam folder if you do not see it.
      </p>
      <BookingSummary booking={booking} />
      <div className="rb-card">
        <h3 className="rb-service-title">Keep this link</h3>
        <p>Use it to change the time, the party size, or to cancel. It works even if the email never arrives.</p>
        <CopyLink url={absoluteUrl(manageUrl)} label="Your manage link" />
        <a href={absoluteUrl(manageUrl)}>Open my booking</a>
      </div>
    </section>
  );
}
