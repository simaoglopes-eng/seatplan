// One time slot. Its status is told three ways, never by colour alone:
// an icon (open circle, half circle, cross), a word, and the colour.
import type { SlotStatus, TimeSlot } from "../../api/restaurant";
export const SLOT_TEXT: Record<SlotStatus, string> = {
  available: "Available",
  limited: "Few tables left",
  full: "Full, join waitlist",
};
function SlotIcon({ status }: { status: SlotStatus }) {
  return (
    <svg className="rb-slot-icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6" className="rb-slot-ring" />
      {status === "limited" && <path d="M8 2a6 6 0 0 1 0 12z" className="rb-slot-fill" />}
      {status === "full" && <path d="M5 5l6 6M11 5l-6 6" className="rb-slot-cross" />}
    </svg>
  );
}
interface SlotButtonProps {
  slot: TimeSlot;
  /** One of the times closest to the one the diner asked for. */
  near?: boolean;
  selected?: boolean;
  onPick: (slot: TimeSlot) => void;
}
export function SlotButton({ slot, near = false, selected = false, onPick }: SlotButtonProps) {
  return (
    <button id={`when-slot-${slot.time}`} type="button" aria-pressed={selected} className={`rb-slot${selected ? " is-selected" : ""} rb-slot-${slot.status}${near ? " rb-slot-near" : ""}`} onClick={() => onPick(slot)}>
      <span className="rb-slot-time tabular">{slot.time}</span>
      <span className="rb-slot-status">
        <SlotIcon status={slot.status} />
        {selected ? "Selected" : SLOT_TEXT[slot.status]}
      </span>
      {near && <span className="rb-slot-near-tag">Closest</span>}
    </button>
  );
}
