// Step 5: done. The summary and the manage link are ALWAYS shown here,
// because email can fail; this page alone must be enough to manage the booking.
// The first thing on it is the result, and the next action is "Manage booking".
import type { BookingConfirmation } from "../../api/restaurant";
import { BookingRows } from "./BookingSummary";
import { CopyLink, absoluteUrl } from "./CopyLink";
import { StepHeading } from "./StepHeading";
import { DirectionsLink, VenueCard, usePublicVenue } from "./VenueCard";

export function Confirmation({ confirmation }: { confirmation: BookingConfirmation }) {
  const { booking, manage_url: manageUrl } = confirmation;
  const venue = usePublicVenue(booking.venue_public_id);
  return (
    <div className="rb5-two">
      <section className="rb-card rb5-confirm">
        <div className="rb-done-mark" aria-hidden="true">
          <svg viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="21" />
            <path d="M14 25l7 7 13-15" />
          </svg>
        </div>
        <StepHeading>Booking confirmed.</StepHeading>
        <p className="rb-muted rb5-lede">Your table at {booking.venue_name} is reserved.</p>
        <BookingRows booking={booking} />
        <div className="rb5-actions">
          <a className="btn btn-primary" href={absoluteUrl(manageUrl)}>
            Manage booking <span aria-hidden="true">{"\u2192"}</span>
          </a>
          <DirectionsLink venue={venue} />
        </div>
        <div className="rb5-after">
          <p className="rb-muted">
            Confirmation email · <strong>{confirmation.email}</strong>. It can take a few minutes; check your spam folder if you do not see it.
          </p>
          <CopyLink url={absoluteUrl(manageUrl)} label="Your manage link" />
        </div>
      </section>
      <VenueCard booking={booking} venue={venue} />
    </div>
  );
}
