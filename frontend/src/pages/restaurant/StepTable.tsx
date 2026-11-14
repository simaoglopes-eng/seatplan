// Step 3: the floor map for the chosen time. Tapping a free table holds it
// for 5 minutes; "Choose for me" lets the optimiser pick. Live updates
// redraw the map within about 2 seconds when someone else books a table.
import { useEffect, useRef, useState } from "react";
import { applyAmbience, cursorSteps, defaultRoom, roomTabs, seatsInRoom, tablesInRoom } from "./ambienceView";
import { useLightCursor } from "./useLightCursor";
import { ApiError } from "../../api/client";
import { getDinerMap, holdTable, venueDayScope } from "../../api/restaurant";
import type { BookingConfirmation, ContactDetails, DinerMap, PartyNeeds } from "../../api/restaurant";
import { useLive } from "../../api/useLive";
import { Button, ErrorState, Skeleton } from "../../design/components";
import { SeatMap } from "../../seatmap/SeatMap";
import { errorMessage, formatDate, people } from "./format";
import { HoldCountdown } from "./HoldCountdown";
import { LightCursorControl } from "./LightCursor";
import { DINER_KEY, DINER_KEY_HELD, MapKey, SCENE_NOTE } from "./MapKey";
import { RoomTabs } from "./RoomTabs";
import { StepDetails } from "./StepDetails";
import { StepHeading } from "./StepHeading";
import { TableCard } from "./TableCard";
import { ConflictNotice, SuggestionCard, TableList } from "./TablePanels";
import { alternatives, describeDinerTables, isPickable, tablesForMap } from "./tableView";
import { releaseQuietly } from "./useBookingFlow";
import { useLoad } from "./useLoad";

export interface Hold {
  holdId: string;
  tableId: number;
  /** Every held table (a joined booking has several). The chair step lists the chairs of all of them. */
  tableIds?: number[];
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
  /** What the details form beside the map needs; without it (older callers) the form only appears as its own step. */
  details?: DetailsProps;
}

/** The parts of the booking flow the side-panel form shares with the Your details step. */
export interface DetailsProps {
  seatId: number | null;
  /** The chair's code, e.g. "R3-1", for the summary of the request. */
  seatLabel: string | null;
  onClearSeat: () => void;
  contact: ContactDetails;
  onContactChange: (contact: ContactDetails) => void;
  onBooked: (confirmation: BookingConfirmation) => void;
  onHoldLost: (message: string) => void;
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

/** Today's sunset at the restaurant, from the first room that has one. */
function sunsetOf(map: DinerMap): string | null {
  return (map.rooms ?? []).find((room) => room.sun?.sunset)?.sun?.sunset ?? null;
}

export function StepTable(props: StepTableProps) {
  const { venueId, needs, time, hold, onHold } = props;
  const key = `${needs.date}|${time}|${needs.party}|${needs.needs_accessible}|${needs.high_chairs}|${(needs.prefs ?? []).join(",")}`;
  const { state, reload } = useLoad(() => getDinerMap(venueId, needs, time), key);
  // Someone else's booking bumps the venue-day version; we then quietly fetch the map again.
  useLive(venueDayScope(venueId, needs.date), () => reload(true));
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<Conflict | null>(props.carriedNotice ? { message: props.carriedNotice, failedId: null } : null);
  const [problem, setProblem] = useState<string | null>(null);
  const [spoken, setSpoken] = useState("");
  const map = state.status === "ready" ? state.data : null;

  // The form beside the map can lose the hold while this step stays on screen: show why, as a conflict does.
  const carried = props.carriedNotice;
  useEffect(() => {
    if (carried) setConflict({ message: carried, failedId: null });
  }, [carried]);

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
      onHold({ holdId: result.hold_id, tableId: result.table.id, tableIds: result.table_ids, tableLabel: result.table.label, expiresAt: result.expires_at });
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

function TableStepBody({ venueId, map: loaded, hold, secondsLeft, busy, conflict, problem, onTake, onNext, onBack, needs, time, details }: BodyProps) {
  const heldId = hold && secondsLeft !== 0 ? hold.tableId : null;
  // The light cursor only repaints the light; the tables, holds and live updates stay as they are.
  const steps = cursorSteps(loaded.stay_start, loaded.stay_end);
  const cursor = useLightCursor(venueId, needs, time, steps);
  const map = cursor.answer ? applyAmbience(loaded, cursor.answer) : loaded;
  const canShowLight = steps.length > 1 && (map.rooms ?? []).some((room) => room.sun !== null);

  const tabs = roomTabs(map);
  const [chosenRoom, setChosenRoom] = useState<number | null | undefined>(undefined);
  const heldRoom = heldId === null ? undefined : (map.tables.find((t) => t.id === heldId)?.room_id ?? null);
  // A table held from the list can be in another room: show that room, so the diner sees their table.
  useEffect(() => {
    if (heldRoom !== undefined) setChosenRoom(heldRoom);
  }, [heldRoom]);
  const roomId = tabs.length === 0 ? undefined : tabs.some((tab) => tab.id === chosenRoom) ? (chosenRoom as number | null) : defaultRoom(map, tabs);
  const roomTables = tablesInRoom(tablesForMap(map, heldId), roomId);

  // A tap or Enter on the map only chooses a table to look at: its card tells the light and the view,
  // and its "Hold table" button reserves it. Nobody holds a table by accident with a finger.
  const [pointed, setPointed] = useState<number | null>(null);
  const [looking, setLooking] = useState<number | null>(null);
  // Whether the table in front of the diner is one they chose, or only the one we suggested on arrival.
  const [chosenByDiner, setChosenByDiner] = useState(false);
  const suggested = useRef(false);
  const [picked, setPicked] = useState("");
  const pickable = new Set(map.tables.filter(isPickable).map((t) => t.id));
  // The table we were looking at may be booked by someone else, or held by us: either way stop looking.
  useEffect(() => {
    if (looking !== null && (!pickable.has(looking) || looking === heldId)) {
      setLooking(null);
      suggested.current = false; // the table is gone: a fresh suggestion may take its place
    }
  }, [looking, heldId, map]);
  // The plan opens with our best table already selected (outlined in green, with a tick) and its card
  // showing why, so reserving is one tap; the diner can pick anything else freely.
  const bestId = map.recommended?.table_ids[0];
  useEffect(() => {
    if (suggested.current || looking !== null || heldId !== null || bestId === undefined || !pickable.has(bestId)) return;
    suggested.current = true;
    setLooking(bestId);
    setChosenByDiner(false);
    const table = map.tables.find((t) => t.id === bestId);
    if (table) setPicked(`Table ${table.label} is suggested for you and already selected. Use Hold table ${table.label} and continue to reserve it.`);
  }, [looking, heldId, bestId, map]);
  const lookAt = (id: number): void => {
    setChosenByDiner(true);
    setLooking(id);
    const table = map.tables.find((t) => t.id === id);
    setPicked(table ? `Table ${table.label} selected. Use Hold table ${table.label} and continue to reserve it.` : "");
  };
  // A table the diner chose stays in front of them; our own suggestion gives way to whatever they point at.
  const focusId = chosenByDiner ? (looking ?? pointed) : (pointed ?? looking);
  // Our suggestion for several joined tables is held through "Choose for me": it has no single table to show.
  const recIds = map.recommended?.table_ids ?? [];
  const combined = recIds.length > 1;
  const candidate = focusId ?? heldId ?? (combined ? null : (recIds[0] ?? null));
  const inRoom = (id: number | null): boolean => id !== null && roomTables.some((t) => t.id === id);
  // The card always describes a table of the room on screen; another room's suggestion is a link below it.
  const cardTable = inRoom(candidate) ? map.tables.find((t) => t.id === candidate) : undefined;
  const bestTable = !combined && bestId !== undefined && pickable.has(bestId) ? map.tables.find((t) => t.id === bestId) : undefined;
  const roomNameOf = (roomId: number | null | undefined): string | null => tabs.find((tab) => tab.id === (roomId ?? null))?.name ?? null;
  const suggestionElsewhere = heldId === null && bestTable !== undefined && !inRoom(bestTable.id);
  const useSuggestion = (): void => {
    if (!bestTable) return;
    setChosenByDiner(false);
    setPointed(null);
    setLooking(bestTable.id);
    setChosenRoom(bestTable.room_id ?? null);
    setPicked(`Table ${bestTable.label} is suggested for you and selected. Use Hold table ${bestTable.label} and continue to reserve it.`);
  };
  const summary = hold ? `Table ${hold.tableLabel}${roomNameOf(map.tables.find((t) => t.id === hold.tableId)?.room_id) ? ` · ${roomNameOf(map.tables.find((t) => t.id === hold.tableId)?.room_id)}` : ""} · ${formatDate(needs.date)} at ${time} · ${people(needs.party)}` : "";

  const highlight = new Set(map.recommended?.table_ids ?? []);
  const nothingFree = pickable.size === 0 && heldId === null;
  const panelShown = Boolean(details && hold && heldId !== null && secondsLeft !== null);
  return (
    <>
      {conflict && <ConflictNotice message={conflict.message} options={alternatives(map, conflict.failedId, needs.party)} busy={busy} onTake={onTake} />}
      {problem && (
        <p className="rb-notice rb-notice-error" role="alert">
          {problem}
        </p>
      )}
      <span className="visually-hidden" role="status" aria-live="polite">
        {picked}
      </span>
      {/* With the details form beside the map the countdown lives in the form, next to the confirm button. */}
      {hold && secondsLeft !== null && !panelShown && <HoldCountdown tableLabel={hold.tableLabel} secondsLeft={secondsLeft} />}
      {tabs.length > 0 && <RoomTabs tabs={tabs} current={roomId as number | null} onChange={setChosenRoom} />}
      <div className={`rb-map-layout${panelShown ? " has-panel" : ""}`}>
        <div className="rb-map-main">
          <SeatMap
            label={`Floor plan for ${time}`}
            mode="tables"
            tables={roomTables}
            seats={seatsInRoom(map.seats, roomTables)}
            zones={map.zones}
            rooms={map.rooms}
            activeRoomId={roomId}
            onActiveChange={setPointed}
            selectable={(id) => pickable.has(id)}
            selectedId={looking ?? heldId}
            ownId={heldId}
            highlight={highlight}
            describe={describeDinerTables(map)}
            onSelect={lookAt}
          />
          {canShowLight && <LightCursorControl steps={steps} index={cursor.index} onChange={cursor.setIndex} failed={cursor.failed} bookingTime={time} sunset={sunsetOf(map)} />}
        </div>
        <div className="rb-map-side">
          {panelShown && details && hold && secondsLeft !== null ? (
            <StepDetails
              variant="panel"
              venueId={venueId}
              needs={needs}
              hold={hold}
              seatId={details.seatId}
              seatLabel={details.seatLabel}
              secondsLeft={secondsLeft}
              summary={summary}
              contact={details.contact}
              onContactChange={details.onContactChange}
              onBooked={details.onBooked}
              onHoldLost={details.onHoldLost}
              onBack={onBack}
              onChooseSeat={onNext}
              onClearSeat={details.onClearSeat}
            />
          ) : nothingFree ? (
            <p className="rb-notice">No table for {people(needs.party)} is free at {time} any more. Please go back and pick another time.</p>
          ) : cardTable ? (
            <TableCard
              table={cardTable}
              roomName={tabs.length > 0 ? roomNameOf(cardTable.room_id) : null}
              recommended={recIds.includes(cardTable.id)}
              reasons={map.recommended?.reasons ?? []}
              heldId={heldId}
              busy={busy}
              onTake={(id) => {
                setLooking(null);
                onTake(id);
              }}
            />
          ) : (
            <SuggestionCard map={map} busy={busy} onTake={onTake} onChooseForMe={() => onTake(null)} />
          )}
          {!panelShown && cardTable && heldId === null && (
            <div className="rb-table-card-more">
              {bestTable && cardTable.id !== bestTable.id && inRoom(bestTable.id) && (
                <Button variant="ghost" onClick={useSuggestion}>
                  Use suggested table {bestTable.label}
                </Button>
              )}
              <Button variant="ghost" busy={busy} onClick={() => onTake(null)}>
                Choose for me
              </Button>
            </div>
          )}
          {suggestionElsewhere && bestTable && (
            <Button variant="ghost" onClick={useSuggestion}>
              Suggested: table {bestTable.label} in {roomNameOf(bestTable.room_id) ?? "another room"}
            </Button>
          )}
          <MapKey entries={heldId !== null ? DINER_KEY_HELD : DINER_KEY} />
          {map.rooms && <p className="rb-muted rb-scene-note">{SCENE_NOTE}</p>}
        </div>
      </div>
      <TableList tables={map.tables} map={map} heldId={heldId} focusId={cardTable?.id ?? null} busy={busy} onTake={onTake} />
      <div className="rb-actions rb-actions-sticky">
        <Button variant="secondary" onClick={onBack}>
          Change time
        </Button>
        {/* With the form beside the map, "Confirm booking" is the main action: nothing else competes with it. */}
        {!panelShown && (
          <Button onClick={onNext} disabled={heldId === null}>
            {heldId === null ? "Pick a table to continue" : `Continue with table ${hold?.tableLabel}`}
          </Button>
        )}
      </div>
    </>
  );
}
