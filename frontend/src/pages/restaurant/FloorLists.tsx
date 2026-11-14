// The two lists beside the staff map:
// - the table board: one tile per table with its status in words and pattern,
//   readable from a step away, and a drop target for dragged bookings;
// - upcoming arrivals: bookings still to come, each one draggable.
import { useId } from "react";
import type { DragEvent } from "react";
import type { StaffBooking, StaffFloor, StaffTable } from "../../api/restaurant";
import { Badge } from "../../design/components";
import { SEAT_RADIUS } from "../../seatmap/geometry";
import { PatternDefs, SeatGlyph, safeId } from "../../seatmap/glyphs";
import { people, tablesText } from "./format";
import { FLOOR_LOOK, bookingOnTable } from "./staffStatus";

/** The drag payload type. A custom type, so dropping random text does nothing. */
export const BOOKING_DRAG_TYPE = "application/x-seatplan-booking";

export function readDraggedBooking(event: DragEvent): string | null {
  return event.dataTransfer.getData(BOOKING_DRAG_TYPE) || null;
}

interface TableBoardProps {
  floor: StaffFloor;
  selectedId: number | null;
  onSelect: (tableId: number) => void;
  onDropBooking: (bookingId: string, tableId: number) => void;
}

export function TableBoard({ floor, selectedId, onSelect, onDropBooking }: TableBoardProps) {
  const drop = (event: DragEvent, table: StaffTable): void => {
    event.preventDefault();
    const bookingId = readDraggedBooking(event);
    if (bookingId) onDropBooking(bookingId, table.id);
  };
  return (
    <ul className="st-board" aria-label="Tables">
      {floor.tables.map((table) => {
        const look = FLOOR_LOOK[table.status];
        const booking = bookingOnTable(floor, table);
        return (
          <li key={table.id} onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, table)}>
            <button type="button" className={`st-tile st-tile-${table.status}`} aria-pressed={table.id === selectedId} onClick={() => onSelect(table.id)}>
              <span className="st-tile-label">{table.label}</span>
              <span className="st-tile-status">
                <MiniGlyph table={table} />
                {look.label}
              </span>
              <span className="st-tile-detail">{booking ? `${booking.name}, ${booking.party_size}` : `Seats ${table.max_party}`}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The status pattern, small, so the tile matches the map without relying on colour. */
function MiniGlyph({ table }: { table: StaffTable }) {
  const prefix = safeId(useId());
  const half = SEAT_RADIUS + 3;
  return (
    <svg className="st-mini-glyph" viewBox={`${-half} ${-half} ${half * 2} ${half * 2}`} aria-hidden="true">
      <PatternDefs prefix={prefix} />
      <SeatGlyph state={FLOOR_LOOK[table.status].glyph} accessible={table.accessible ?? false} prefix={prefix} />
    </svg>
  );
}

interface ArrivalsProps {
  arrivals: StaffBooking[];
  selectedId: string | null;
  onSelect: (bookingId: string) => void;
  services?: StaffFloor["services"];
}

export function ArrivalsList({ arrivals, selectedId, onSelect, services = [] }: ArrivalsProps) {
  if (arrivals.length === 0) return <p className="rb-muted">No more arrivals expected for this day.</p>;
  const startDrag = (event: DragEvent, booking: StaffBooking): void => {
    event.dataTransfer.setData(BOOKING_DRAG_TYPE, booking.id);
    event.dataTransfer.effectAllowed = "move";
  };
  return (
    <ol className="st-arrivals" aria-label="Upcoming arrivals">
      {arrivals.map((booking, index) => (
        <li key={booking.id} draggable onDragStart={(e) => startDrag(e, booking)} className="st-arrival">
          {(index === 0 || arrivals[index - 1].time !== booking.time) && <p className="st-arrival-group">{services.find(service => service.start_time <= booking.time && booking.time < service.end_time)?.name ?? "Arrivals"} · {booking.time}</p>}
          <button type="button" className="st-arrival-button" aria-pressed={booking.id === selectedId} onClick={() => onSelect(booking.id)}>
            <span className="st-arrival-time tabular">{booking.time}</span>
            <span>
              <strong>{booking.name}</strong>, {people(booking.party_size)}
              <span className="st-arrival-table">{tablesText(booking.table_labels)}</span>
            </span>
          </button>
          <span className="rb-badges">
            {booking.needs_accessible && <Badge tone="info">Accessible</Badge>}
            {booking.high_chairs > 0 && <Badge>High chair x{booking.high_chairs}</Badge>}
            {booking.notes && <Badge tone="warning">Note</Badge>}
          </span>
        </li>
      ))}
    </ol>
  );
}
