// Route /b/:token: the manage-or-cancel link from the confirmation page and
// email. Anyone with the link can view, change or cancel, so the token is
// the only key; a wrong or old token shows the same "link does not work".
import { useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { cancelBooking, getBooking } from "../../api/restaurant";
import type { BookingView } from "../../api/restaurant";
import { Badge, Button, Dialog, EmptyState, ErrorState, PageShell, Skeleton, useToast } from "../../design/components";
import { BookingRows } from "./BookingSummary";
import { ChangeBookingForm } from "./ChangeBookingForm";
import { ChangeSeat } from "./ChangeSeat";
import { errorMessage, formatDate, people } from "./format";
import { DirectionsLink, VenueCard, usePublicVenue } from "./VenueCard";
import { useLoad } from "./useLoad";
import "./restaurant.css";

export default function ManageBookingPage() {
  const { token = "" } = useParams();
  const { state, reload, setData } = useLoad(() => getBooking(token), token);
  return (
    <PageShell title="Your booking">
      <div className="rb-page">
        <h1 className="rb-title rb5-page-title">Manage your booking</h1>
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
  // Which part of the booking is being edited: opened by the diner's intent, one at a time.
  const [panel, setPanel] = useState<"time" | "chair" | null>(null);
  const [cancelling, setCancelling] = useState(false);
  // Only GET /b/{token} sends max_party, so the answers to a change or a cancel keep the one we had.
  const update = (next: BookingView): void => onUpdate({ ...next, max_party: next.max_party ?? booking.max_party });
  const changed = (next: BookingView): void => {
    update(next);
    setPanel(null);
    toast.show(`Booking changed: ${next.time}, party of ${next.party_size}.`, "success");
  };
  const toggle = (which: "time" | "chair"): void => setPanel(panel === which ? null : which);
  const hasChairs = (booking.table_ids ?? []).length > 0;
  const venue = usePublicVenue(booking.venue_public_id);
  const statusBadge = booking.status === "confirmed" ? <Badge tone="success">Confirmed</Badge> : booking.status === "cancelled" ? <Badge tone="danger">Cancelled</Badge> : null;
  return (
    <>
      <p className="rb5-manage-sub">
        <span className="rb-muted">{booking.venue_name}</span> {statusBadge}
      </p>
      {booking.status === "cancelled" && (
        <p className="rb-notice" role="status">
          This booking is cancelled. The table is free for someone else.
        </p>
      )}
      <div className="rb5-two rb5-manage">
        <section className="rb-card rb5-details-card" aria-label="Reservation details">
          <h2 className="rb5-card-title">Reservation details</h2>
          <BookingRows booking={booking} />
          <div className="rb5-reference">
            <span className="rb-muted">Reference {booking.public_id.slice(0, 8).toUpperCase()}</span>
            <DirectionsLink venue={venue} />
          </div>
        </section>
        <div className="rb5-manage-side">
          <VenueCard booking={booking} venue={venue} />
          {renderActions()}
        </div>
      </div>
      <p>
        <a href={`/r/${encodeURIComponent(booking.venue_public_id)}`}>Make another booking at {booking.venue_name}</a>
      </p>
    </>
  );

  function renderActions() {
    if (!isEditable(booking)) {
      return booking.status !== "cancelled" ? <p className="rb-muted">This booking can no longer be changed online. Please contact the restaurant.</p> : null;
    }
    return (
      <section className="rb-card rb5-change" aria-label="Make a change">
        <h2 className="rb5-card-title">Make a change</h2>
        <>
          <div className="rb-manage-actions" role="group" aria-label="Manage this booking">
            <Button variant="secondary" aria-expanded={panel === "time"} aria-controls="rb-panel-time" onClick={() => toggle("time")}>
              Change time or guests
            </Button>
            {hasChairs && (
              <Button variant="secondary" aria-expanded={panel === "chair"} aria-controls="rb-panel-chair" onClick={() => toggle("chair")}>
                {booking.seat ? "Change chair request" : "Request a chair"}
              </Button>
            )}
            <Button variant="ghost" className="rb-danger-link" onClick={() => setCancelling(true)}>
              Cancel booking
            </Button>
          </div>
          {panel === "time" && (
            <div id="rb-panel-time">
              <ChangeBookingForm token={token} booking={booking} onChanged={changed} />
            </div>
          )}
          {panel === "chair" && (
            <div id="rb-panel-chair">
              <ChangeSeat
                token={token}
                booking={booking}
                onClose={() => setPanel(null)}
                onChanged={(next) => {
                  update(next);
                  toast.show(next.seat ? "Chair request updated." : "Chair request removed.", "success");
                }}
              />
            </div>
          )}
          <CancelDialog token={token} booking={booking} open={cancelling} onClose={() => setCancelling(false)} onCancelled={update} />
        </>
      </section>
    );
  }
}

/** The safe way out ("Keep booking") comes first, so it is where focus starts; Escape also keeps the booking. */
function CancelDialog({ token, booking, open, onClose, onCancelled }: { token: string; booking: BookingView; open: boolean; onClose: () => void; onCancelled: (b: BookingView) => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const confirm = async (): Promise<void> => {
    setBusy(true);
    setProblem(null);
    try {
      // The server's answer, not a local copy: it no longer lists the released table.
      const cancelled = await cancelBooking(token);
      onClose();
      onCancelled(cancelled);
    } catch (error) {
      setProblem(errorMessage(error, "We could not cancel. Your booking is still in place; please try again."));
    } finally {
      setBusy(false);
    }
  };
  const actions = (
    <>
      <Button variant="secondary" onClick={onClose}>
        Keep booking
      </Button>
      <Button variant="danger" busy={busy} onClick={() => void confirm()}>
        Cancel booking
      </Button>
    </>
  );
  return (
    <Dialog open={open} title="Cancel this booking?" onClose={onClose} actions={actions}>
      <p>
        <strong>{booking.venue_name}</strong>
        <br />
        {formatDate(booking.date)}, {booking.time} to {booking.end_time} · {people(booking.party_size)}
      </p>
      <p>The table is released straight away and cannot be taken back. You would need to book again.</p>
      {problem && (
        <p className="rb-notice rb-notice-error" role="alert">
          {problem}
        </p>
      )}
    </Dialog>
  );
}
