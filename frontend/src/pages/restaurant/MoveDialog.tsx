// Move a booking to other tables, or combine tables for a big party.
// This is the keyboard (and screen-reader) way to do what dragging does:
// tick one table to move, tick several in the same group to combine.
import { useState } from "react";
import { moveBooking } from "../../api/restaurant";
import type { StaffBooking, StaffTable } from "../../api/restaurant";
import { Button, Checkbox, Dialog } from "../../design/components";
import { errorMessage, people, tablesText } from "./format";
import { FLOOR_LOOK, moveProblem } from "./staffStatus";

interface MoveDialogProps {
  venueId: string;
  booking: StaffBooking | null;
  tables: StaffTable[];
  onClose: () => void;
  onMoved: (booking: StaffBooking) => void;
}

function tableHint(table: StaffTable): string {
  const group = table.combine_group ? `, combines with group ${table.combine_group}` : "";
  return `Seats ${table.min_party} to ${table.max_party}, ${FLOOR_LOOK[table.status].label.toLowerCase()}${group}`;
}

export function MoveDialog({ venueId, booking, tables, onClose, onMoved }: MoveDialogProps) {
  const [chosen, setChosen] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (!booking) return null;

  const picked = tables.filter((t) => chosen.includes(t.id));
  const check = moveProblem(picked, booking.party_size);
  // Tables already used by this booking are offered too, so staff can add a second table to it.
  const offered = tables.filter((t) => t.status === "free" || booking.table_ids.includes(t.id));
  const toggle = (id: number): void => setChosen(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  const close = (): void => {
    setChosen([]);
    setProblem(null);
    onClose();
  };
  const save = async (): Promise<void> => {
    setBusy(true);
    setProblem(null);
    try {
      onMoved(await moveBooking(venueId, booking.id, chosen));
      setChosen([]);
    } catch (error) {
      setProblem(errorMessage(error, "We could not move the booking. Nothing was changed."));
    } finally {
      setBusy(false);
    }
  };
  const actions = (
    <>
      <Button variant="secondary" disabled={busy} onClick={close}>
        Cancel
      </Button>
      <Button busy={busy} disabled={check !== null} onClick={() => void save()}>
        {picked.length > 1 ? `Combine ${tablesText(picked.map((t) => t.label))}` : "Move here"}
      </Button>
    </>
  );
  return (
    <Dialog open title={`Move ${booking.name}, ${people(booking.party_size)}`} onClose={close} actions={actions}>
      <p className="st-effective-time">{booking.name} · booked at {booking.time} until {booking.end_time}. Moving tables keeps this time.</p>
      <p>Now at {tablesText(booking.table_labels)}. Tick one table to move, or several from the same group to combine them.</p>
      <MoveChoices booking={booking} offered={offered} chosen={chosen} check={check} onToggle={toggle} />
      {problem && (
        <p className="rb-notice rb-notice-error" role="alert">
          {problem}
        </p>
      )}
    </Dialog>
  );
}

interface MoveChoicesProps {
  booking: StaffBooking;
  offered: StaffTable[];
  chosen: number[];
  check: string | null;
  onToggle: (tableId: number) => void;
}

/** The tick list of tables, plus one live sentence saying whether the choice works. */
function MoveChoices({ booking, offered, chosen, check, onToggle }: MoveChoicesProps) {
  const labels = offered.filter((t) => chosen.includes(t.id)).map((t) => t.label);
  return (
    <>
      <fieldset className="st-move-list">
        <legend className="visually-hidden">Tables</legend>
        {offered.map((table) => (
          <Checkbox key={table.id} label={`Table ${table.label}`} hint={tableHint(table)} checked={chosen.includes(table.id)} onChange={() => onToggle(table.id)} />
        ))}
      </fieldset>
      <p className="rb-muted" role="status">
        {chosen.length === 0 ? "No table ticked yet." : (check ?? `${tablesText(labels)} will seat ${people(booking.party_size)}.`)}
      </p>
    </>
  );
}
