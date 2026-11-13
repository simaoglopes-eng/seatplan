// "Where would you like to sit? (optional)" (spec 9.4), shown after a table is
// held. The whole table is already the diner's: the chair is only a wish that
// the restaurant sees and the confirmation repeats. Nothing is held or checked
// against other bookings. If the table has no chairs, or they cannot be
// loaded, the step quietly steps aside and the booking goes on without one.
import { useEffect, useState } from "react";
import { getTableSeats } from "../../api/restaurant";
import { Button, Skeleton } from "../../design/components";
import { HoldCountdown } from "./HoldCountdown";
import { SeatPicker } from "./SeatPicker";
import { StepHeading } from "./StepHeading";
import type { Hold } from "./StepTable";
import { useLoad } from "./useLoad";

interface ChooseSeatProps {
  venueId: string;
  hold: Hold;
  secondsLeft: number | null;
  /** The chair picked earlier, if the diner came back to this step. */
  seatId: number | null;
  /** Continue with this chair, or with none (null). */
  onDone: (seatId: number | null) => void;
  onBackToMap: () => void;
}

export { seatLabel } from "./SeatPicker";

export function ChooseSeat({ venueId, hold, secondsLeft, seatId, onDone, onBackToMap }: ChooseSeatProps) {
  const tableIds = hold.tableIds ?? [hold.tableId];
  const { state } = useLoad(() => getTableSeats(venueId, tableIds), tableIds.join(","));
  const [picked, setPicked] = useState<number | null>(seatId);
  const data = state.status === "ready" ? state.data : null;
  const nothingToChoose = state.status === "error" || (data !== null && data.seats.every((s) => s.state === "blocked"));

  // No usable chair: go on without asking. The booking is for the table anyway.
  useEffect(() => {
    if (nothingToChoose) onDone(null);
  }, [nothingToChoose]);

  if (!data || nothingToChoose) return <Skeleton lines={4} label="Loading the chairs" />;
  const chosen = data.seats.find((s) => s.id === picked) ?? null;

  return (
    <section className="rb-step">
      <StepHeading>Where would you like to sit? (optional)</StepHeading>
      <p className="rb-muted">
        Table {hold.tableLabel} is yours. This only tells the restaurant which chair you would like; it does not change your booking.
      </p>
      {secondsLeft !== null && <HoldCountdown tableLabel={hold.tableLabel} secondsLeft={secondsLeft} />}
      <SeatPicker label={`Chairs at table ${hold.tableLabel}`} data={data} picked={picked} onPick={setPicked} />
      <div className="rb-actions rb-actions-sticky">
        <Button variant="secondary" onClick={onBackToMap}>
          Back to the map
        </Button>
        <Button variant="ghost" onClick={() => onDone(null)}>
          Skip
        </Button>
        <Button disabled={chosen === null} onClick={() => onDone(picked)}>
          {chosen === null ? "Pick a chair to continue" : `Continue with seat ${chosen.label}`}
        </Button>
      </div>
    </section>
  );
}
