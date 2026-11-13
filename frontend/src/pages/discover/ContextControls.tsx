// Where and when: a city (or "near me"), and optionally a date, a time and how many people.
// On a wide screen it is one compact capsule in the command bar; on a phone the same four
// controls sit stacked, with visible labels, inside the filters drawer. Only one of the two
// is ever on the page.
import { Field, Select } from "../../design/components";
import { CITIES } from "./discoverModel";
import type { Place } from "./discoverModel";

export const PARTIES = Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: i === 0 ? "1 person" : `${i + 1} people` }));
const NEAR = "__near";

export function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${String(now.getDate()).padStart(2, "0")}`;
}

interface Props {
  place: Place | null;
  onPlace: (place: Place | null) => void;
  date: string;
  time: string;
  party: string;
  onDate: (value: string) => void;
  onTime: (value: string) => void;
  onParty: (value: string) => void;
  onClearWhen: () => void;
  variant: "capsule" | "stacked";
}

/** The options of the city list; "Near me" is there only while the location is in use. */
function cityOptions(place: Place | null): { value: string; label: string }[] {
  const near = place?.label === "Near me" ? [{ value: NEAR, label: "Near me" }] : [];
  return [{ value: "", label: "Anywhere" }, ...near, ...CITIES.map((c) => ({ value: c.label, label: c.label }))];
}

export function ContextControls({ place, onPlace, date, time, party, onDate, onTime, onParty, onClearWhen, variant }: Props) {
  const cityValue = place ? (place.label === "Near me" ? NEAR : place.label) : "";
  const changeCity = (value: string): void => {
    if (value === NEAR) return;
    onPlace(CITIES.find((c) => c.label === value) ?? null);
  };
  if (variant === "stacked") {
    return (
      <div className="discover-stacked">
        <Select label="Choose a city" value={cityValue} options={cityOptions(place)} onChange={(event) => changeCity(event.target.value)} />
        <Field label="Date" type="date" min={today()} value={date} onChange={(event) => onDate(event.target.value)} />
        <Field label="Time" type="time" step={900} value={time} onChange={(event) => onTime(event.target.value)} />
        <Select label="People" value={party} options={PARTIES} onChange={(event) => onParty(event.target.value)} />
        {date && (
          <button type="button" className="discover-more" onClick={onClearWhen}>
            Clear the date
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="discover-capsule" role="group" aria-label="Where and when">
      <select aria-label="Choose a city" value={cityValue} onChange={(event) => changeCity(event.target.value)}>
        {cityOptions(place).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <input type="date" aria-label="Date" min={today()} value={date} onChange={(event) => onDate(event.target.value)} />
      <input type="time" aria-label="Time" step={900} value={time} onChange={(event) => onTime(event.target.value)} />
      <select aria-label="People" value={party} onChange={(event) => onParty(event.target.value)}>
        {PARTIES.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {date && (
        <button type="button" className="discover-capsule-clear" aria-label="Clear the date" onClick={onClearWhen}>
          ×
        </button>
      )}
    </div>
  );
}
