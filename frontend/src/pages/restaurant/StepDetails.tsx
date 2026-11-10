// Step 4: contact details. Each field checks itself when the diner leaves
// it (not on every key press), and the submit button checks everything and
// moves focus to the first field that needs attention.
import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError } from "../../api/client";
import { createBooking } from "../../api/restaurant";
import type { BookingConfirmation, ContactDetails, PartyNeeds } from "../../api/restaurant";
import { Button, Field } from "../../design/components";
import { errorMessage } from "./format";
import { HoldCountdown } from "./HoldCountdown";
import type { Hold } from "./StepTable";
import { StepHeading } from "./StepHeading";
import { validateContact } from "./validation";
import type { ContactErrors } from "./validation";

interface StepDetailsProps {
  venueId: string;
  needs: PartyNeeds;
  hold: Hold;
  secondsLeft: number;
  /** Kept by the page, so going back to the map does not wipe what was typed. */
  contact: ContactDetails;
  onContactChange: (contact: ContactDetails) => void;
  onBooked: (confirmation: BookingConfirmation) => void;
  /** The hold ended before we could book: go back to the map with this message. */
  onHoldLost: (message: string) => void;
  onBack: () => void;
}

const FIELD_ORDER: (keyof ContactDetails)[] = ["name", "email", "phone", "notes"];

export function StepDetails(props: StepDetailsProps) {
  const { venueId, needs, hold, secondsLeft, contact, onContactChange, onBooked, onHoldLost, onBack } = props;
  const [touched, setTouched] = useState<Partial<Record<keyof ContactDetails, boolean>>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const errors = validateContact(contact);
  const shown = (field: keyof ContactDetails): string | null => (touched[field] ? (errors[field] ?? null) : null);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setTouched({ name: true, email: true, phone: true, notes: true });
    if (focusFirstError(errors)) return;
    setBusy(true);
    setProblem(null);
    try {
      onBooked(await createBooking(venueId, hold.holdId, trimmed(contact), needs));
    } catch (error) {
      setBusy(false);
      if (error instanceof ApiError && (error.code === "hold_expired" || error.code === "seat_taken")) {
        onHoldLost(`Your hold on table ${hold.tableLabel} ended before we could book it. Your details are not lost: pick a table again.`);
        return;
      }
      setProblem(errorMessage(error, "We could not finish the booking. Please try again."));
    }
  };

  const bind = (field: keyof ContactDetails) => ({
    id: `rb-${field}`,
    value: contact[field],
    error: shown(field),
    onChange: (e: { target: { value: string } }) => onContactChange({ ...contact, [field]: e.target.value }),
    onBlur: () => setTouched({ ...touched, [field]: true }),
  });

  return (
    <form className="rb-step rb-form" onSubmit={submit} noValidate>
      <StepHeading>Your details</StepHeading>
      <HoldCountdown tableLabel={hold.tableLabel} secondsLeft={secondsLeft} />
      <Field label="Name for the booking" autoComplete="name" required {...bind("name")} />
      <Field label="Email" hint="We send the confirmation and a calendar invite here." type="email" autoComplete="email" inputMode="email" required {...bind("email")} />
      <Field label="Phone (optional)" hint="Only used if we need to reach you on the day." type="tel" autoComplete="tel" {...bind("phone")} />
      <Field label="Notes for the restaurant (optional)" hint="Allergies, a birthday, a pram..." {...bind("notes")} />
      {problem && (
        <p className="rb-notice rb-notice-error" role="alert">
          {problem}
        </p>
      )}
      <div className="rb-actions rb-actions-sticky">
        <Button variant="secondary" onClick={onBack}>
          Back to the map
        </Button>
        <Button type="submit" busy={busy} disabled={secondsLeft === 0}>
          Confirm booking
        </Button>
      </div>
    </form>
  );
}

function trimmed(contact: ContactDetails): ContactDetails {
  return { name: contact.name.trim(), email: contact.email.trim(), phone: contact.phone.trim(), notes: contact.notes.trim() };
}

/** Moves focus to the first field with a problem; returns true if there was one. */
function focusFirstError(errors: ContactErrors): boolean {
  const first = FIELD_ORDER.find((field) => errors[field]);
  if (!first) return false;
  document.getElementById(`rb-${first}`)?.focus();
  return true;
}
