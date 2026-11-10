// Settings tab: how attendees see each other (with a live preview before
// saving) and the deadline after which seats can no longer be changed.
import { useState } from "react";
import * as eventsApi from "../../api/events";
import type { OrganiserEvent, PrivacyMode } from "../../api/events";
import { Button, Field } from "../../design/components";
import { previewName } from "./format";
import type { OrganiserState } from "./useOrganiser";

const MODES: { value: PrivacyMode; label: string; hint: string }[] = [
  { value: "full_name", label: "Full names", hint: "Best for teams who already know each other." },
  { value: "first_initial", label: "First name and last initial", hint: "A good default: easy to recognise, harder to search." },
  { value: "anonymous", label: "Nobody's name", hint: "Everyone sees only 'Guest'. Friends can still sit together." },
];

// Enough rows to show the rule working without listing the whole party.
const PREVIEW_ROWS = 4;

export function SettingsTab({ org, data }: { org: OrganiserState; data: OrganiserEvent }) {
  return (
    <div className="ev-panel-stack">
      <PrivacySetting org={org} data={data} />
      <DeadlineSetting org={org} data={data} />
    </div>
  );
}

function PrivacySetting({ org, data }: { org: OrganiserState; data: OrganiserEvent }) {
  const [mode, setMode] = useState<PrivacyMode>(data.event.privacy_mode);
  const sample = data.guests.slice(0, PREVIEW_ROWS);
  const changed = mode !== data.event.privacy_mode;

  return (
    <section className="ev-card-flat" aria-labelledby="ev-privacy">
      <h3 id="ev-privacy" className="ev-subtitle">
        What attendees see of each other
      </h3>
      <fieldset className="ev-radios">
        <legend className="visually-hidden">Privacy mode</legend>
        {MODES.map((option) => (
          <label key={option.value} className="ev-radio">
            <input type="radio" name="privacy" value={option.value} checked={mode === option.value} onChange={() => setMode(option.value)} />
            <span>
              <strong>{option.label}</strong>
              <span className="ev-muted ev-block">{option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <h4 className="ev-mini-title">Preview: what attendees will see</h4>
      <table className="ev-table">
        <thead>
          <tr>
            <th scope="col">Real name (only you)</th>
            <th scope="col">Shown to other attendees</th>
          </tr>
        </thead>
        <tbody>
          {sample.map((guest) => (
            <tr key={guest.id}>
              <td>{guest.name}</td>
              <td>
                {previewName(guest.name, mode, guest.wants_anonymous)}
                {guest.wants_anonymous && <span className="ev-muted"> (asked to be anonymous)</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ev-muted">Emails, dietary notes and accessibility needs are never shown to other attendees.</p>
      <Button
        busy={org.busy === "privacy"}
        disabled={!changed}
        onClick={() => void org.run("privacy", "Privacy setting saved. Attendees see the new names now.", () => eventsApi.patchEvent(org.eventId, { privacy_mode: mode }).then(() => undefined))}
      >
        {changed ? "Save privacy setting" : "Saved"}
      </Button>
    </section>
  );
}

/** "2026-03-14T19:30" for <input type="datetime-local">, in the browser's own time zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function DeadlineSetting({ org, data }: { org: OrganiserState; data: OrganiserEvent }) {
  const [value, setValue] = useState(toLocalInput(data.event.change_deadline));
  const save = (deadline: string | null, done: string) =>
    void org.run("deadline", done, () => eventsApi.patchEvent(org.eventId, { change_deadline: deadline }).then(() => undefined));

  return (
    <section className="ev-card-flat" aria-labelledby="ev-deadline">
      <h3 id="ev-deadline" className="ev-subtitle">
        Seat change deadline
      </h3>
      <Field
        label="Attendees can change seats until"
        hint="Your local time. After this, the map is read-only for attendees and only you can move people."
        type="datetime-local"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="ev-actions">
        <Button busy={org.busy === "deadline"} disabled={value === ""} onClick={() => save(new Date(value).toISOString(), "Deadline saved.")}>
          Save deadline
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setValue("");
            save(null,"Deadline removed. Attendees can change seats until the event.");
          }}
        >
          No deadline
        </Button>
      </div>
    </section>
  );
}
