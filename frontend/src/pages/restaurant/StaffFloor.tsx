// The live floor during service. Built to be read standing up: status counts
// in big type, a table board with words and patterns, and the map. Every
// change by anyone (diners booking online, other staff) arrives through
// useLive within about 2 seconds.
import { useState } from "react";
import type { DragEvent } from "react";
import { getFloor, moveBooking, venueDayScope } from "../../api/restaurant";
import type { StaffBooking, StaffFloor as Floor, StaffTable } from "../../api/restaurant";
import { useLive } from "../../api/useLive";
import { Button, ErrorState, Skeleton, useToast } from "../../design/components";
import { SeatMap } from "../../seatmap/SeatMap";
import { ArrivalsList, TableBoard, readDraggedBooking } from "./FloorLists";
import { errorMessage, needsSignIn, tablesText } from "./format";
import { MapKey } from "./MapKey";
import { MoveDialog } from "./MoveDialog";
import { SelectionPanel } from "./SelectionPanel";
import { SignInPrompt } from "./SignInPrompt";
import { FLOOR_LOOK, FLOOR_ORDER, STAFF_KEY, countByStatus, describeStaffTables, staffMapTables, upcomingArrivals } from "./staffStatus";
import { TimeScrubber, nowTime } from "./TimeScrubber";
import { WalkinDialog } from "./WalkinDialog";
import { useLoad } from "./useLoad";
import { WhatIfCard } from "./WhatIf";

export function StaffFloor({ venueId, date }: { venueId: string; date: string }) {
  const [time, setTime] = useState(nowTime);
  const { state, reload } = useLoad(() => getFloor(venueId, date, time), `${date}|${time}`);
  useLive(venueDayScope(venueId, date), () => reload(true));
  if (state.status === "loading") return <Skeleton lines={8} label="Loading the floor" />;
  if (state.status === "error") {
    if (needsSignIn(state.error)) return <SignInPrompt venueId={venueId} />;
    return <ErrorState title="We could not load the floor" message={errorMessage(state.error)} onRetry={() => reload()} />;
  }
  return <FloorView venueId={venueId} date={date} floor={state.data} time={time} onTime={setTime} onRefresh={() => reload(true)} />;
}

interface FloorViewProps {
  venueId: string;
  /** The day on screen: what-if and walk-ins are asked about this day, not the server's today. */
  date: string;
  floor: Floor;
  time: string;
  onTime: (time: string) => void;
  onRefresh: () => void;
}

/** The id of the table under the pointer when something is dropped on the map. */
function tableIdAt(event: DragEvent): number | null {
  const element = document.elementFromPoint(event.clientX, event.clientY)?.closest('[role="option"]');
  // SeatMap gives each table the DOM id "<map id>-t<table id>" (seatmap/Targets.tsx, targetDomId).
  const match = element?.id.match(/-t(\d+)$/);
  return match ? Number(match[1]) : null;
}

/** Moving bookings by drag and drop or by "Move here". Reports the result in words. */
function useMoves(venueId: string, floor: Floor, done: (message: string, tableIds: number[]) => void, problem: (message: string) => void) {
  const moveTo = (id: string, target: StaffTable): void => {
    const moved = floor.bookings.find((b) => b.id === id);
    const name = moved?.name ?? "The booking";
    moveBooking(venueId, id, [target.id]).then(
      () => done(`${name} moved to table ${target.label}.`, [...(moved?.table_ids ?? []), target.id]),
      (error: unknown) => problem(errorMessage(error, `Could not move ${name} to table ${target.label}.`)),
    );
  };
  const dropOn = (id: string, targetId: number | null): void => {
    const target = floor.tables.find((t) => t.id === targetId);
    if (target) moveTo(id, target);
  };
  const dropOnMap = (event: DragEvent): void => {
    event.preventDefault();
    const id = readDraggedBooking(event);
    if (id) dropOn(id, tableIdAt(event));
  };
  return { moveTo, dropOn, dropOnMap };
}

function FloorView({ venueId, date, floor, time, onTime, onRefresh }: FloorViewProps) {
  const toast = useToast();
  const [tableId, setTableId] = useState<number | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [moving, setMoving] = useState<StaffBooking | null>(null);
  const [walkin, setWalkin] = useState(false);
  const [spoken, setSpoken] = useState("");
  // The tables this member of staff just changed: the map shows that change without reading it out again.
  const [actedOn, setActedOn] = useState<number[]>([]);
  const table = floor.tables.find((t) => t.id === tableId) ?? null;
  const booking = floor.bookings.find((b) => b.id === bookingId) ?? null;
  // Every successful action: say it out loud, close dialogs, fetch the floor again.
  const done = (message: string, tableIds: number[]): void => {
    setActedOn(tableIds);
    setSpoken(message);
    toast.show(message, "success");
    setMoving(null);
    setWalkin(false);
    onRefresh();
  };
  const problem = (message: string): void => toast.show(message, "danger");
  const { moveTo, dropOn, dropOnMap } = useMoves(venueId, floor, done, problem);

  return (
    <div className="st-floor">
      <FloorHeader floor={floor} time={time} onTime={onTime} onWalkin={() => setWalkin(true)} />
      <div className="st-grid">
        <div className="st-main">
          <div onDragOver={(e) => e.preventDefault()} onDrop={dropOnMap}>
            <SeatMap
              label={`Floor at ${time}`}
              mode="tables"
              tables={staffMapTables(floor.tables)}
              seats={floor.seats}
              zones={floor.zones}
              selectable={() => true}
              selectedId={tableId}
              describe={describeStaffTables(floor.tables)}
              actedOn={actedOn}
              onSelect={setTableId}
            />
          </div>
          <MapKey entries={STAFF_KEY} label="Table status key" />
          <TableBoard floor={floor} selectedId={tableId} onSelect={setTableId} onDropBooking={dropOn} />
        </div>
        <aside className="st-side" aria-label="Details and arrivals">
          <section className="rb-card" aria-label="Selected">
            <SelectionPanel venueId={venueId} floor={floor} table={table} booking={booking} onChanged={(message) => done(message, table ? [table.id] : (booking?.table_ids ?? []))} onProblem={problem} onMove={setMoving} onMoveHere={(b, t) => moveTo(b.id, t)} onWalkin={() => setWalkin(true)} />
          </section>
          <section className="rb-card">
            <h2 className="rb-service-title">Upcoming arrivals</h2>
            <p className="rb-muted st-small">Drag a booking onto a table to move it, or select it and use Move.</p>
            <ArrivalsList arrivals={upcomingArrivals(floor.bookings)} selectedId={bookingId} onSelect={setBookingId} />
          </section>
          <WhatIfCard venueId={venueId} date={date} time={time} />
        </aside>
      </div>
      <MoveDialog venueId={venueId} booking={moving} tables={floor.tables} onClose={() => setMoving(null)} onMoved={(b) => done(`${b.name} is now at ${tablesText(b.table_labels)}.`, [...(moving?.table_ids ?? []), ...b.table_ids])} />
      <WalkinDialog venueId={venueId} date={date} time={time} open={walkin} onClose={() => setWalkin(false)} onSeated={(b) => done(`Walk-in of ${b.party_size} seated at ${tablesText(b.table_labels)}.`, b.table_ids)} />
      <span className="visually-hidden" role="status" aria-live="polite">
        {spoken}
      </span>
    </div>
  );
}

function FloorHeader({ floor, time, onTime, onWalkin }: { floor: Floor; time: string; onTime: (t: string) => void; onWalkin: () => void }) {
  const counts = countByStatus(floor.tables);
  return (
    <div className="st-floor-head">
      <ul className="st-counts" aria-label="Tables by status">
        {FLOOR_ORDER.map((status) => (
          <li key={status} className={`st-count st-count-${status}`}>
            <span className="st-count-number tabular">{counts[status]}</span> {FLOOR_LOOK[status].label}
          </li>
        ))}
      </ul>
      <TimeScrubber services={floor.services} time={time} onChange={onTime} />
      <Button onClick={onWalkin}>New walk-in</Button>
    </div>
  );
}
