// Walk-in: staff say how many people and what they need, the optimiser
// suggests the best table with its reasons, and one tap seats them.
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { askWhatIf, seatWalkin } from "../../api/restaurant";
import type { StaffBooking, WhatIfAnswer } from "../../api/restaurant";
import { Button, Checkbox, Dialog, Select } from "../../design/components";
import { errorMessage, formatDate, people, tablesText } from "./format";
import { PARTY_CHOICES, WhatIfAnswerView } from "./WhatIf";

interface WalkinDialogProps {
  venueId: string;
  /** The day on the staff screen; the walk-in is seated on that day. */
  date: string;
  time: string;
  inService?: boolean;
  open: boolean;
  onClose: () => void;
  onSeated: (booking: StaffBooking) => void;
}

interface WalkinForm {
  party: number;
  accessible: boolean;
  highChairs: number;
}

const HIGH_CHAIRS: { value: string; label: string }[] = [0, 1, 2, 3].map((n) => ({ value: String(n), label: n === 0 ? "None" : String(n) }));

/**
 * Moves focus to the returned element whenever `value` becomes set. Used for
 * the suggestion: the button that was pressed turns into "Seat at ...", so
 * leaving focus there would let a second Enter seat the party before anyone
 * heard the reasons.
 */
function useFocusWhenSet<T extends HTMLElement>(value: unknown): RefObject<T> {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (value) ref.current?.focus();
  }, [value]);
  return ref;
}

export function WalkinDialog({ venueId, date, time, inService = true, open, onClose, onSeated }: WalkinDialogProps) {
  const [form, setForm] = useState<WalkinForm>({ party: 2, accessible: false, highChairs: 0 });
  const [answer, setAnswer] = useState<WhatIfAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const answerRef = useFocusWhenSet<HTMLDivElement>(answer);
  // A suggestion is only true for the moment it was asked; closing forgets it.
  const close = (): void => {
    if (busy) return;
    setAnswer(null);
    setProblem(null);
    onClose();
  };
  // Any change to the form makes the old suggestion stale.
  const update = (next: WalkinForm): void => {
    setForm(next);
    setAnswer(null);
  };
  const run = async (action: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await action();
    } catch (error) {
      setAnswer(null);
      setProblem(errorMessage(error, "That did not work. Please try again."));
    } finally {
      setBusy(false);
    }
  };
  const find = (): Promise<void> =>
    run(async () => setAnswer(await askWhatIf(venueId, { party_size: form.party, date, time, needs_accessible: form.accessible, high_chairs: form.highChairs })));
  const seat = (tableIds: number[]): Promise<void> =>
    run(async () => {
      onSeated(await seatWalkin(venueId, { party_size: form.party, needs_accessible: form.accessible, high_chairs: form.highChairs, table_ids: tableIds, date, time }));
      setAnswer(null);
    });

  const tableIds = answer?.table_ids ?? null;
  const actions = (
    <>
      <Button variant="secondary" disabled={busy} onClick={close}>
        Close
      </Button>
      {tableIds ? (
        <Button busy={busy} onClick={() => void seat(tableIds)}>
          Seat at {tablesText(answer?.table_labels ?? [])}
        </Button>
      ) : (
        <Button busy={busy} onClick={() => void find()}>
          Find a table
        </Button>
      )}
    </>
  );
  return (
    <Dialog open={open} title={`Walk-in at ${time}`} onClose={close} actions={actions}>
      <p className="st-effective-time">Effective booking time: {formatDate(date)} at <strong>{time}</strong> · {people(form.party)}.</p>
      {!inService && <p className="rb-notice rb-notice-warning" role="status">This reference is outside service hours. The request will use {time}, not the nearest opening time. Return to the floor to choose another time if needed.</p>}
      <p className="rb-muted">Find a table only previews. Seat at table confirms this walk-in at the date and time shown.</p>
      <fieldset className="st-walkin-fields" disabled={busy}><legend className="visually-hidden">Walk-in needs</legend><WalkinFields form={form} onChange={update} /></fieldset>
      {/* tabIndex -1: focusable by code only, so it does not add a Tab stop. */}
      <div aria-live="polite" ref={answerRef} tabIndex={-1} className="st-answer-focus">
        {answer && <WhatIfAnswerView answer={answer} party={form.party} />}
      </div>
      {problem && (
        <p className="rb-notice rb-notice-error" role="alert">
          {problem}
        </p>
      )}
    </Dialog>
  );
}

function WalkinFields({ form, onChange }: { form: WalkinForm; onChange: (form: WalkinForm) => void }) {
  return (
    <div className="rb-form">
      <Select label="How many people?" options={PARTY_CHOICES} value={String(form.party)} onChange={(e) => onChange({ ...form, party: Number(e.target.value) })} />
      <Checkbox label="Needs an accessible table" checked={form.accessible} onChange={(e) => onChange({ ...form, accessible: e.target.checked })} />
      <Select label="High chairs" options={HIGH_CHAIRS} value={String(form.highChairs)} onChange={(e) => onChange({ ...form, highChairs: Number(e.target.value) })} />
    </div>
  );
}
