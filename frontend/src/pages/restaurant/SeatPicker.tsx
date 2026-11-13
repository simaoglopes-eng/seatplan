// The chairs of one or more tables, as a small map and a list of radio buttons
// (spec 9.4). Used while booking (ChooseSeat) and afterwards (ChangeSeat). The
// list is the accessible way to choose; the map is a second, visual one.
import type { TableSeats } from "../../api/restaurant";
import type { MapSeat, MapTable } from "../../api/types";
import { SeatMap } from "../../seatmap/SeatMap";

/** "Seat 2 · Facing the window", with "(not available)" for a chair that cannot be chosen. */
export function seatLabel(seat: TableSeats["seats"][number]): string {
  const base = seat.phrase ? `Seat ${seat.label} · ${seat.phrase}` : `Seat ${seat.label}`;
  return seat.state === "blocked" ? `${base} (not available)` : base;
}

function asMapSeats(seats: TableSeats["seats"]): MapSeat[] {
  return seats.map((s) => ({ id: s.id, table_id: s.table_id, label: s.label, x: s.x, y: s.y, state: s.state, accessible: s.accessible }));
}

interface SeatPickerProps {
  label: string;
  data: TableSeats;
  picked: number | null;
  onPick: (seatId: number) => void;
}

export function SeatPicker({ label, data, picked, onPick }: SeatPickerProps) {
  const tables: MapTable[] = data.tables.map((t) => ({ ...t, shape: t.shape as MapTable["shape"], state: "free" }));
  const seats = asMapSeats(data.seats);
  return (
    <div className="rb-map-layout">
      <SeatMap label={label} mode="seats" tables={tables} seats={seats} selectable={(id) => seats.find((s) => s.id === id)?.state === "free"} selectedId={picked} onSelect={onPick} />
      <div className="rb-map-side">
        <div role="radiogroup" aria-label="Chair at your table" className="rb-card rb-seat-choices">
          {data.seats.map((seat) => (
            <label key={seat.id} className="rb-seat-choice">
              <input type="radio" name="chair" checked={picked === seat.id} disabled={seat.state === "blocked"} onChange={() => onPick(seat.id)} />
              <span>{seatLabel(seat)}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
