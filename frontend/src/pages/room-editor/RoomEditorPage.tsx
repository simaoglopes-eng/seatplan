import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, getVenue } from "../../api/client";
import type { VenueDetail } from "../../api/types";
import { Button, Checkbox, ErrorState, Field, PageShell, Select, Skeleton } from "../../design/components";
import { useHistory } from "../editor/useHistory";
import { useUnsavedGuard } from "../editor/useUnsavedGuard";
import { useLoad } from "../restaurant/useLoad";
import { outlineToPolygon, polygonArea, sideLength, sidePoint } from "./geometry";
import type { Point } from "./geometry";
import { legacyRoom } from "./legacyRoom";
import { NewRoomDialog } from "./NewRoomDialog";
import { addRoom, replaceRoom } from "./roomModel";
import type { Room } from "./roomModel";
import { appendCorner, finishOutline, removeCorner } from "./shapeEditing";
import { RoomProperties } from "./RoomProperties";
import type { ShapeSelection } from "./ShapeTools";
import { RoomCanvas } from "./RoomCanvas";
import { WallTools } from "./WallTools";
import { NorthTools } from "./NorthTools";
import { FixtureTools } from "./FixtureTools";
import { ZoneTools } from "./ZoneTools";
import { addFixture, addZone, FIXTURE_KINDS, removeZone, ZONE_KINDS } from "./roomObjects";
import { addTable, TABLE_KINDS } from "./tableModel";
import { TableTools } from "./TableTools";
import { SelectionTools } from "./SelectionTools";
import { deleteTables, duplicateTables, moveTables, rotateTables } from "./selection";
import { editChair } from "./tableModel";
import { validateRooms } from "./validation";
import type { RoomProblem } from "./validation";
import { ProblemList } from "./ProblemList";
import "./room-editor.css";

export default function RoomEditorPage() {
  const { venueId = "" } = useParams();
  const { state, reload } = useLoad(() => getVenue(venueId), venueId);
  return <PageShell title="Rooms" width="wide">
    {state.status === "loading" && <Skeleton label="Loading your rooms" lines={4} />}
    {state.status === "error" && (state.error instanceof ApiError && state.error.status === 401 ? <p><Link to={`/owner/sign-in?next=${encodeURIComponent(`/owner/${venueId}/rooms`)}`}>Sign in to edit your rooms</Link></p> : <ErrorState title="We could not open these rooms" message="Check the restaurant link or try again." onRetry={() => reload()} />)}
    {state.status === "ready" && (state.data.kind === "restaurant" ? <RoomSession info={state.data} /> : <p>Restaurant not found.</p>)}
  </PageShell>;
}

function RoomSession({ info }: { info: VenueDetail }) {
  const [initial] = useState(() => legacyRoom(info));
  const history = useHistory(initial);
  const [selectedRoom, setSelectedRoom] = useState(initial.rooms[0].key);
  const [adding, setAdding] = useState(false);
  const [drawingRoom, setDrawingRoom] = useState<string | null>(null);
  const [selection, setSelection] = useState<ShapeSelection>(null);
  const [tool, setTool] = useState("Shape");
  const [opening, setOpening] = useState<string | null>(null);
  const [object, setObject] = useState<string | null>(null);
  const [placement, setPlacement] = useState<string | null>(null);
  const [chair, setChair] = useState<string | null>(null);
  const [selectedTables, setSelectedTables] = useState<string[]>([]), [multiple, setMultiple] = useState(false), [areaMode, setAreaMode] = useState(false);
  const [focusTarget, setFocusTarget] = useState<{ roomKey: string; point: Point; serial: number } | null>(null);
  const [error, setError] = useState("");
  const [grid, setGrid] = useState(true);
  const [pointX, setPointX] = useState("0"), [pointY, setPointY] = useState("0");
  const room = history.present.rooms.find(r => r.key === selectedRoom) ?? history.present.rooms[0];
  const drawing = drawingRoom === room.key;
  const tableKeys = selectedTables.filter(key => room.tables.some(t => t.key === key));
  const updateKeys = (keys: string[]) => { setSelectedTables(keys); setObject(keys.at(-1) ?? null); setChair(null); };
  const chooseTable = (key: string, selectedChair: string | null, additive = false, long = false) => {
    const keys = selectedChair ? [key] : long ? [...new Set([...tableKeys, key])] : additive ? tableKeys.includes(key) ? tableKeys.filter(k => k !== key) : [...tableKeys, key] : tableKeys.includes(key) ? tableKeys : [key];
    setSelectedTables(keys); setObject(keys.includes(key) ? key : keys.at(-1) ?? null); setChair(selectedChair); if (long) setMultiple(true);
  };
  const dirty = JSON.stringify(history.present) !== JSON.stringify(initial);
  const problems = useMemo(() => validateRooms(history.present.rooms), [history.present]);
  useUnsavedGuard(dirty);
  const addPoint = (point: Point) => {
    const changed = appendCorner(room, point);
    if (changed !== room) history.commit(replaceRoom(history.present, changed));
  };
  const changeRoom = (changed: Room, transient = false) => {
    setError("");
    const next = replaceRoom(history.present, changed);
    if (transient) history.replace(next); else history.commit(next);
  };
  const closeShape = () => {
    try { const changed = finishOutline(room); if (changed !== room) changeRoom(changed); setDrawingRoom(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Check the corners."); }
  };
  const placeObject = (point: Point, value: string) => {
    if (drawing) return;
    try {
    const [category, kind] = value.split(":");
    const fixed = FIXTURE_KINDS.find(k => k === kind), zone = ZONE_KINDS.find(k => k === kind);
    if (category === "fixture" && fixed) {
      const next = addFixture(room, fixed, point); changeRoom(next); setObject(next.fixtures.at(-1)!.key); setTool("Fixed");
    } else if (category === "zone" && zone) {
      const next = addZone(room, zone, point); changeRoom(next); setObject(next.zones.at(-1)!.key); setTool("Zones");
    } else if (category === "table") {
      const table = TABLE_KINDS.find(k => k === kind); if (!table) return;
      const next = addTable(room, table, point); changeRoom(next); updateKeys([next.tables.at(-1)!.key]); setTool("Tables");
    } else return;
    setPlacement(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not place this object."); }
  };
  const placeCentre = () => { if (placement) { const points = room.outline.points; placeObject({ x: (Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) / 2, y: (Math.min(...points.map(p => p.y)) + Math.max(...points.map(p => p.y))) / 2 }, placement); } };
  let area = 0;
  try { if (room.outline.points.length >= 3) area = Math.abs(polygonArea(outlineToPolygon(room.outline))) / 10000; } catch { /* Invalid drafts still open for repair. */ }
  const selectProblem = (problem: RoomProblem) => {
    const target = history.present.rooms.find(r => r.key === problem.room_key) ?? room;
    setSelectedRoom(target.key); setDrawingRoom(null); setPlacement(null); setChair(null);
    const table = target.tables.find(t => problem.table_keys.includes(t.key)), opening = target.openings.find(o => o.key === problem.opening_key);
    let point: Point = { x: 500, y: 350 };
    if (table) { setTool("Tables"); updateKeys(problem.table_keys); point = { x: table.x + table.w / 2, y: table.y + table.h / 2 }; }
    else if (opening) { setTool("Walls"); setOpening(opening.key); setSelection({ kind: "side", index: opening.side }); try { point = sidePoint(target.outline, opening.side, (opening.offset + opening.width / 2) / sideLength(target.outline, opening.side)); } catch { /* Outline problem remains selectable. */ } }
    else { setTool(problem.code === "no_tables" ? "Tables" : "Shape"); updateKeys([]); setSelection(null); }
    setFocusTarget(previous => ({ roomKey: target.key, point, serial: (previous?.serial ?? 0) + 1 }));
  };
  return <section className="room-editor" aria-label="Restaurant room editor" onKeyDown={event => {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable=true]")) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) history.redo(); else history.undo(); }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); history.redo(); }
    else if (event.key === "Escape") { setPlacement(null); setObject(null); setSelection(null); updateKeys([]); setMultiple(false); setAreaMode(false); }
    else if (tool === "Tables" && tableKeys.length && ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d" || ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Delete"].includes(event.key) || !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "r")) {
      event.preventDefault();
      try {
        if (event.key.toLowerCase() === "d") { const next = duplicateTables(room, tableKeys); updateKeys(next.tables.filter(t => !room.tables.some(old => old.key === t.key)).map(t => t.key)); changeRoom(next); }
        else if (event.key === "Delete") { if (chair) throw new Error("Use the chair count controls to remove a chair."); changeRoom(deleteTables(room, tableKeys)); updateKeys([]); }
        else if (event.key.toLowerCase() === "r") changeRoom(rotateTables(room, tableKeys));
        else { const distance = event.shiftKey ? 10 : 1, dx = event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0, dy = event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0; const table = room.tables.find(t => t.key === object), seat = table?.seats.find(s => s.key === chair); changeRoom(table && seat ? editChair(room, table.key, seat.key, { x: seat.x + dx, y: seat.y + dy }) : moveTables(room, tableKeys, dx, dy)); }
      } catch (caught) { setError(caught instanceof Error ? caught.message : "Check the selected tables."); }
    }
    else if (event.key === "Delete" && object && (tool === "Fixed" || tool === "Zones")) { event.preventDefault(); changeRoom(tool === "Fixed" ? { ...room, fixtures: room.fixtures.filter(f => f.key !== object) } : removeZone(room, object)); setObject(null); }
    else if (event.key === "Delete" && tool === "Walls" && opening) { event.preventDefault(); changeRoom({ ...room, openings: room.openings.filter(o => o.key !== opening) }); setOpening(null); }
    else if (event.key === "Delete" && tool === "Shape" && selection?.kind === "corner") {
      event.preventDefault();
      try { changeRoom(removeCorner(room, selection.index)); setSelection(null); }
      catch (caught) { setError(caught instanceof Error ? caught.message : "Keep at least three corners."); }
    }
  }}>
    <header className="room-header"><Link to="/owner">← Back to my restaurants</Link><h1>{info.name} · Rooms</h1>
      <div className="room-actions"><Button variant="secondary" disabled={!history.canUndo} onClick={history.undo}>Undo</Button><Button variant="secondary" disabled={!history.canRedo} onClick={history.redo}>Redo</Button><Button disabled>Save</Button><span role="status">{dirty ? "Unsaved" : "Saved"}</span></div>
    </header>
    <div className="room-tabs"><Select label="Room" value={room.key} onChange={e => { setSelectedRoom(e.target.value); setDrawingRoom(null); setSelection(null); }} options={history.present.rooms.map(r => ({ value: r.key, label: r.name }))} /><Button variant="secondary" disabled={history.present.rooms.length >= 5} onClick={() => setAdding(true)}>Add room</Button></div>
    {error && <p role="alert" className="room-error">{error}</p>}
    <div className="room-workspace"><nav className="room-tools" aria-label="Room tools">{["Shape", "Walls", "North", "Fixed", "Zones", "Tables", "Light", "Preview"].map(name => <button key={name} type="button" aria-pressed={tool === name} disabled={!["Shape", "Walls", "North", "Fixed", "Zones", "Tables"].includes(name) || (drawing && name !== "Shape")} onClick={() => { setTool(name); setPlacement(null); setError(""); }}>{name}</button>)}</nav>
      <RoomCanvas room={room} drawing={drawing} grid={grid} onPoint={addPoint} onCloseShape={closeShape} selection={selection} onSelect={setSelection} onChange={changeRoom} onDragStart={history.checkpoint} onError={setError} tool={tool} opening={opening} onOpening={setOpening} placement={placement} object={object} onObject={setObject} onPlace={placeObject} chair={chair} onTableSelect={chooseTable} tableKeys={tableKeys} multiple={multiple} areaMode={areaMode} onArea={keys => { updateKeys(keys); setAreaMode(false); }} problems={problems.filter(p => p.room_key === room.key)} focusTarget={focusTarget} />
      <aside className="room-properties"><h2>Room properties</h2><div className="room-form">
        <Field label="Selected room name" value={room.name} maxLength={60} onChange={e => history.commit(replaceRoom(history.present, { ...room, name: e.target.value }))} />
        <Checkbox label="Show 50 cm grid" checked={grid} onChange={e => setGrid(e.target.checked)} />
        {drawing && <><p>Tap each corner, then close the shape.</p><div className="room-fields"><Field label="Corner x (cm)" inputMode="decimal" value={pointX} onChange={e => setPointX(e.target.value)} /><Field label="Corner y (cm)" inputMode="decimal" value={pointY} onChange={e => setPointY(e.target.value)} /></div><Button variant="secondary" onClick={() => { const x = Number(pointX.replace(",", ".")), y = Number(pointY.replace(",", ".")); if (Number.isFinite(x) && Number.isFinite(y)) addPoint({ x, y }); }}>Add corner</Button><Button disabled={room.outline.points.length < 3} onClick={closeShape}>Close shape</Button></>}
        <p>Walls: {room.outline.points.length} sides</p><p>Tables: {room.tables.length}</p>
        {!drawing && tool === "Shape" && <RoomProperties key={`${room.key}:${selection?.kind}:${selection?.index}`} room={room} selection={selection} onSelect={setSelection} onChange={changeRoom} onError={setError} />}
        {!drawing && tool === "Shape" && room.outline.points.length < 3 && <Button onClick={() => setDrawingRoom(room.key)}>Continue drawing walls</Button>}
        {!drawing && tool === "Walls" && <WallTools room={room} selection={selection} selected={opening} onSelect={setOpening} onSide={setSelection} onChange={changeRoom} onError={setError} />}
        {!drawing && tool === "North" && <NorthTools key={room.key} room={room} onChange={changeRoom} />}
        {!drawing && tool === "Fixed" && <FixtureTools room={room} selected={object} placement={placement} onSelect={setObject} onArm={setPlacement} onCentre={placeCentre} onChange={changeRoom} onError={setError} />}
        {!drawing && tool === "Zones" && <ZoneTools room={room} selected={object} placement={placement} onSelect={setObject} onArm={setPlacement} onCentre={placeCentre} onChange={changeRoom} />}
        {!drawing && tool === "Tables" && <><TableTools room={room} selected={object} chair={chair} placement={placement} onSelect={key => updateKeys(key ? [key] : [])} onChair={setChair} onArm={setPlacement} onCentre={placeCentre} onChange={changeRoom} onError={setError} /><SelectionTools room={room} keys={tableKeys} multiple={multiple} area={areaMode} onMultiple={setMultiple} onArea={setAreaMode} onKeys={updateKeys} onChange={changeRoom} onError={setError} /></>}
      </div></aside>
    </div><footer className="room-status">{area.toLocaleString("pt-PT", { maximumFractionDigits: 1 })} m² · {grid ? "Grid on" : "Grid off"}<ProblemList problems={problems} onSelect={selectProblem} /></footer>
    {adding && <NewRoomDialog onClose={() => setAdding(false)} onCreate={(created, draw) => { history.commit(addRoom(history.present, created)); setSelectedRoom(created.key); setDrawingRoom(draw ? created.key : null); setSelection(null); setTool("Shape"); setAdding(false); }} />}
  </section>;
}
