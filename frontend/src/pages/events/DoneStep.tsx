// Step 4: success. The seat label is the biggest thing on screen, the email
// promise tells people they can close the page, and the two ways back
// (change, release) are there but quieter than the good news.
import { useState } from "react";
import type { AttendeeView } from "../../api/events";
import { Button, Dialog } from "../../design/components";
import { SeatMap } from "../../seatmap/SeatMap";
import { AnonymousSwitch } from "./AnonymousSwitch";
import { formatDeadline, seatName } from "./format";
import { StepTitle } from "./StepTitle";
import type { AttendeeState } from "./useAttendee";

interface DoneStepProps {
  state: AttendeeState;
  view: AttendeeView;
  moved: boolean;
  /** Replaces the email sentence, for example on a guest account's seat page. */
  emailNote?: string;
}

const NOTHING_SELECTABLE = (): boolean => false;

export function DoneStep({ state, view, moved, emailNote }: DoneStepProps) {
  const [askRelease, setAskRelease] = useState(false);
  const { map, me, event } = view;
  const seatId = me.seat_id ?? -1;
  const label = seatName(seatId, map.seats, map.tables);
  const deadline = event.change_deadline ? ` until ${formatDeadline(event.change_deadline)}` : "";

  return (
    <section className="ev-card ev-success" aria-labelledby="ev-done">
      <StepTitle id="ev-done" focusOnMount={moved}>
        You are all set
      </StepTitle>
      <p className="ev-seat-big">{label}</p>
      <p>{emailNote ?? "A confirmation email with a calendar invite is on its way to you."} You can close this page.</p>
      <div className="ev-map">
        <SeatMap label={`Your seat on the map, ${label}`} zones={map.zones} tables={map.tables} seats={map.seats} selectedId={seatId} selectable={NOTHING_SELECTABLE} />
      </div>
      <AnonymousSwitch value={me.wants_anonymous} busy={state.busy === "privacy"} onChange={state.actions.setAnonymous} />
      <p className="ev-muted">You can change or release your seat{deadline}.</p>
      <div className="ev-actions">
        <Button variant="secondary" onClick={state.actions.startChange}>
          Change seat
        </Button>
        <Button variant="ghost" onClick={() => setAskRelease(true)}>
          Release my seat
        </Button>
      </div>
      <Dialog
        open={askRelease}
        title={`Release ${label}?`}
        onClose={() => setAskRelease(false)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setAskRelease(false)}>
              Keep my seat
            </Button>
            <Button variant="danger" busy={state.busy === "release"} onClick={() => state.actions.release().then(() => setAskRelease(false))}>
              Release seat
            </Button>
          </>
        }
      >
        <p>Someone else can take it straight away. You can choose a new seat{deadline}.</p>
      </Dialog>
    </section>
  );
}
