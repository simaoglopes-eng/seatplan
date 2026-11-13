// SeatMap: the one SVG map used by every screen (attendee, organiser, diner, staff).
//
// It draws what it is given and reports what the person picks. It never calls
// the API: pages load the data, pass it in, and decide what a pick means.
//
// Two modes:
//   "seats"  (events)       every seat is a target
//   "tables" (restaurants)  every table is a target; its seats are decoration
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, RefObject } from "react";
import type { MapRoom, MapSeat, MapTable, MapZone } from "../api/types";
import { describeItem, tableName } from "./describe";
import type { DescribeItem } from "./describe";
import { COMFORT_TARGET_PX, MIN_TARGET_PX, MIN_ZOOM, contentBounds, roomAround, seatHitRadius, tableCentre, tableHitRadius, zoomForTarget } from "./geometry";
import { PatternDefs, safeId } from "./glyphs";
import { handleMapKey } from "./mapKeyboard";
import { MapControls } from "./MapControls";
import { NamesLayer, TablesLayer, ZonesLayer } from "./MapLayers";
import { RoomBackdrop, RoomDefs, RoomNight } from "./RoomLayers";
import { mergeBounds, roomsBounds } from "./roomScene";
import { TargetsLayer, itemFor, targetDomId } from "./Targets";
import { usePanZoom } from "./usePanZoom";
import type { PanZoom } from "./usePanZoom";
import { useSeatChanges } from "./useSeatChanges";
import type { TrackedTarget } from "./useSeatChanges";
import "./seatmap.css";

export type SeatMapMode = "seats" | "tables";

// Ids below are seat ids in "seats" mode and table ids in "tables" mode.
export interface SeatMapProps {
  /** Accessible name of the whole map, e.g. "Seat map, Spring Gala". */
  label: string;
  tables: MapTable[];
  seats: MapSeat[];
  zones?: MapZone[];
  mode?: SeatMapMode;
  /** Which targets may be picked. Default: free ones. */
  selectable?: (id: number) => boolean;
  selectedId?: number | null;
  onSelect?: (id: number) => void;
  /** Recommended targets, drawn with a round, dashed brass halo. */
  highlight?: ReadonlySet<number>;
  /** A second highlight, drawn as a square so it differs in shape, e.g. seats changed by a preview. */
  marked?: ReadonlySet<number>;
  /** Words added to the accessible name of a marked target. Default "changed". */
  markedLabel?: string;
  /** The viewer's own hold. Its turning "held" or "mine" is not read out as someone else's. */
  ownId?: number | null;
  /** Targets the viewer's last action changed (the tables staff just seated or moved). Their next change only moves, silently: the page has already said what happened. */
  actedOn?: readonly number[] | null;
  /** Each time this becomes an id, the map zooms in on that target and centres it ("Show on map"). */
  focusId?: number | null;
  /** Writes occupant names under the seats once zoomed in far enough to read them (organiser map). */
  showOccupants?: boolean;
  /** Replaces the default accessible name of an item; return null to keep the default. Flags are still added. */
  describe?: DescribeItem;
  /** Restaurant rooms: curved walls, windows, fixed items, sun patches and the night veil. Without it the map is drawn exactly as before. */
  rooms?: MapRoom[];
  /** Draw only this room (null is the implicit room). Default: every room given. */
  activeRoomId?: number | null;
  /** Draw the sun patches (default true). */
  showSun?: boolean;
}

/** Everything the map needs to know about one pickable thing. */
interface Target extends TrackedTarget {
  x: number;
  y: number;
  /** Diameter of its hit area at the comfortable size, in venue units. */
  size: number;
}

const NOTHING: ReadonlySet<number> = new Set();
// Occupant names are 9 units tall: from this zoom on they are about 12 px on screen.
const NAMES_ZOOM = 1.4;

function groupByTable(seats: MapSeat[]): Map<number, MapSeat[]> {
  const groups = new Map<number, MapSeat[]>();
  for (const seat of seats) {
    const group = groups.get(seat.table_id) ?? [];
    group.push(seat);
    groups.set(seat.table_id, group);
  }
  return groups;
}

function buildTargets(mode: SeatMapMode, tables: MapTable[], seats: MapSeat[], tableById: Map<number, MapTable>, rooms: Map<number, number>): Target[] {
  if (mode === "tables") {
    return tables.map((t) => ({ id: t.id, ...tableCentre(t), state: t.state ?? "free", name: tableName(t), size: 2 * tableHitRadius(t) }));
  }
  return seats.map((s) => ({
    id: s.id,
    x: s.x,
    y: s.y,
    state: s.state,
    name: `${tableName(tableById.get(s.table_id))}, seat ${s.label}`,
    // At the lowest zoom the hit area is as big as its room allows: that is its full size.
    size: 2 * seatHitRadius(rooms.get(s.id) ?? 0, MIN_ZOOM),
  }));
}

/** Derived data, recomputed only when the tables or seats change. */
function useMapModel(mode: SeatMapMode, tables: MapTable[], seats: MapSeat[], zones: MapZone[], rooms: MapRoom[]) {
  const tableById = useMemo(() => new Map(tables.map((t) => [t.id, t])), [tables]);
  const seatsByTable = useMemo(() => groupByTable(seats), [seats]);
  const seatRoom = useMemo(() => roomAround(seats), [seats]);
  const targets = useMemo(() => buildTargets(mode, tables, seats, tableById, seatRoom), [mode, tables, seats, tableById, seatRoom]);
  const targetById = useMemo(() => new Map(targets.map((t) => [t.id, t])), [targets]);
  // Walls (and their curves) are part of the picture people orient by, so they count too.
  const bounds = useMemo(() => mergeBounds(contentBounds(tables, seats, 40, zones), roomsBounds(rooms)), [tables, seats, zones, rooms]);
  // The first view never zooms out so far that the smallest target drops below 24 px.
  const readableK = useMemo(
    () => (targets.length === 0 ? MIN_ZOOM : zoomForTarget(Math.min(...targets.map((t) => t.size)), MIN_TARGET_PX)),
    [targets],
  );
  return { tableById, seatsByTable, rooms: seatRoom, targets, targetById, bounds, readableK };
}

/** Where to look first: the focused target, then the selected one, then the first recommendation. */
function focusTarget(targets: Target[], ids: (number | null | undefined)[], highlight: ReadonlySet<number>): Target | null {
  for (const id of ids) {
    const found = id === null || id === undefined ? undefined : targets.find((t) => t.id === id);
    if (found) return found;
  }
  return targets.find((t) => highlight.has(t.id)) ?? null;
}

/** Zooms in on a target until its hit area is about 44 px, and centres it. */
function zoomTo(panZoom: PanZoom, target: Target): void {
  panZoom.focusOn(target.x, target.y, zoomForTarget(target.size, COMFORT_TARGET_PX));
}

interface InputContext {
  props: SeatMapProps;
  model: ReturnType<typeof useMapModel>;
  panZoom: PanZoom;
  changes: ReturnType<typeof useSeatChanges>;
  isSelectable: (id: number) => boolean;
  leaveRef: RefObject<HTMLButtonElement>;
  activeId: number | null;
  setActiveId: (id: number | null) => void;
}

/** Picking, the keyboard cursor and "Show on map": everything a person does to the map. */
function useMapInput({ props, model, panZoom, changes, isSelectable, leaveRef, activeId, setActiveId }: InputContext) {
  const { selectedId = null, highlight = NOTHING, focusId = null } = props;
  // Latest-value ref: the memoised seats get one stable function forever,
  // which still calls the newest logic. Otherwise every render would redraw all seats.
  const pickRef = useRef<(id: number) => void>(() => undefined);
  pickRef.current = (id: number) => {
    if (panZoom.wasDragged()) return; // the pointer was dragging the map, not tapping a seat
    const target = model.targetById.get(id);
    if (!target) return;
    setActiveId(id);
    if (!isSelectable(id)) {
      changes.announce(`${target.name} is not available.`);
      return;
    }
    changes.notePick(id);
    props.onSelect?.(id);
    changes.announce(`Selected ${target.name}.`);
  };
  const pick = useCallback((id: number) => pickRef.current(id), []);

  // "Show on map": the page sets focusId; we zoom there and put the keyboard cursor on it.
  useEffect(() => {
    const target = focusId === null ? undefined : model.targetById.get(focusId);
    if (!target) return;
    setActiveId(target.id);
    zoomTo(panZoom, target);
    // Only a new focusId should move the camera, not a live refresh of the data.
  }, [focusId]);

  const moveTo = (id: number): void => {
    setActiveId(id);
    const target = model.targetById.get(id);
    if (target) panZoom.ensureVisible(target.x, target.y);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const handled = handleMapKey(event, {
      points: model.targets,
      activeId,
      moveTo,
      pick: (id) => pickRef.current(id),
      zoomBy: panZoom.zoomBy,
      fit: panZoom.fit,
      leave: () => leaveRef.current?.focus(),
    });
    if (handled) event.preventDefault();
  };

  // A tap or click also gives the map focus. Moving the camera then would slide
  // the map away under the finger, and the tap would land on empty floor. So
  // only keyboard focus brings the cursor into view; a tap picks what it hits.
  // The mark lasts from pointerdown until the click, a key press or blur: after
  // a finger is lifted, the browser moves the focus only after pointerup.
  const pointerFocus = useRef(false);
  const markPointer = (): void => {
    pointerFocus.current = true;
  };
  const clearPointer = (): void => {
    pointerFocus.current = false;
  };

  // When the map gets keyboard focus, start the cursor somewhere useful.
  const onFocus = (): void => {
    if (pointerFocus.current) return;
    if (activeId !== null && model.targetById.has(activeId)) return;
    const start = firstUsefulTarget(model.targets, selectedId, highlight, isSelectable);
    if (start !== null) moveTo(start);
  };

  return { pick, onKeyDown, onFocus, markPointer, clearPointer };
}

export function SeatMap(props: SeatMapProps) {
  const { label, tables, seats, zones = [], mode = "seats", selectedId = null, highlight = NOTHING, focusId = null } = props;
  const mapId = safeId(useId());
  const viewportRef = useRef<HTMLDivElement>(null);
  const leaveRef = useRef<HTMLButtonElement>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [hoverId, setHoverId] = useState<number | null>(null);
  const shownRooms = useMemo(
    () => (props.rooms ?? []).filter((r) => props.activeRoomId === undefined || r.id === props.activeRoomId),
    [props.rooms, props.activeRoomId],
  );
  const model = useMapModel(mode, tables, seats, zones, shownRooms);
  const noun = mode === "tables" ? "table" : "seat";
  const getFocus = () => focusTarget(model.targets, [focusId, selectedId], highlight);
  const panZoom = usePanZoom(viewportRef, model.bounds, { minK: model.readableK, getFocus });
  const changes = useSeatChanges(model.targets, { selectedId, ownId: props.ownId ?? null, actedOn: props.actedOn ?? null, noun });

  const isSelectable = useCallback(
    (id: number): boolean => (props.selectable ? props.selectable(id) : model.targetById.get(id)?.state === "free"),
    [props.selectable, model.targetById],
  );

  const input = useMapInput({ props, model, panZoom, changes, isSelectable, leaveRef, activeId, setActiveId });

  const recommended = model.targets.find((t) => highlight.has(t.id));
  const focusControl = recommended ? { label: `Zoom to the recommended ${noun}`, onClick: () => zoomTo(panZoom, recommended) } : null;
  const captionId = hoverId ?? activeId;
  const caption = captionId === null ? null : captionFor(captionId, props, model, highlight, selectedId);
  const { view } = panZoom;
  // Map text reads this to stay legible when zoomed out (seatmap.css, .table-label).
  const zoomStyle = { "--map-zoom": view.k } as CSSProperties;

  return (
    <div className="seatmap">
      <div
        ref={viewportRef}
        className="seatmap-viewport"
        tabIndex={0}
        role="listbox"
        aria-label={label}
        aria-roledescription={`${noun} map`}
        aria-describedby={`${mapId}-help`}
        aria-activedescendant={activeId === null ? undefined : targetDomId(mapId, activeId)}
        onKeyDown={input.onKeyDown}
        onFocus={input.onFocus}
        onPointerDownCapture={input.markPointer}
        onClickCapture={input.clearPointer}
        onKeyDownCapture={input.clearPointer}
        onBlur={input.clearPointer}
        {...panZoom.pointerHandlers}
      >
        <svg className="seatmap-svg" width="100%" height="100%" style={zoomStyle}>
          <PatternDefs prefix={mapId} />
          {shownRooms.length > 0 && <RoomDefs prefix={mapId} />}
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {shownRooms.map((room) => (
              <RoomBackdrop key={room.id ?? "implicit"} room={room} mapId={mapId} showSun={props.showSun ?? true} />
            ))}
            <ZonesLayer zones={zones} />
            {mode === "seats" && <TablesLayer tables={tables} />}
            <TargetsLayer
              mode={mode}
              mapId={mapId}
              tables={tables}
              seats={seats}
              tableById={model.tableById}
              seatsByTable={model.seatsByTable}
              rooms={model.rooms}
              zoom={view.k}
              isSelectable={isSelectable}
              selectedId={selectedId}
              activeId={activeId}
              highlight={highlight}
              marked={props.marked ?? NOTHING}
              markedLabel={props.markedLabel ?? "changed"}
              describe={props.describe}
              motion={changes.motion}
              onPick={input.pick}
              onHover={setHoverId}
            />
            {props.showOccupants && mode === "seats" && view.k >= NAMES_ZOOM && <NamesLayer seats={seats} />}
            {shownRooms.map((room) => (
              <RoomNight key={room.id ?? "implicit"} room={room} />
            ))}
          </g>
        </svg>
      </div>
      <MapControls leaveRef={leaveRef} onZoomIn={() => panZoom.zoomBy(1.25)} onZoomOut={() => panZoom.zoomBy(0.8)} onFit={panZoom.fit} focus={focusControl} />
      <p className="seatmap-caption" aria-hidden="true">
        {caption ?? `Drag to move, pinch or scroll to zoom. Select a ${noun} to see its details.`}
      </p>
      <p id={`${mapId}-help`} className="visually-hidden">
        Use the arrow keys to move between {noun}s, Enter or Space to choose, plus and minus to zoom, zero to show the whole map, and Escape to
        leave the map.
      </p>
      <div className="visually-hidden" role="status" aria-live="polite">
        {changes.announcement}
      </div>
    </div>
  );
}

/** Selected first, then the best recommendation, then anything free, then anything at all. */
function firstUsefulTarget(
  targets: Target[],
  selectedId: number | null,
  highlight: ReadonlySet<number>,
  isSelectable: (id: number) => boolean,
): number | null {
  if (selectedId !== null && targets.some((t) => t.id === selectedId)) return selectedId;
  const recommended = targets.find((t) => highlight.has(t.id));
  if (recommended) return recommended.id;
  const free = targets.find((t) => isSelectable(t.id));
  return free?.id ?? targets[0]?.id ?? null;
}

/** The visible one-line description under the map (sighted users get the same words). */
function captionFor(
  id: number,
  props: SeatMapProps,
  model: ReturnType<typeof useMapModel>,
  highlight: ReadonlySet<number>,
  selectedId: number | null,
): string | null {
  const item = itemFor(props.mode ?? "seats", id, { seats: props.seats, ...model });
  if (!item) return null;
  const marked = props.marked?.has(id) ? (props.markedLabel ?? "changed") : null;
  return describeItem(item, { recommended: highlight.has(id), marked, selected: id === selectedId }, props.describe);
}
