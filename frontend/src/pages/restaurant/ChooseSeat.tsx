// "Where would you like to sit? (optional)" (spec 9.4), shown after a table is
// held. The whole table is already the diner's: the chair is only a wish that
// the restaurant sees and the confirmation repeats. Nothing is held or checked
// against other bookings. If the table has no chairs, or they cannot be
// loaded, the step quietly steps aside and the booking goes on without one.
import { useEffect, useState } from "react";
import { getTableSeats } from "../../api/restaurant";
import { Button, Skeleton } from "../../design/components";
import { guests } from "./format";
import { HoldCountdown } from "./HoldCountdown";
import { SeatPicker } from "./SeatPicker";
import { StepHeading } from "./StepHeading";
import type { Hold } from "./StepTable";
import { useLoad } from "./useLoad";

interface ChooseSeatProps {
  venueId: string;
  hold: Hold;
  /** The party size, for the "2 guests" chip. */
  party?: number;
  secondsLeft: number | null;
  /** The chair picked earlier, if the diner came back to this step. */
  seatId: number | null;
  /** Continue with this chair, or with none (null). */
  onDone: (seatId: number | null, label?: string | null) => void;
  onBackToMap: () => void;
}

export { seatLabel } from "./SeatPicker";

export function ChooseSeat({ venueId, hold, party, secondsLeft, seatId, onDone, onBackToMap }: ChooseSeatProps) {
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
    <section className="rb-step rb5-chair">
      <div className="rb5-chair-top">
        <Button variant="ghost" onClick={onBackToMap}>
          <span aria-hidden="true">‹</span> Your details
        </Button>
        {secondsLeft !== null && <HoldCountdown variant="chip" tableLabel={hold.tableLabel} secondsLeft={secondsLeft} />}
      </div>
      <StepHeading>Request a chair</StepHeading>
      <p className="rb-muted">Optional · The restaurant will see your preference. It does not change your booking.</p>
      <p className="rb5-chair-table">
        <strong>Table {hold.tableLabel}</strong>
        {party ? <span className="rb5-chip">{guests(party)}</span> : null}
      </p>
      <SeatPicker label={`Chairs at table ${hold.tableLabel}`} data={data} picked={picked} onPick={setPicked} />
      <div className="rb-card rb5-chair-note" aria-live="polite">
        {chosen ? (
          <>
            <strong>{chosen.phrase ? `${hold.tableLabel}-${chosen.label} · ${chosen.phrase}` : `${hold.tableLabel}-${chosen.label}`}</strong>
            <p className="rb-muted">A chair request is subject to the restaurant's confirmation.</p>
          </>
        ) : (
          <p className="rb-muted">Pick a chair on the plan or from the list. A chair request is subject to the restaurant's confirmation.</p>
        )}
      </div>
      <div className="rb5-chair-actions">
        <Button disabled={chosen === null} onClick={() => onDone(picked, chosen ? `${hold.tableLabel}-${chosen.label}` : null)}>
          Save chair request <span aria-hidden="true">→</span>
        </Button>
        <Button variant="ghost" onClick={() => onDone(null)}>
          Continue without a request
        </Button>
      </div>
    </section>
  );
}
