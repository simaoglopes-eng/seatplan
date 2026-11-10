// Route /b/:token: the manage-or-cancel link from the confirmation page and
// email. Anyone with the link can view, change or cancel, so the token is
// the only key; a wrong or old token shows the same "link does not work".
import { useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { cancelBooking, getBooking } from "../../api/restaurant";
import type { BookingView } from "../../api/restaurant";
import { Button, Dialog, EmptyState, ErrorState, PageShell, Skeleton, useToast } from "../../design/components";
import { BookingSummary } from "./BookingSummary";
import { ChangeBookingForm } from "./ChangeBookingForm";
import { errorMessage, formatDate } from "./format";
import { useLoad } from "./useLoad";
import "./restaurant.css";

export default function ManageBookingPage() {
  const { token = "" } = useParams();
  const { state, reload, setData } = useLoad(() => getBooking(token), token);
  return (
    <PageShell title="Your booking">
      <div className="rb-page">
        <h1 className="rb-title">Your booking</h1>
        {state.status === "loading" && <Skeleton lines={5} label="Loading your booking" />}
        {state.status === "error" && <ManageError error={state.error} onRetry={() => reload()} />}
        {state.status === "ready" && <ManageBooking token={token} booking={state.data} onUpdate={setData} />}
      </div>
    </PageShell>
  );
}

function ManageError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (error instanceof ApiError && error.code === "not_found") {
    return (
      <EmptyState title="This link does not work">
        <p>
          It may be mistyped, or the booking was made with a different link. Open the link exactly as it appears in your confirmation email,
          or contact the restaurant.
        </p>
      </EmptyState>
    );
  }
  return <ErrorState title="We could not load your booking" message={errorMessage(error)} onRetry={onRetry} />;
}

/** Only bookings that have not started yet can be changed or cancelled by the diner. */
function isEditable(booking: BookingView): boolean {
  return booking.status === "confirmed";
}

function ManageBooking({ token, booking, onUpdate }: { token: string; booking: BookingView; onUpdate: (b: BookingView) => void }) {
  const toast = useToast();
  // Only GET /b/{token} sends max_party, so the answers to a change or a cancel keep the one we had.
  const update = (next: BookingView): void => onUpdate({ ...next, max_party: next.max_party ?? booking.max_party });
  const changed = (next: BookingView): void => {
    update(next);
    toast.show(`Booking changed: ${next.time}, party of ${next.party_size}.`, "success");
  };
  return (
    <>
      {booking.status === "cancelled" && (
        <p className="rb-notice" role="status">
          This booking is cancelled. The table is free for someone else.
        </p>
      )}
      <BookingSummary booking={booking} />
      {isEditable(booking) ? (
        <>
          <ChangeBookingForm token={token} booking={booking} onChanged={changed} />
          <CancelSection token={token} booking={booking} onCancelled={update} />
        </>
      ) : (
        booking.status !== "cancelled" && <p className="rb-muted">This booking can no longer be changed online. Please contact the restaurant.</p>
      )}
      <p>
        <a href={`/r/${encodeURIComponent(booking.venue_public_id)}`}>Make another booking at {booking.venue_name}</a>
      </p>
    </>
  );
}

function CancelSection({ token, booking, onCancelled }: { token: string; booking: BookingView; onCancelled: (b: BookingView) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const confirm = async (): Promise<void> => {
    setBusy(true);
    setProblem(null);
    try {
      // The server's answer, not a local copy: it no longer lists the released table.
      const cancelled = await cancelBooking(token);
      setOpen(false);
      onCancelled(cancelled);
    } catch (error) {
      setProblem(errorMessage(error, "We could not cancel. Your booking is still in place; please try again."));
    } finally {
      setBusy(false);
    }
  };
  const actions = (
    <>
      <Button variant="secondary" onClick={() => setOpen(false)}>
        Keep my booking
      </Button>
      <Button variant="danger" busy={busy} onClick={() => void confirm()}>
        Yes, cancel it
      </Button>
    </>
  );
  return (
    <div className="rb-card">
      <h2 className="rb-service-title">Cannot make it?</h2>
      <p>Cancelling frees the table for someone on the waitlist.</p>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Cancel booking
      </Button>
      <Dialog open={open} title="Cancel this booking?" onClose={() => setOpen(false)} actions={actions}>
        <p>
          {formatDate(booking.date)} at {booking.time}, party of {booking.party_size}. This cannot be undone; you would need to book again.
        </p>
        {problem && (
          <p className="rb-notice rb-notice-error" role="alert">
            {problem}
          </p>
        )}
      </Dialog>
    </div>
  );
}
