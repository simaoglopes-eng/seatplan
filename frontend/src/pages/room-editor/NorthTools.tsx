import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { Button } from "../../design/components";
import { compassNorth, normaliseNorth, northAt } from "./northModel";
import type { Room } from "./roomModel";
import { RoomNumberField } from "./ShapeTools";

type PermissionOrientation = typeof DeviceOrientationEvent & { requestPermission?: (absolute?: boolean) => Promise<string> };

export function NorthTools({ room, onChange }: { room: Room; onChange: (room: Room) => void }) {
  const heading = useRef<number | null>(null), waiting = useRef(false);
  const [available, setAvailable] = useState(false), [message, setMessage] = useState("");
  const change = useRef(onChange), latest = useRef(room);
  change.current = onChange; latest.current = room;
  const sensor = typeof DeviceOrientationEvent !== "undefined" ? DeviceOrientationEvent as PermissionOrientation : null;
  useEffect(() => {
    const read = (event: DeviceOrientationEvent) => {
      const north = compassNorth(event);
      if (north === null) return;
      heading.current = north; setAvailable(true);
      if (waiting.current) { waiting.current = false; change.current({ ...latest.current, north_deg: north }); setMessage("Phone compass applied. Check the needle against the room."); }
    };
    window.addEventListener("deviceorientation", read);
    window.addEventListener("deviceorientationabsolute", read);
    return () => { window.removeEventListener("deviceorientation", read); window.removeEventListener("deviceorientationabsolute", read); };
  }, []);
  return <div className="room-form">
    <p>Stand in the room, open your phone's compass, and turn the needle so it matches.</p>
    <p>Keep the phone flat, with its top aligned to the top of your plan.</p>
    <p role="status">{room.north_deg === null ? "North is not set" : `North is at ${room.north_deg}°`}</p>
    <RoomNumberField label="North is at (degrees)" value={room.north_deg} min={0} max={359} onCommit={north => onChange({ ...room, north_deg: normaliseNorth(north) })} />
    <Button variant="secondary" onClick={() => onChange({ ...room, north_deg: normaliseNorth((room.north_deg ?? 0) - 15) })}>Rotate north −15°</Button>
    <Button variant="secondary" onClick={() => onChange({ ...room, north_deg: normaliseNorth((room.north_deg ?? 0) + 15) })}>Rotate north +15°</Button>
    <Button variant="secondary" onClick={() => onChange({ ...room, north_deg: 0 })}>North points up</Button>
    <Button variant="ghost" disabled={room.north_deg === null} onClick={() => onChange({ ...room, north_deg: null })}>Clear north</Button>
    {window.isSecureContext && (available || sensor?.requestPermission) && <Button variant="secondary" onClick={() => void (async () => {
      try {
        if (sensor?.requestPermission && await sensor.requestPermission(true) !== "granted") { setMessage("Compass permission was not granted. Set north manually."); return; }
        if (heading.current !== null) { onChange({ ...room, north_deg: heading.current }); setMessage("Phone compass applied. Check the needle against the room."); }
        else { waiting.current = true; setMessage("Waiting for an absolute compass reading. You can also set north manually."); }
      } catch { setMessage("The phone compass is unavailable. Set north manually."); }
    })()}>Use my phone's compass</Button>}
    {message && <p role="status">{message}</p>}
  </div>;
}

/** Preview locally during a drag; commit once on release. Fields offer the same action. */
export function NorthDial({ north, onCommit }: { north: number | null; onCommit: (north: number) => void }) {
  const [draft, setDraft] = useState<number | null>(null);
  const active = useRef(false);
  const angle = (event: PointerEvent<SVGSVGElement>) => {
    const b = event.currentTarget.getBoundingClientRect();
    return northAt({ x: event.clientX - b.left - b.width / 2, y: event.clientY - b.top - b.height / 2 });
  };
  return <div className="room-north-dial"><svg viewBox="0 0 200 200" aria-hidden="true" onPointerDown={event => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); active.current = true; setDraft(angle(event)); }} onPointerMove={event => { if (active.current) setDraft(angle(event)); }} onPointerUp={event => { if (active.current) { active.current = false; onCommit(angle(event)); setDraft(null); } }} onPointerCancel={() => { active.current = false; setDraft(null); }}>
    <circle cx="100" cy="100" r="88" />
    <g transform={`rotate(${draft ?? north ?? 0} 100 100)`}><path d="M 100 25 L 120 125 L 100 110 L 80 125 Z" /><text x="100" y="20" textAnchor="middle">N</text></g>
    <circle cx="100" cy="100" r="5" />
  </svg><span>{draft ?? north ?? "?"}°</span></div>;
}
