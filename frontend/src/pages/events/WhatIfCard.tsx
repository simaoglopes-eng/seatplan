// What-if mode: dropping or placing a guest only asks "what would the score
// be?". This card shows the answer and waits for Make this move or Cancel.
import * as eventsApi from "../../api/events";
import type { OrganiserEvent } from "../../api/events";
import { Button, Checkbox } from "../../design/components";
import { seatName, signed } from "./format";
import { ScoreTable } from "./ScoreTable";
import type { OrganiserState } from "./useOrganiser";

export function WhatIfCard({ org, data }: { org: OrganiserState; data: OrganiserEvent }) {
  const pending = org.pendingMove;
  const toggle = (on: boolean): void => {
    org.setWhatIfMode(on);
    org.setPendingMove(null);
    org.announce(on ? "What-if mode on: moves show their score change first." : "What-if mode off: moves happen straight away.");
  };

  return (
    <section className="ev-card-flat" aria-labelledby="ev-whatif">
      <h3 id="ev-whatif" className="ev-subtitle">
        What if?
      </h3>
      <Checkbox
        label="Show the score change before moving anyone"
        hint="Drag a guest to a seat, or press Place and choose a seat. Nothing moves until you confirm."
        checked={org.whatIfMode}
        onChange={(e) => toggle(e.target.checked)}
      />
      {pending && <PendingMoveView org={org} data={data} />}
    </section>
  );
}

function PendingMoveView({ org, data }: { org: OrganiserState; data: OrganiserEvent }) {
  const pending = org.pendingMove;
  if (!pending) return null;
  const guest = data.guests.find((g) => g.id === pending.move.guest_id);
  const label = seatName(pending.move.seat_id, data.map.seats, data.map.tables);
  const { before, after, delta, hard_rule_problems: problems } = pending.result;
  const verdict = delta.total > 0 ? "better" : delta.total < 0 ? "worse" : "the same";

  const commit = async (): Promise<void> => {
    const ok = await org.run("whatif-commit", `${guest?.name ?? "Guest"} now sits at ${label}.`, async () => {
      await eventsApi.assignSeat(org.eventId, pending.move.guest_id, pending.move.seat_id);
    });
    if (ok) {
      org.setPendingMove(null);
      org.setSelectedGuest(null);
    }
  };

  return (
    <div className="ev-preview" aria-live="polite">
      <p>
        Moving <strong>{guest?.name}</strong> to <strong>{label}</strong> makes the plan {verdict}: {signed(delta.total)} points (from{" "}
        {before.total} to {after.total}).
      </p>
      {problems.length > 0 && (
        <div className="ev-warning">
          <p>This move breaks a rule, so it cannot be made:</p>
          <ul>
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}
      <ScoreTable
        caption="Score change of this move"
        columns={[
          { heading: "Now", score: before },
          { heading: "After", score: after },
          { heading: "Change", score: delta, signed: true },
        ]}
      />
      <div className="ev-actions">
        <Button busy={org.busy === "whatif-commit"} disabled={problems.length > 0} onClick={() => void commit()}>
          Make this move
        </Button>
        <Button variant="secondary" onClick={() => org.setPendingMove(null)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
