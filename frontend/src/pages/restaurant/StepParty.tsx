// Step 1: date, party size and needs. Nothing is sent yet; we only check
// what we already know (closed weekdays and blackout dates) so the diner
// hears "closed" before choosing a time, not after.
import type { FormEvent } from "react";
import type { PartyNeeds, RestaurantInfo } from "../../api/restaurant";
import { Button, Checkbox, Field, Select } from "../../design/components";
import type { SelectOption } from "../../design/components";
import { formatDate, people, todayIso, weekdayName } from "./format";
import { PREF_OPTIONS, togglePref } from "./prefs";
import { StepHeading } from "./StepHeading";

interface StepPartyProps {
  info: RestaurantInfo;
  needs: PartyNeeds;
  onChange: (needs: PartyNeeds) => void;
  onNext: () => void;
  focusOnMount: boolean;
}

/** Python's weekday(): Monday is 0. JavaScript's getDay(): Sunday is 0. */
export function pythonWeekday(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  const jsDay = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1).getDay();
  return (jsDay + 6) % 7;
}

/** Why the restaurant is closed on this date, or null when it is open. */
export function closedReason(info: RestaurantInfo, date: string): string | null {
  const blackout = info.blackout_dates.find((b) => b.date === date);
  if (blackout) return `Closed on ${formatDate(date)}: ${blackout.reason}.`;
  const open = info.services.some((s) => s.weekday === pythonWeekday(date));
  if (!open && info.services.length > 0) return `${info.name} is closed on ${weekdayName(date)}s.`;
  return null;
}

function partyOptions(max: number): SelectOption[] {
  return Array.from({ length: max }, (_, i) => ({ value: String(i + 1), label: people(i + 1) }));
}

const HIGH_CHAIR_OPTIONS: SelectOption[] = [
  { value: "0", label: "No high chair" },
  { value: "1", label: "1 high chair" },
  { value: "2", label: "2 high chairs" },
  { value: "3", label: "3 high chairs" },
];

export function StepParty({ info, needs, onChange, onNext, focusOnMount }: StepPartyProps) {
  const closed = needs.date === "" ? null : closedReason(info, needs.date);
  const dateMissing = needs.date === "";
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!closed && !dateMissing) onNext();
  };
  return (
    <form className="rb-step" onSubmit={submit} noValidate>
      <StepHeading focusOnMount={focusOnMount}>When, and how many?</StepHeading>
      <Field
        label="Date"
        type="date"
        min={todayIso()}
        value={needs.date}
        onChange={(e) => onChange({ ...needs, date: e.target.value })}
        error={dateMissing ? "Choose a date to see the free times." : null}
        required
      />
      {closed && (
        <p className="rb-notice rb-notice-closed" role="status">
          <strong>Closed that day.</strong> {closed} Please pick another date.
        </p>
      )}
      <Select
        label="Party size"
        hint={`Including children. For more than ${info.max_party}, please call the restaurant.`}
        options={partyOptions(info.max_party)}
        value={String(needs.party)}
        onChange={(e) => onChange({ ...needs, party: Number(e.target.value) })}
      />
      <fieldset className="rb-needs">
        <legend className="field-label">Anything we should know?</legend>
        <Checkbox
          label="Someone needs an accessible table"
          hint="Step-free access and room for a wheelchair"
          checked={needs.needs_accessible}
          onChange={(e) => onChange({ ...needs, needs_accessible: e.target.checked })}
        />
        <Select
          label="High chairs for small children"
          options={HIGH_CHAIR_OPTIONS}
          value={String(needs.high_chairs)}
          onChange={(e) => onChange({ ...needs, high_chairs: Number(e.target.value) })}
        />
      </fieldset>
      <fieldset className="rb-needs">
        <legend className="field-label">What would you like your table to be like? (optional)</legend>
        <p className="rb-muted">We will suggest a table that fits when we can. Wishes never take a table away from a bigger party.</p>
        {PREF_OPTIONS.map((option) => (
          <Checkbox
            key={option.key}
            label={option.label}
            checked={(needs.prefs ?? []).includes(option.key)}
            onChange={(e) => onChange({ ...needs, prefs: togglePref(needs.prefs, option.key, e.target.checked) })}
          />
        ))}
      </fieldset>
      <div className="rb-actions">
        <Button type="submit" disabled={closed !== null || dateMissing}>
          See free times
        </Button>
      </div>
    </form>
  );
}
