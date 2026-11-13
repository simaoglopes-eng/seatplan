import { useState } from "react";
import { Button, Checkbox, Dialog, Field, Select } from "../../design/components";
import { createInitialShape } from "./shapeModel";
import type { InitialShape } from "./shapeModel";
import type { Room } from "./roomModel";

export function NewRoomDialog({ onCreate, onClose }: { onCreate: (room: Room, draw: boolean) => void; onClose: () => void }) {
  const [name, setName] = useState("Main room");
  const [shape, setShape] = useState<InitialShape>("rectangle");
  const [width, setWidth] = useState("10");
  const [height, setHeight] = useState("7");
  const [cutWidth, setCutWidth] = useState("3");
  const [cutHeight, setCutHeight] = useState("2");
  const [outdoor, setOutdoor] = useState(false);
  const [error, setError] = useState("");
  const cm = (value: string) => Number(value.replace(",", ".")) * 100;
  return <Dialog open title="Add a room" onClose={onClose}>
    <form className="room-form" onSubmit={event => {
      event.preventDefault();
      try { onCreate(createInitialShape(name.trim(), shape, cm(width), cm(height), cm(cutWidth), cm(cutHeight), outdoor), shape === "draw"); }
      catch (caught) { setError(caught instanceof Error ? caught.message : "Check the dimensions."); }
    }}>
      <Field label="Room name" required maxLength={60} value={name} onChange={e => setName(e.target.value)} />
      <Checkbox label="Outdoor (terrace)" checked={outdoor} onChange={e => setOutdoor(e.target.checked)} />
      <Select label="Initial shape" value={shape} onChange={e => setShape(e.target.value as InitialShape)} options={[{ value: "rectangle", label: "Rectangle" }, { value: "l-shape", label: "L-shape" }, { value: "draw", label: "Draw it myself" }]} />
      {shape !== "draw" && <div className="room-fields"><Field label="Width (m)" inputMode="decimal" required value={width} onChange={e => setWidth(e.target.value)} /><Field label="Length (m)" inputMode="decimal" required value={height} onChange={e => setHeight(e.target.value)} /></div>}
      {shape === "l-shape" && <div className="room-fields"><Field label="Cutout width (m)" inputMode="decimal" required value={cutWidth} onChange={e => setCutWidth(e.target.value)} /><Field label="Cutout length (m)" inputMode="decimal" required value={cutHeight} onChange={e => setCutHeight(e.target.value)} /></div>}
      {error && <p role="alert">{error}</p>}
      <Button type="submit">Create room</Button>
    </form>
  </Dialog>;
}
