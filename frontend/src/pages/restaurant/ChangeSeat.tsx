// "Change seat" on the manage page (spec 9.4). The chair is only a wish, so the
// diner can pick another one at their table, or take the wish away, at any time
// while the booking can still be changed. The booking itself does not move.
import { useState } from "react";
import { changeSeat, getTableSeats } from "../../api/restaurant";
import type { BookingView } from "../../api/restaurant";
import { Button, Skeleton } from "../../design/components";
import { errorMessage } from "./format";
import { SeatPicker } from "./SeatPicker";
import { useLoad } from "./useLoad";

interface Props {
  token: string;
  booking: BookingView;
  onChanged: (booking: BookingView) => void;
}

export function ChangeSeat({ token, booking, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const tableIds = booking.table_ids ?? [];
  // A booking without table ids (an old answer) has no chairs to offer.
  if (tableIds.length === 0) return null;
  return (
    <section className="rb-card" aria-labelledby="rb-seat-title">
      <h2 id="rb-seat-title" className="rb-service-title">
        Your chair
      </h2>
      <p>{booking.seat ? `You asked for seat ${booking.seat.label}.` : "You have not picked a chair. The table is yours either way."}</p>
      {open ? (
        <Picker token={token} booking={booking} tableIds={tableIds} onDone={() => setOpen(false)} onChanged={onChanged} />
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {booking.seat ? "Change seat" : "Pick a seat"}
        </Button>
      )}
    </section>
  );
}

function Picker({ token, booking, tableIds, onDone, onChanged }: Props & { tableIds: number[]; onDone: () => void }) {
  const { state, reload } = useLoad(() => getTableSeats(booking.venue_public_id, tableIds), tableIds.join(","));
  const [picked, setPicked] = useState<number | null>(booking.seat?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  const save = async (seatId: number | null): Promise<void> => {
    setBusy(true);
    setProblem("");
    try {
      onChanged(await changeSeat(token, seatId));
      onDone();
    } catch (error) {
      setProblem(errorMessage(error, "We could not change the seat. Your booking is as it was; please try again."));
    } finally {
      setBusy(false);
    }
  };

  if (state.status === "loading") return <Skeleton lines={3} label="Loading the chairs" />;
  if (state.status === "error") {
    return (
      <p role="alert" className="rb-notice rb-notice-error">
        We could not load the chairs.{" "}
        <Button variant="secondary" onClick={() => reload()}>
          Try again
        </Button>
      </p>
    );
  }
  const data = state.data;
  if (!data.seats.some((s) => s.state === "free")) {
    return <p className="rb-muted">No chair at your table can be picked. The table is still yours.</p>;
  }
  const current = booking.seat?.id ?? null;
  return (
    <>
      <SeatPicker label={`Chairs at your table ${booking.table_labels.join(", ")}`} data={data} picked={picked} onPick={setPicked} />
      {problem && (
        <p role="alert" className="rb-notice rb-notice-error">
          {problem}
        </p>
      )}
      <div className="rb-actions">
        <Button variant="secondary" onClick={onDone}>
          Keep as it is
        </Button>
        {current !== null && (
          <Button variant="ghost" busy={busy} onClick={() => void save(null)}>
            Remove my choice
          </Button>
        )}
        <Button busy={busy} disabled={picked === null || picked === current} onClick={() => void save(picked)}>
          Save seat
        </Button>
      </div>
    </>
  );
}
