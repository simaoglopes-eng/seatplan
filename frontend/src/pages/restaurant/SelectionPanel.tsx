// What staff see after tapping a table or an arrival: who is there, their
// needs, and the buttons that make sense right now.
import type { StaffBooking, StaffFloor, StaffTable } from "../../api/restaurant";
import { Badge, Button } from "../../design/components";
import { BookingActions } from "./BookingActions";
import { people, tablesText } from "./format";
import { FLOOR_LOOK } from "./staffStatus";
import { prefWords } from "./prefs";

interface SelectionPanelProps {
  venueId: string;
  floor: StaffFloor;
  table: StaffTable | null;
  booking: StaffBooking | null;
  onChanged: (message: string) => void;
  onProblem: (message: string) => void;
  onMove: (booking: StaffBooking) => void;
  /** Move the booking picked in the arrivals list to the tapped free table. */
  onMoveHere: (booking: StaffBooking, table: StaffTable) => void;
  onWalkin: () => void;
}

export function SelectionPanel(props: SelectionPanelProps) {
  const { table, booking } = props;
  if (!table && !booking) {
    return <p className="rb-muted">Tap a table on the map or a booking in the list to see its details and actions.</p>;
  }
  const bookingHere = table ? (props.floor.bookings.find((b) => b.id === table.booking_id) ?? null) : null;
  const shown = bookingHere ?? booking;
  return (
    <div className="st-selection">
      {table && !shown && <TableHeader table={table} />}
      {table && table.status === "free" && <FreeTableActions {...props} table={table} />}
      {shown && <BookingDetails booking={shown} />}
      {shown && <BookingActions key={shown.id} venueId={props.venueId} booking={shown} onChanged={props.onChanged} onProblem={props.onProblem} onMove={props.onMove} />}
    </div>
  );
}

function TableHeader({ table }: { table: StaffTable }) {
  return (
    <h3 className="rb-service-title">
      Table {table.label} <Badge>{FLOOR_LOOK[table.status].label}</Badge>
      <span className="rb-muted st-small"> Seats {table.min_party} to {table.max_party}</span>
    </h3>
  );
}

function FreeTableActions({ table, booking, onMoveHere, onWalkin }: SelectionPanelProps & { table: StaffTable }) {
  return (
    <div className="st-actions">
      {booking && booking.status === "confirmed" && (
        <Button onClick={() => onMoveHere(booking, table)}>
          Move {booking.name} here
        </Button>
      )}
      <Button variant="secondary" onClick={onWalkin}>
        Seat a walk-in
      </Button>
    </div>
  );
}

function BookingDetails({ booking }: { booking: StaffBooking }) {
  return (
    <div className="st-booking">
      <p className="st-booking-name">
        <strong>{booking.name}</strong>
      </p>
      <p className="rb-muted tabular">
        {booking.time} to {booking.end_time} · {people(booking.party_size)} · {tablesText(booking.table_labels)}
        {booking.source === "walk_in" && ", walk-in"}
      </p>
      <div className="rb-badges"><Badge>{booking.status === "confirmed" ? "Confirmed" : booking.status}</Badge>
        {booking.needs_accessible && <Badge tone="info">Accessible table</Badge>}
        {booking.high_chairs > 0 && <Badge>High chairs: {booking.high_chairs}</Badge>}
      </div>
      {booking.seat && <p className="st-note">Chair requested: {booking.seat.label}</p>}
      {prefWords(booking.prefs) && <p className="st-note">Guest wished for: {prefWords(booking.prefs)}</p>}
      {booking.notes && <p className="st-note">Note: {booking.notes}</p>}
    </div>
  );
}
