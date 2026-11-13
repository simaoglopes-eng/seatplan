// The Light tool's side panel (spec 7.7): a date, a time slider from 06:00 to
// 23:45, shortcut buttons, the sentence about the sun, and the sentences about
// one table at that time. It shows the SAVED rooms, and says so when the plan
// has changes that are not saved yet.
import { useState } from "react";
import type { AmbienceAnswer } from "../../api/restaurant";
import { Button, Field, Select } from "../../design/components";
import { lightSteps, presetTimes, sunSentence } from "./lightModel";
import type { Room } from "./roomModel";

interface LightToolsProps {
  room: Room;
  /** True when the plan has changes the preview cannot see. */
  unsaved: boolean;
  date: string;
  time: string;
  onDate: (date: string) => void;
  onTime: (time: string) => void;
  answer: AmbienceAnswer | null;
  failed: boolean;
}

const STEPS = lightSteps();

export function LightTools({ room, unsaved, date, time, onDate, onTime, answer, failed }: LightToolsProps) {
  const [tableId, setTableId] = useState("");
  const index = Math.max(0, STEPS.indexOf(time));
  const saved = room.tables.filter((t) => t.id !== null);
  const described = answer?.tables.find((t) => String(t.id) === tableId);
  const noNorth = room.north_deg === null && !room.is_outdoor;
  return (
    <div className="room-light-tools">
      <h3>Light</h3>
      {(unsaved || room.id === null) && <p className="rb-muted">This shows your saved rooms. Save to see these changes.</p>}
      <Field label="Date" type="date" value={date} onChange={(e) => e.target.value && onDate(e.target.value)} />
      <div className="room-light-slider">
        <label htmlFor="room-light-time" className="field-label">
          Time of day <strong className="tabular">{time}</strong>
        </label>
        <input
          id="room-light-time"
          aria-label="Time of day"
          type="range"
          min={0}
          max={STEPS.length - 1}
          step={1}
          value={index}
          aria-valuetext={`${time}`}
          onChange={(e) => onTime(STEPS[Number(e.target.value)] as string)}
        />
      </div>
      {answer && !answer.located && <p role="status">This restaurant has no location yet, so the sun cannot be shown. Add it in the restaurant's profile.</p>}
      {answer?.located && noNorth && <p role="status">Set north (North tool) to see sunlight in this room.</p>}
      {answer?.located && <p role="status">{sunSentence(date, time, answer.sun)}</p>}
      {failed && <p role="status">We could not load the light just now. The picture shows an earlier time.</p>}
      <div className="room-actions">
        {presetTimes(answer?.sun ?? null).map((preset) => (
          <Button key={preset.name} variant="secondary" onClick={() => onTime(preset.time)}>
            {preset.name}
          </Button>
        ))}
      </div>
      {saved.length > 0 && answer?.located && (
        <>
          <Select
            label="Describe table"
            value={tableId}
            options={[{ value: "", label: "Choose a table" }, ...saved.map((t) => ({ value: String(t.id), label: t.label }))]}
            onChange={(e) => setTableId(e.target.value)}
          />
          {described && (
            <ul className="rb-reasons">
              {described.phrases.map((phrase) => (
                <li key={phrase}>{phrase}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
