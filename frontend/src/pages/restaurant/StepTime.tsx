// Step 2: the free times for that day, grouped by service (Lunch, Dinner).
// A full time opens the waitlist instead of doing nothing. Times that have
// already passed today are left out: the backend calls them "full" (reason
// "past"), but a waitlist for a time that is over would be a false promise.
import { useState } from "react";
import type { ReactNode } from "react";
import { getSlots } from "../../api/restaurant";
import type { PartyNeeds, TimeSlot } from "../../api/restaurant";
import { Button, EmptyState, ErrorState, Skeleton } from "../../design/components";
import { errorMessage, formatDate, people } from "./format";
import { SlotButton } from "./SlotButton";
import { StepHeading } from "./StepHeading";
import { useLoad } from "./useLoad";
import { WaitlistDialog } from "./WaitlistDialog";

interface StepTimeProps {
  venueId: string;
  needs: PartyNeeds;
  onPick: (time: string) => void;
  onBack: () => void;
}

/** Keeps the server's order of services and of times inside each service. */
export function groupByService(slots: TimeSlot[]): { service: string; slots: TimeSlot[] }[] {
  const groups: { service: string; slots: TimeSlot[] }[] = [];
  for (const slot of slots) {
    const group = groups.find((g) => g.service === slot.service);
    if (group) group.slots.push(slot);
    else groups.push({ service: slot.service, slots: [slot] });
  }
  return groups;
}

/** Times the diner can still act on: everything except times that are already over. */
export function upcomingSlots(slots: TimeSlot[]): TimeSlot[] {
  return slots.filter((slot) => slot.reason !== "past");
}

export function StepTime({ venueId, needs, onPick, onBack }: StepTimeProps) {
  const { state, reload } = useLoad(() => getSlots(venueId, needs.date, needs.party), `${needs.date}|${needs.party}`);
  const [waitlistTime, setWaitlistTime] = useState<string | null>(null);
  const pick = (slot: TimeSlot): void => (slot.status === "full" ? setWaitlistTime(slot.time) : onPick(slot.time));
  const back = (
    <Button variant="secondary" onClick={onBack}>
      Change date or party
    </Button>
  );

  return (
    <section className="rb-step" aria-labelledby="rb-time-title">
      <StepHeading>
        <span id="rb-time-title">Pick a time</span>
      </StepHeading>
      <p className="rb-muted">
        {formatDate(needs.date)}, {people(needs.party)}.
      </p>
      {state.status === "loading" && <Skeleton lines={4} label="Looking for free times" />}
      {state.status === "error" && <ErrorState title="We could not load the times" message={errorMessage(state.error)} onRetry={() => reload()} />}
      {state.status === "ready" && state.data.closed_reason && (
        <EmptyState title="Closed that day" action={back}>
          <p>{state.data.closed_reason}</p>
        </EmptyState>
      )}
      {state.status === "ready" && !state.data.closed_reason && <OpenDay slots={state.data.slots} needs={needs} back={back} onPick={pick} />}
      <WaitlistDialog venueId={venueId} needs={needs} time={waitlistTime} onClose={() => setWaitlistTime(null)} />
    </section>
  );
}

interface OpenDayProps {
  slots: TimeSlot[];
  needs: PartyNeeds;
  back: ReactNode;
  onPick: (slot: TimeSlot) => void;
}

/** An open day: its upcoming times, or why there are none. */
function OpenDay({ slots, needs, back, onPick }: OpenDayProps) {
  const upcoming = upcomingSlots(slots);
  if (upcoming.length === 0 && slots.length > 0) {
    return (
      <EmptyState title="No times left today" action={back}>
        <p>Every time on this day has already passed. Please pick another date.</p>
      </EmptyState>
    );
  }
  if (upcoming.length === 0) {
    return (
      <EmptyState title="No times on this day" action={back}>
        <p>There are no bookable times for {people(needs.party)} on this day. Try another date or a smaller party.</p>
      </EmptyState>
    );
  }
  return (
    <>
      {upcoming.length < slots.length && <p className="rb-muted">Times that have already passed are not shown.</p>}
      <SlotGroups slots={upcoming} onPick={onPick} />
      <div className="rb-actions">{back}</div>
    </>
  );
}

function SlotGroups({ slots, onPick }: { slots: TimeSlot[]; onPick: (slot: TimeSlot) => void }) {
  const allFull = slots.every((slot) => slot.status === "full");
  return (
    <>
      {allFull && (
        <p className="rb-notice" role="status">
          Every time is booked on this day. Pick a time to join its waitlist, or try another date.
        </p>
      )}
      {groupByService(slots).map((group) => (
        <div key={group.service} className="rb-service">
          <h3 className="rb-service-title">{group.service}</h3>
          <ul className="rb-slots">
            {group.slots.map((slot) => (
              <li key={slot.time}>
                <SlotButton slot={slot} onPick={onPick} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
