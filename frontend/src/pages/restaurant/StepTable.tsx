// Step 3: the floor map for the chosen time. Tapping a free table holds it
// for 5 minutes; "Choose for me" lets the optimiser pick. Live updates
// redraw the map within about 2 seconds when someone else books a table.
import { useEffect, useState } from "react";
import { ApiError } from "../../api/client";
import { getDinerMap, holdTable, venueDayScope } from "../../api/restaurant";
import type { DinerMap, PartyNeeds } from "../../api/restaurant";
import { useLive } from "../../api/useLive";
import { Button, ErrorState, Skeleton } from "../../design/components";
import { SeatMap } from "../../seatmap/SeatMap";
import { errorMessage, formatDate, people } from "./format";
import { HoldCountdown } from "./HoldCountdown";
import { DINER_KEY, MapKey } from "./MapKey";
import { StepHeading } from "./StepHeading";
import { ConflictNotice, SuggestionCard, TableList } from "./TablePanels";
import { alternatives, describeDinerTables, isPickable, tablesForMap } from "./tableView";
import { releaseQuietly } from "./useBookingFlow";
import { useLoad } from "./useLoad";

export interface Hold {
  holdId: string;
  tableId: number;
  tableLabel: string;
  expiresAt: string;
}

interface StepTableProps {
  venueId: string;
  needs: PartyNeeds;
  time: string;
  hold: Hold | null;
  secondsLeft: number | null;
  /** A message carried over from another step, e.g. "your hold ended while you typed". */
  carriedNotice: string | null;
  onHold: (hold: Hold | null) => void;
  onNext: () => void;
  onBack: () => void;
}

interface Conflict {
  message: string;
  failedId: number | null;
}

/** The words for a failed hold. A 409 means someone was faster; anything else is a plain problem. */
function holdFailure(error: unknown, tableId: number | null, label: string | null): Conflict | string {
  const lost = error instanceof ApiError && (error.code === "seat_taken" || error.code === "conflict");
  if (!lost) return errorMessage(error, "We could not hold that table. Please try again.");
  const message = label ? `Table ${label} was just taken by someone else.` : "The last table for your party was just taken.";
  return { message, failedId: tableId };
}

export function StepTable(props: StepTableProps) {
  const { venueId, needs, time, hold, onHold } = props;
  const key = `${needs.date}|${time}|${needs.party}|${needs.needs_accessible}|${needs.high_chairs}`;
  const { state, reload } = useLoad(() => getDinerMap(venueId, needs, time), key);
  // Someone else's booking bumps the venue-day version; we then quietly fetch the map again.
  useLive(venueDayScope(venueId, needs.date), () => reload(true));
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<Conflict | null>(props.carriedNotice ? { message: props.carriedNotice, failedId: null } : null);
  const [problem, setProblem] = useState<string | null>(null);
  const [spoken, setSpoken] = useState("");
  const map = state.status === "ready" ? state.data : null;

  // A live update shows our held table as booked: the hold was lost (it had expired).
  useEffect(() => {
    const ours = hold && map?.tables.find((t) => t.id === hold.tableId);
    if (!hold || !ours || ours.state !== "taken") return;
    setConflict({ message: `Table ${hold.tableLabel} was just booked by someone else.`, failedId: hold.tableId });
    onHold(null);
  }, [map, hold, onHold]);

  const take = async (tableId: number | null): Promise<void> => {
    const label = map?.tables.find((t) => t.id === tableId)?.label ?? null;
    setBusy(true);
    setConflict(null);
    setProblem(null);
    try {
      const result = await holdTable(venueId, needs, time, tableId);
      onHold({ holdId: result.hold_id, tableId: result.table.id, tableLabel: result.table.label, expiresAt: result.expires_at });
      setSpoken(`Table ${result.table.label} is held for you for 5 minutes.`);
      // Only now give the old table back: if the new hold had failed, the diner would still have the old one.
      await releaseQuietly(venueId, hold);
    } catch (error) {
      const failure = holdFailure(error, tableId, label);
      if (typeof failure === "string") setProblem(failure);
      else setConflict(failure);
    } finally {
      setBusy(false);
      reload(true);
    }
  };

  return (
    <section className="rb-step">
      <StepHeading>Choose your table</StepHeading>
      <p className="rb-muted">
        {formatDate(needs.date)} at {time}, {people(needs.party)}.
      </p>
      {state.status === "loading" && <Skeleton lines={6} label="Loading the floor plan" />}
      {state.status === "error" && <ErrorState title="We could not load the floor plan" message={errorMessage(state.error)} onRetry={() => reload()} />}
      {map && (
        <TableStepBody map={map} {...props} busy={busy} conflict={conflict} problem={problem} onTake={(id) => void take(id)} />
      )}
      <span className="visually-hidden" role="status" aria-live="polite">
        {spoken}
      </span>
    </section>
  );
}

interface BodyProps extends StepTableProps {
  map: DinerMap;
  busy: boolean;
  conflict: Conflict | null;
  problem: string | null;
  onTake: (tableId: number | null) => void;
}

function TableStepBody({ map, hold, secondsLeft, busy, conflict, problem, onTake, onNext, onBack, needs, time }: BodyProps) {
  const heldId = hold && secondsLeft !== 0 ? hold.tableId : null;
  const pickable = new Set(map.tables.filter(isPickable).map((t) => t.id));
  const highlight = new Set(map.recommended?.table_ids ?? []);
  const nothingFree = pickable.size === 0 && heldId === null;
  return (
    <>
      {conflict && <ConflictNotice message={conflict.message} options={alternatives(map, conflict.failedId, needs.party)} busy={busy} onTake={onTake} />}
      {problem && (
        <p className="rb-notice rb-notice-error" role="alert">
          {problem}
        </p>
      )}
      {hold && secondsLeft !== null && <HoldCountdown tableLabel={hold.tableLabel} secondsLeft={secondsLeft} />}
      <div className="rb-map-layout">
        <SeatMap
          label={`Floor plan for ${time}`}
          mode="tables"
          tables={tablesForMap(map, heldId)}
          seats={map.seats}
          zones={map.zones}
          selectable={(id) => pickable.has(id)}
          selectedId={heldId}
          ownId={heldId}
          highlight={highlight}
          describe={describeDinerTables(map)}
          onSelect={onTake}
        />
        <div className="rb-map-side">
          {nothingFree ? (
            <p className="rb-notice">No table for {people(needs.party)} is free at {time} any more. Please go back and pick another time.</p>
          ) : (
            <SuggestionCard map={map} busy={busy} onTake={onTake} onChooseForMe={() => onTake(null)} />
          )}
          <MapKey entries={DINER_KEY} />
        </div>
      </div>
      <TableList tables={map.tables} map={map} heldId={heldId} busy={busy} onTake={onTake} />
      <div className="rb-actions rb-actions-sticky">
        <Button variant="secondary" onClick={onBack}>
          Change time
        </Button>
        <Button onClick={onNext} disabled={heldId === null}>
          {heldId === null ? "Pick a table to continue" : `Continue with table ${hold?.tableLabel}`}
        </Button>
      </div>
    </>
  );
}
