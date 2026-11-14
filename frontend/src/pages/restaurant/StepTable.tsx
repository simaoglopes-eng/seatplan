// Step 3: the floor map for the chosen time. Tapping a free table holds it
// for 5 minutes; "Choose for me" lets the optimiser pick. Live updates
// redraw the map within about 2 seconds when someone else books a table.
import { useEffect, useRef, useState } from "react";
import { applyAmbience, cursorSteps, defaultRoom, lightWords, roomTabs, seatsInRoom, tablesInRoom } from "./ambienceView";
import { useLightCursor } from "./useLightCursor";
import { ApiError } from "../../api/client";
import { getDinerMap, holdTable, venueDayScope } from "../../api/restaurant";
import type { BookingConfirmation, ContactDetails, DinerMap, DinerTable, PartyNeeds } from "../../api/restaurant";
import { useLive } from "../../api/useLive";
import { Button, ErrorState, Skeleton } from "../../design/components";
import { SeatMap } from "../../seatmap/SeatMap";
import { errorMessage, guests, shortDate, tableName } from "./format";
import { HoldCountdown } from "./HoldCountdown";
import { LightCursorControl } from "./LightCursor";
import { DINER_KEY, DINER_KEY_HELD, MapKey, SCENE_NOTE } from "./MapKey";
import { RoomTabs } from "./RoomTabs";
import { StepDetails } from "./StepDetails";
import { StepHeading } from "./StepHeading";
import { TableCard } from "./TableCard";
import { ConflictNotice, SuggestionCard, TableList } from "./TablePanels";
import { alternatives, describeDinerTables, isPickable, tablesForMap, zoneName } from "./tableView";
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
      {/* Once the map is on screen it draws its own header (with the Map / List switch), or the details form takes over. */}
      {state.status !== "ready" && <ChooseHeader needs={needs} time={time} onBack={props.onBack} />}
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

function TableStepBody({ venueId, map: loaded, hold, secondsLeft, busy, conflict, problem, onTake, onHold, onNext, onBack, needs, time, details }: BodyProps) {
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
  const heldTable = hold ? map.tables.find((t) => t.id === hold.tableId) : undefined;
  const heldRoomName = heldTable && tabs.length > 0 ? roomNameOf(heldTable.room_id) : null;
  const summary = hold ? (
    <>
      <strong>
        {tableName(hold.tableLabel)}
        {heldRoomName ? ` · ${heldRoomName}` : ""}
      </strong>
      {` · ${shortDate(needs.date)}, ${time} · ${guests(needs.party)}`}
    </>
  ) : null;

  const highlight = new Set(map.recommended?.table_ids ?? []);
  const nothingFree = pickable.size === 0 && heldId === null;
  const panelShown = Boolean(details && hold && heldId !== null && secondsLeft !== null);
  const [view, setView] = useState<"map" | "list">("map");
  // The plan has loaded (the page just grew): start the booking at the top of the screen, and again when the form takes over.
  useEffect(() => {
    const toStages = (): void => document.getElementById("booking-stages")?.scrollIntoView?.({ block: "start" });
    toStages();
    // Images above the booking finish loading a moment later and move it: once more, before the diner has had time to scroll.
    const again = window.setTimeout(toStages, 350);
    return () => window.clearTimeout(again);
  }, [panelShown]);
  const zoneOf = (table: DinerTable): string | null => zoneName(table, map.zones);
  const availableHere = roomTables.filter((t) => pickable.has(t.id)).length;
  const roomName = tabs.length > 0 ? roomNameOf(roomId) : null;

  // The diner wants another table than the one held: give it back and return to the plan.
  const changeTable = (): void => {
    void releaseQuietly(venueId, hold);
    setLooking(null);
    setChosenByDiner(false);
    onHold(null);
  };
  // A row of the list is a table to look at, like a tap on the plan: its card holds it.
  const selectFromList = (id: number): void => {
    const table = map.tables.find((t) => t.id === id);
    if (table) setChosenRoom(table.room_id ?? null);
    setPointed(null);
    lookAt(id);
  };

  const notices = (
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
    </>
  );

  // A table is held: the form is the main thing, and the plan shrinks to "Your table".
  if (panelShown && details && hold && secondsLeft !== null) {
    return (
      <>
        {notices}
        <div className="rb5-held">
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
          <section className="rb-card rb5-your-table" aria-label="Your table">
            <h3 className="rb5-card-title">Your table</h3>
            <p className="rb-muted">
              {[`${tableName(hold.tableLabel)}${heldTable && zoneOf(heldTable) ? ` · ${zoneOf(heldTable)} table` : ""}`, heldTable?.ambience?.view?.text].filter(Boolean).join(" · ")}
            </p>
            <SeatMap
              label={`Floor plan with your table ${hold.tableLabel}`}
              mode="tables"
              tables={roomTables}
              seats={seatsInRoom(map.seats, roomTables)}
              zones={map.zones}
              rooms={map.rooms}
              activeRoomId={roomId}
              onActiveChange={setPointed}
              selectable={() => false}
              selectedId={heldId}
              ownId={heldId}
              highlight={highlight}
              describe={describeDinerTables(map)}
              onSelect={() => undefined}
            />
            <MapKey entries={DINER_KEY_HELD} />
            <div className="rb5-your-table-actions">
              <Button variant="ghost" onClick={changeTable}>
                Choose a different table
              </Button>
              <Button variant="ghost" onClick={onBack}>
                Change date or time
              </Button>
            </div>
          </section>
        </div>
      </>
    );
  }

  const cardNode = nothingFree ? (
    <p className="rb-notice">
      No table for {guests(needs.party)} is free at {time} any more. Please go back and pick another time.
    </p>
  ) : cardTable ? (
    <TableCard
      table={cardTable}
      roomName={roomName}
      zone={zoneOf(cardTable)}
      recommended={recIds.includes(cardTable.id)}
      reasons={map.recommended?.reasons ?? []}
      heldId={heldId}
      busy={busy}
      onTake={(id) => {
        setLooking(null);
        onTake(id);
      }}
    />
  ) : suggestionElsewhere && bestTable ? (
    <div className="rb-card rb-suggestion">
      <p className="rb-eyebrow">Our suggestion</p>
      <h3 className="rb-suggestion-title">
        {tableName(bestTable.label)} is in {roomNameOf(bestTable.room_id) ?? "another room"}
      </h3>
      <p className="rb-muted">There is no suggested table in the room you are looking at. Tap any free table here, or go to our suggestion first.</p>
      <Button onClick={useSuggestion}>
        Show {tableName(bestTable.label)} in {roomNameOf(bestTable.room_id) ?? "another room"}
      </Button>
      <Button variant="ghost" busy={busy} onClick={() => onTake(null)}>
        Choose for me
      </Button>
    </div>
  ) : (
    <SuggestionCard map={map} busy={busy} onTake={onTake} onChooseForMe={() => onTake(null)} />
  );

  return (
    <>
      {notices}
      {/* Without the form beside the plan (older callers) the countdown sits above it. */}
      {hold && secondsLeft !== null && !panelShown && <HoldCountdown tableLabel={hold.tableLabel} secondsLeft={secondsLeft} />}
      <ChooseHeader needs={needs} time={time} onBack={onBack} view={view} onView={setView} />
      <div className="rb5-choose">
        <section className="rb-card rb5-plan-card" aria-label="Floor plan">
          <div className="rb5-plan-top">
            {tabs.length > 0 && <RoomTabs tabs={tabs} current={roomId as number | null} onChange={setChosenRoom} />}
            <p className="rb-muted rb5-available">
              {availableHere} available{roomName ? ` in ${roomName}` : ""}
            </p>
          </div>
          {view === "map" ? (
            <>
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
              </div>
              <MapKey entries={heldId !== null ? DINER_KEY_HELD : DINER_KEY} />
              {map.rooms && <p className="rb-muted rb-scene-note">{SCENE_NOTE}</p>}
            </>
          ) : (
            <TableList
              tables={map.tables}
              map={map}
              heldId={heldId}
              focusId={cardTable?.id ?? null}
              roomNameOf={tabs.length > 0 ? (table) => roomNameOf(table.room_id) : undefined}
              onSelect={selectFromList}
            />
          )}
        </section>
        <div className="rb5-choose-side">
          {cardNode}
          {cardTable && heldId === null && (
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
        </div>
        {view === "map" && canShowLight && (
          <div className="rb5-light-slot">
            <LightCursorControl
              steps={steps}
              index={cursor.index}
              onChange={cursor.setIndex}
              failed={cursor.failed}
              bookingTime={time}
              sunset={sunsetOf(map)}
              summary={cardTable?.ambience ? lightWords(cardTable.ambience.light) : null}
            />
          </div>
        )}
      </div>
      {/* Only for a hold without the form beside the plan (older callers): the one way on. */}
      {!panelShown && heldId !== null && (
        <div className="rb-actions rb-actions-sticky">
          <Button onClick={onNext}>Continue with table {hold?.tableLabel}</Button>
        </div>
      )}
    </>
  );
}

/** "Choose your table", the one-line context with Edit, and the Map / List switch. */
function ChooseHeader({ needs, time, onBack, view, onView }: { needs: PartyNeeds; time: string; onBack: () => void; view?: "map" | "list"; onView?: (view: "map" | "list") => void }) {
  return (
    <div className="rb5-choose-head">
      <div>
        <StepHeading>Choose your table</StepHeading>
        <p className="rb-muted rb5-context">
          {shortDate(needs.date)} · {time} · {guests(needs.party)}
          <Button variant="ghost" onClick={onBack} aria-label="Edit date, time and guests">
            Edit
          </Button>
        </p>
      </div>
      {view && onView && (
        <div className="rb5-view-switch" role="group" aria-label="Show the tables as">
          {(["map", "list"] as const).map((choice) => (
            <button key={choice} type="button" aria-pressed={view === choice} onClick={() => onView(choice)}>
              {choice === "map" ? "Map" : "List"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
