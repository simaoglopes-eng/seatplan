// "Where would you like to sit? (optional)" (spec 9.4), shown after a table is
// held. The whole table is already the diner's: the chair is only a wish that
// the restaurant sees and the confirmation repeats. Nothing is held or checked
// against other bookings. If the table has no chairs, or they cannot be
// loaded, the step quietly steps aside and the booking goes on without one.
import { useEffect, useState } from "react";
import { getTableSeats } from "../../api/restaurant";
import type { TableSeats } from "../../api/restaurant";
import type { MapSeat, MapTable } from "../../api/types";
import { Button, Skeleton } from "../../design/components";
import { SeatMap } from "../../seatmap/SeatMap";
import { HoldCountdown } from "./HoldCountdown";
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

/** "Seat 2 · Facing the window", with "(not available)" for a chair that cannot be chosen. */
export function seatLabel(seat: TableSeats["seats"][number]): string {
  const base = seat.phrase ? `Seat ${seat.label} · ${seat.phrase}` : `Seat ${seat.label}`;
  return seat.state === "blocked" ? `${base} (not available)` : base;
}

function asMapSeats(seats: TableSeats["seats"]): MapSeat[] {
  return seats.map((s) => ({ id: s.id, table_id: s.table_id, label: s.label, x: s.x, y: s.y, state: s.state, accessible: s.accessible }));
}

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
  const tables: MapTable[] = data.tables.map((t) => ({ ...t, shape: t.shape as MapTable["shape"], state: "free" }));
  const seats = asMapSeats(data.seats);
  const chosen = data.seats.find((s) => s.id === picked) ?? null;

  return (
    <section className="rb-step">
      <StepHeading>Where would you like to sit? (optional)</StepHeading>
      <p className="rb-muted">
        Table {hold.tableLabel} is yours. This only tells the restaurant which chair you would like; it does not change your booking.
      </p>
      {secondsLeft !== null && <HoldCountdown tableLabel={hold.tableLabel} secondsLeft={secondsLeft} />}
      <div className="rb-map-layout">
        <SeatMap
          label={`Chairs at table ${hold.tableLabel}`}
          mode="seats"
          tables={tables}
          seats={seats}
          selectable={(id) => seats.find((s) => s.id === id)?.state === "free"}
          selectedId={picked}
          onSelect={setPicked}
        />
        <div className="rb-map-side">
          <div role="radiogroup" aria-label="Chair at your table" className="rb-card rb-seat-choices">
            {data.seats.map((seat) => (
              <label key={seat.id} className="rb-seat-choice">
                <input
                  type="radio"
                  name="chair"
                  checked={picked === seat.id}
                  disabled={seat.state === "blocked"}
                  onChange={() => setPicked(seat.id)}
                />
                <span>{seatLabel(seat)}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
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
