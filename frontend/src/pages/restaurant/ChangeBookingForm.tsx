// Change the time or the party size of an existing booking. The list of
// times comes from the same /slots endpoint as the booking flow, so the
// diner only sees times that can actually take the party.
import { useState } from "react";
import type { FormEvent } from "react";
import { changeBooking, getSlots } from "../../api/restaurant";
import type { BookingView, TimeSlot } from "../../api/restaurant";
import { Button, Select } from "../../design/components";
import type { SelectOption } from "../../design/components";
import { SLOT_TEXT } from "./SlotButton";
import { errorMessage, people } from "./format";
import { useLoad } from "./useLoad";

interface ChangeBookingFormProps {
  token: string;
  booking: BookingView;
  onChanged: (booking: BookingView) => void;
}

export function ChangeBookingForm({ token, booking, onChanged }: ChangeBookingFormProps) {
  const [party, setParty] = useState(booking.party_size);
  const [time, setTime] = useState(booking.time);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const slots = useLoad(() => getSlots(booking.venue_public_id, booking.date, party), `${booking.date}|${party}`);
  const unchanged = party === booking.party_size && time === booking.time;

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      onChanged(await changeBooking(token, { time, party_size: party }));
    } catch (error) {
      setProblem(errorMessage(error, "We could not change the booking. Nothing was changed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="rb-card rb-form" onSubmit={submit} noValidate>
      <h2 className="rb-service-title">Change time or party size</h2>
      <Select label="Party size" options={partyOptions(largestChoice(booking))} value={String(party)} onChange={(e) => setParty(Number(e.target.value))} />
      <Select
        label="Time"
        hint={slots.state.status === "loading" ? "Checking which times are free..." : "Only times with a free table are listed."}
        options={timeOptions(slots.state.status === "ready" ? slots.state.data.slots : [], booking.time)}
        value={time}
        onChange={(e) => setTime(e.target.value)}
      />
      {problem && (
        <p className="rb-notice rb-notice-error" role="alert">
          {problem}
        </p>
      )}
      <Button type="submit" busy={busy} disabled={unchanged}>
        Save changes
      </Button>
    </form>
  );
}

/**
 * The biggest party to offer: the restaurant's real limit from GET /b/{token},
 * so every choice can fit a table. The current size is always included, so the
 * select never shows an empty value, even if the restaurant later removed a table.
 */
export function largestChoice(booking: BookingView): number {
  return Math.max(booking.max_party ?? booking.party_size, booking.party_size);
}

function partyOptions(max: number): SelectOption[] {
  return Array.from({ length: max }, (_, i) => ({ value: String(i + 1), label: people(i + 1) }));
}

/** The current time is always listed, so the select never shows an empty value. */
function timeOptions(slots: TimeSlot[], current: string): SelectOption[] {
  const open = slots.filter((slot) => slot.status !== "full" || slot.time === current);
  const options = open.map((slot) => ({ value: slot.time, label: `${slot.time}, ${slot.time === current ? "your current time" : SLOT_TEXT[slot.status].toLowerCase()}` }));
  if (!open.some((slot) => slot.time === current)) options.unshift({ value: current, label: `${current}, your current time` });
  return options;
}
