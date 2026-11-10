// The attendee screens that are not part of the happy path: loading, a link
// that does not work, a guest who said no, and seat choice after the deadline.
import type { ApiError } from "../../api/client";
import type { AttendeeView } from "../../api/events";
import { Button, EmptyState, ErrorState, Skeleton } from "../../design/components";
import { formatDeadline, seatName } from "./format";
import { StepTitle } from "./StepTitle";

/** Shaped like the real page: title, date, then a card. */
export function AttendeeSkeleton() {
  return (
    <div className="ev-skeleton">
      <Skeleton lines={2} label="Loading your invitation" />
      <div className="ev-skeleton-card" aria-hidden="true">
        <Skeleton lines={4} label="Loading" />
      </div>
    </div>
  );
}

/** A wrong, old or revoked link all answer 404 on purpose (security), so one message covers them. */
export function LinkProblem({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  if (error.code === "not_found") {
    return (
      <ErrorState
        title="This link does not work"
        message="It may be an older link that the organiser has replaced, or part of it may be missing. Open the most recent invitation email, or ask the organiser to send you a new link."
      />
    );
  }
  return <ErrorState title="We could not load your invitation" message={error.message} onRetry={onRetry} />;
}

interface DeclinedProps {
  busy: boolean;
  moved: boolean;
  onChangeMind: () => void;
}

export function DeclinedStep({ busy, moved, onChangeMind }: DeclinedProps) {
  return (
    <section className="ev-card" aria-labelledby="ev-declined">
      <StepTitle id="ev-declined" focusOnMount={moved}>
        Thank you for letting us know
      </StepTitle>
      <p>We have told the organiser that you cannot come. You do not need to do anything else.</p>
      <Button variant="secondary" busy={busy} onClick={onChangeMind}>
        I can come after all
      </Button>
    </section>
  );
}

/** After the change deadline: read-only, with the seat if there is one. */
export function ClosedStep({ view }: { view: AttendeeView }) {
  const { me, map, event } = view;
  const when = event.change_deadline ? formatDeadline(event.change_deadline) : "";
  if (me.seat_id !== null) {
    return (
      <section className="ev-card ev-success" aria-labelledby="ev-closed">
        <StepTitle id="ev-closed" focusOnMount={false}>
          Your seat
        </StepTitle>
        <p className="ev-seat-big">{seatName(me.seat_id, map.seats, map.tables)}</p>
        <p>Seat changes closed on {when}. If something is wrong, reply to your invitation email and the organiser will help.</p>
      </section>
    );
  }
  return (
    <EmptyState title="Seat choice has closed">
      <p>
        The organiser stopped seat changes on {when}. They will place you at a good seat and you will get an email with your table and
        seat.
      </p>
    </EmptyState>
  );
}
