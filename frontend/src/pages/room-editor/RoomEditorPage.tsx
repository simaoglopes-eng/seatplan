import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, getVenue } from "../../api/client";
import type { VenueDetail } from "../../api/types";
import { Button, Checkbox, ErrorState, Field, PageShell, Select, Skeleton } from "../../design/components";
import { useHistory } from "../editor/useHistory";
import { useUnsavedGuard } from "../editor/useUnsavedGuard";
import { useLoad } from "../restaurant/useLoad";
import { outlineToPolygon, polygonArea } from "./geometry";
import type { Point } from "./geometry";
import { legacyRoom } from "./legacyRoom";
import { NewRoomDialog } from "./NewRoomDialog";
import { addRoom, replaceRoom } from "./roomModel";
import { RoomCanvas } from "./RoomCanvas";
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
  const [drawing, setDrawing] = useState(false);
  const [grid, setGrid] = useState(true);
  const [pointX, setPointX] = useState("0"), [pointY, setPointY] = useState("0");
  const room = history.present.rooms.find(r => r.key === selectedRoom) ?? history.present.rooms[0];
  const dirty = JSON.stringify(history.present) !== JSON.stringify(initial);
  useUnsavedGuard(dirty);
  const addPoint = (point: Point) => {
    if (room.outline.points.length >= 60) return;
    history.commit(replaceRoom(history.present, { ...room, outline: { points: [...room.outline.points, { ...point, curve: 0 }] } }));
  };
  const area = room.outline.points.length >= 3 ? polygonArea(outlineToPolygon(room.outline)) / 10000 : 0;
  return <section className="room-editor" aria-label="Restaurant room editor">
    <header className="room-header"><Link to="/owner">← Back to my restaurants</Link><h1>{info.name} · Rooms</h1>
      <div className="room-actions"><Button variant="secondary" disabled={!history.canUndo} onClick={history.undo}>Undo</Button><Button variant="secondary" disabled={!history.canRedo} onClick={history.redo}>Redo</Button><Button disabled>Save</Button><span role="status">{dirty ? "Unsaved" : "Saved"}</span></div>
    </header>
    <div className="room-tabs"><Select label="Room" value={room.key} onChange={e => { setSelectedRoom(e.target.value); setDrawing(false); }} options={history.present.rooms.map(r => ({ value: r.key, label: r.name }))} /><Button variant="secondary" disabled={history.present.rooms.length >= 5} onClick={() => setAdding(true)}>Add room</Button></div>
    <div className="room-workspace"><nav className="room-tools" aria-label="Room tools">{["Shape", "Walls", "North", "Fixed", "Zones", "Tables", "Light", "Preview"].map(tool => <button key={tool} type="button" aria-pressed={tool === "Shape"} disabled={tool !== "Shape"}>{tool}</button>)}</nav>
      <RoomCanvas room={room} drawing={drawing} grid={grid} onPoint={addPoint} onCloseShape={() => setDrawing(false)} />
      <aside className="room-properties"><h2>Room properties</h2><div className="room-form">
        <Field label="Selected room name" value={room.name} maxLength={60} onChange={e => history.commit(replaceRoom(history.present, { ...room, name: e.target.value }))} />
        <Checkbox label="Show 50 cm grid" checked={grid} onChange={e => setGrid(e.target.checked)} />
        {drawing && <><p>Tap each corner, then close the shape.</p><div className="room-fields"><Field label="Corner x (cm)" inputMode="decimal" value={pointX} onChange={e => setPointX(e.target.value)} /><Field label="Corner y (cm)" inputMode="decimal" value={pointY} onChange={e => setPointY(e.target.value)} /></div><Button variant="secondary" onClick={() => { const x = Number(pointX.replace(",", ".")), y = Number(pointY.replace(",", ".")); if (Number.isFinite(x) && Number.isFinite(y)) addPoint({ x, y }); }}>Add corner</Button><Button disabled={room.outline.points.length < 3} onClick={() => setDrawing(false)}>Close shape</Button></>}
        <p>Walls: {room.outline.points.length} sides</p><p>Tables: {room.tables.length}</p>
      </div></aside>
    </div><footer className="room-status">{area.toLocaleString("pt-PT", { maximumFractionDigits: 1 })} m² · {grid ? "Grid on" : "Grid off"}</footer>
    {adding && <NewRoomDialog onClose={() => setAdding(false)} onCreate={(created, draw) => { history.commit(addRoom(history.present, created)); setSelectedRoom(created.key); setDrawing(draw); setAdding(false); }} />}
  </section>;
}
