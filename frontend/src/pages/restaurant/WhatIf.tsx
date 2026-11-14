// The optimiser's answer to "where would a party of N go at the selected time?",
// shown in the what-if card and in the walk-in dialog. Asking never changes
// anything; only the "Seat" button in the walk-in dialog writes.
import { useState } from "react";
import { askWhatIf } from "../../api/restaurant";
import type { WhatIfAnswer, WhatIfRequest } from "../../api/restaurant";
import { Button, Select } from "../../design/components";
import type { SelectOption } from "../../design/components";
import { errorMessage, people, tablesText } from "./format";

export const PARTY_CHOICES: SelectOption[] = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: people(i + 1) }));

export function WhatIfAnswerView({ answer, party }: { answer: WhatIfAnswer; party: number }) {
  if (answer.table_ids === null) {
    return (
      <div className="rb-notice rb-notice-warning">
        <p>
          <strong>No table can take {people(party)} at the selected time,</strong> even after moving other parties.
        </p>
        {answer.reasons.length > 0 && <ReasonList reasons={answer.reasons} />}
      </div>
    );
  }
  return (
    <div className="st-answer">
      <p className="st-answer-best">
        Best place: <strong>{tablesText(answer.table_labels)}</strong>
      </p>
      <ReasonList reasons={answer.reasons} />
      {answer.displaced.length === 0 ? (
        <p className="rb-muted">Nobody else has to move.</p>
      ) : (
        <>
          <p>To make room, these bookings would move:</p>
          <ul className="st-displaced">
            {answer.displaced.map((d) => (
              <li key={d.booking_id}>
                {d.name}, {people(d.party_size)}: from {tablesText(d.from_labels)} to {tablesText(d.to_labels)}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ReasonList({ reasons }: { reasons: string[] }) {
  return (
    <ul className="rb-reasons">
      {/* The index as key: two reasons can read the same, e.g. two parties both called "Walk-in". */}
      {reasons.map((reason, index) => (
        <li key={index}>{reason}</li>
      ))}
    </ul>
  );
}

/** The "A party of 6 walks in now" card on the floor. */
export function WhatIfCard({ venueId, date, time }: { venueId: string; date: string; time: string }) {
  const [party, setParty] = useState(6);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<{ party: number; result: WhatIfAnswer } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const ask = async (): Promise<void> => {
    setBusy(true);
    setProblem(null);
    try {
      // The day on screen, not the server's today: staff may be planning another day.
      const question: WhatIfRequest = { party_size: party, date, time, needs_accessible: false, high_chairs: 0 };
      setAnswer({ party, result: await askWhatIf(venueId, question) });
    } catch (error) {
      setProblem(errorMessage(error, "The optimiser did not answer. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rb-card st-whatif" aria-labelledby="st-whatif-title">
      <h2 id="st-whatif-title" className="rb-service-title">
        What if a party of {party} walks in at {time}?
      </h2>
      <div className="st-inline">
        <Select label="Party size" options={PARTY_CHOICES} value={String(party)} onChange={(e) => setParty(Number(e.target.value))} />
        <Button variant="secondary" busy={busy} onClick={() => void ask()}>
          Check
        </Button>
      </div>
      <div aria-live="polite">
        {answer && <WhatIfAnswerView answer={answer.result} party={answer.party} />}
        {problem && <p className="rb-notice rb-notice-error">{problem}</p>}
      </div>
      <p className="rb-muted">Only a preview: nothing changes on the floor.</p>
    </section>
  );
}
