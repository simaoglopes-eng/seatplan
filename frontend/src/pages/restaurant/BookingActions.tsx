// The buttons for one booking: seat, finishing, complete, no-show, move,
// cancel. Only the steps that make sense for its current status are shown,
// so staff in a hurry cannot press a wrong one. Cancel asks first.
import { useState } from "react";
import { setBookingStatus } from "../../api/restaurant";
import type { BookingStatus, StaffBooking } from "../../api/restaurant";
import { Button, Dialog } from "../../design/components";
import { errorMessage } from "./format";
import { nextActions } from "./staffStatus";

interface BookingActionsProps {
  venueId: string;
  booking: StaffBooking;
  onChanged: (message: string) => void;
  onProblem: (message: string) => void;
  onMove: (booking: StaffBooking) => void;
}

const DONE_TEXT: Partial<Record<BookingStatus, string>> = {
  seated: "is seated",
  finishing: "is finishing",
  completed: "is complete; the table is free",
  no_show: "is marked as a no-show",
  cancelled: "is cancelled",
};

export function BookingActions({ venueId, booking, onChanged, onProblem, onMove }: BookingActionsProps) {
  const [busy, setBusy] = useState<BookingStatus | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const change = async (status: BookingStatus): Promise<void> => {
    if (busy) return;
    setBusy(status);
    try {
      await setBookingStatus(venueId, booking.id, status);
      onChanged(`${booking.name} ${DONE_TEXT[status] ?? "is updated"}.`);
    } catch (error) {
      onProblem(errorMessage(error, `Could not update ${booking.name}. Nothing was changed.`));
    } finally {
      setBusy(null);
      setConfirmCancel(false);
    }
  };
  const open = booking.status === "confirmed" || booking.status === "seated";
  return (
    <div className="st-actions" role="group" aria-label={`Actions for ${booking.name}`}>
      <p className="st-action-context">{booking.name} · {booking.time} · {booking.table_labels.join(" + ")}. Status updates take effect now.</p>
      {nextActions(booking.status).map((action) => (
        <Button key={action.status} variant={action.status === "no_show" || action.status === "completed" ? "secondary" : "primary"} disabled={busy !== null && busy !== action.status} busy={busy === action.status} onClick={() => void change(action.status)}>
          {action.label}
        </Button>
      ))}
      {open && (
        <Button variant="secondary" disabled={busy !== null} onClick={() => onMove(booking)}>
          Move or combine
        </Button>
      )}
      {booking.status === "confirmed" && (
        <Button variant="ghost" disabled={busy !== null} className="st-cancel-booking" onClick={() => setConfirmCancel(true)}>
          Cancel booking
        </Button>
      )}
      <Dialog
        open={confirmCancel}
        title={`Cancel ${booking.name}'s booking?`}
        onClose={() => setConfirmCancel(false)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirmCancel(false)}>
              Keep it
            </Button>
            <Button variant="danger" busy={busy === "cancelled"} onClick={() => void change("cancelled")}>
              Yes, cancel
            </Button>
          </>
        }
      >
        <p>The table becomes free for walk-ins and the waitlist. This cannot be undone.</p>
      </Dialog>
    </div>
  );
}
