// Step 2: the free times for that day, grouped by service (Lunch, Dinner).
// A full time opens the waitlist instead of doing nothing. Times that have
// already passed today are left out: the backend calls them "full" (reason
// "past"), but a waitlist for a time that is over would be a false promise.
import { useState } from "react";
import type { ReactNode } from "react";
import { getSlots } from "../../api/restaurant";
import type { PartyNeeds, RestaurantInfo, TimeSlot } from "../../api/restaurant";
import { Button, EmptyState, ErrorState, Skeleton } from "../../design/components";
import { errorMessage, formatDate, people, toMinutes } from "./format";
import { WhenFields } from "./StepParty";
import "./when.css";
import { SlotButton } from "./SlotButton";
import { StepHeading } from "./StepHeading";
import { useLoad } from "./useLoad";
import { WaitlistDialog } from "./WaitlistDialog";
interface StepTimeProps {
  info?: RestaurantInfo;
  onChange?: (needs: PartyNeeds) => void;
  venueId: string;
  needs: PartyNeeds;
  /** The time asked for on the way in (from a search), if any: when it is gone we point to the closest ones. */
  wanted?: string | null;
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
/**
 * The times closest to the one the diner asked for, when that one cannot be booked: up to `count`
 * bookable times, nearest first. Nothing is hidden: they are only marked in the full list.
 */
export function closestTimes(slots: TimeSlot[], wanted: string | null | undefined, count = 3): string[] {
  if (!wanted) return [];
  const exact = slots.find((slot) => slot.time === wanted);
  if (exact && exact.status !== "full") return [];
  const target = toMinutes(wanted);
  return slots
    .filter((slot) => slot.status !== "full" && slot.reason !== "past")
    .sort((a, b) => Math.abs(toMinutes(a.time) - target) - Math.abs(toMinutes(b.time) - target))
    .slice(0, count)
    .map((slot) => slot.time);
}
export function StepTime({ venueId, needs, wanted, onPick, onBack, info, onChange }: StepTimeProps) {
  const context=`${needs.date}|${needs.party}`;
  const { state, reload } = useLoad(() => getSlots(venueId, needs.date, needs.party).then(answer=>({...answer,requestContext:context})), context);
  const [waitlistTime, setWaitlistTime] = useState<string | null>(null);
  const [selection, setSelection] = useState<{time:string;context:string}|null>(null);
  const selected=selection?.context===context && state.status==="ready" && state.data.requestContext===context && state.data.slots.some(s=>s.time===selection.time && s.status!=="full" && s.reason!=="past") ? selection.time : null;
  const pick = (slot: TimeSlot): void => { if(slot.reason==="past") return; if(slot.status==="full") {setSelection(null);setWaitlistTime(slot.time);} else setSelection({time:slot.time,context}); };
  const lost=state.status==="ready" && wanted && !state.data.slots.some(s=>s.time===wanted && s.status!=="full" && s.reason!=="past");
  const back = (
    <Button variant="secondary" onClick={onBack}>
      Change date or party
    </Button>
  );
  return (
    <section className="rb-step when-times" aria-labelledby="rb-time-title">
      <StepHeading>
        <span id="rb-time-title">{lost ? "Pick another time" : "Choose a time"}</span>
      </StepHeading>
      {info && onChange && <WhenFields info={info} needs={needs} onChange={onChange} />}
      <p className="rb-muted">
        {formatDate(needs.date)}, {people(needs.party)}.
      </p>
      {(state.status === "loading" || (state.status==="ready" && state.data.requestContext!==context)) && <Skeleton lines={4} label="Looking for free times" />}
      {state.status === "error" && <ErrorState title="We could not load the times" message={errorMessage(state.error)} onRetry={() => reload()} />}
      {state.status === "ready" && state.data.requestContext===context && state.data.closed_reason && (
        <EmptyState title="Closed that day" action={back}>
          <p>{state.data.closed_reason}</p>
        </EmptyState>
      )}
      {state.status === "ready" && state.data.requestContext===context && !state.data.closed_reason && <OpenDay slots={state.data.slots} needs={needs} wanted={wanted ?? null} back={info ? null : back} selected={selected} info={info} onPick={pick} />}
      {selected && <div className="when-continue"><Button onClick={()=>onPick(selected)}>Choose a table at {selected}</Button><p className="rb-muted">You’ll choose your table next. Nothing is reserved yet.</p></div>}
      <WaitlistDialog venueId={venueId} needs={needs} time={waitlistTime} onClose={() => setWaitlistTime(null)} />
    </section>
  );
}
interface OpenDayProps {
  info?: RestaurantInfo;
  selected: string|null;
  slots: TimeSlot[];
  needs: PartyNeeds;
  wanted: string | null;
  back: ReactNode;
  onPick: (slot: TimeSlot) => void;
}
/** An open day: its upcoming times, or why there are none. */
function OpenDay({ slots, needs, wanted, back, onPick, selected, info }: OpenDayProps) {
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
      <SlotGroups slots={upcoming} wanted={wanted} selected={selected} starts={info?.services.filter(s=>s.weekday===((new Date(needs.date+"T12:00:00").getDay()+6)%7))} onPick={onPick} />
      {back && <div className="rb-actions">{back}</div>}
    </>
  );
}
function SlotGroups({ slots, wanted, onPick, selected, starts }: { starts?: RestaurantInfo["services"]; slots: TimeSlot[]; wanted: string | null; selected:string|null; onPick: (slot: TimeSlot) => void }) {
  const [allTimes,setAllTimes]=useState(false);
  const allFull = slots.every((slot) => slot.status === "full");
  const near = closestTimes(slots, wanted);
  const serviceStarts=starts?.length ? [...new Map(starts.map(s=>[s.name,{name:s.name,start:s.start_time,end:s.end_time}])).values()] : groupByService(slots).map(g=>({name:g.service,start:g.slots[0].time,end:g.slots[g.slots.length-1].time}));
  const groups=groupByService(slots);
  const preferred=slots.find(s=>s.time===(selected??wanted))?.service ?? nextServiceName();
  function nextServiceName(){return groups[groups.length-1]?.service;}
  const nextService=serviceStarts.find(s=>wanted && s.end>wanted && s.start>wanted);
  return (
    <>
      {allFull && (
        <p className="rb-notice" role="status">
          Every time is booked on this day. Pick a time to join its waitlist, or try another date.
        </p>
      )}
      {near.length > 0 && wanted && <>
        <div className="when-recovery" role="status"><strong>{wanted} is not available.</strong><p>Your date, party and requirements are unchanged.</p>{!slots.some(s=>s.time===wanted) && nextService && <p>{nextService.name} starts at {nextService.start}.</p>}</div>
        <section className="when-alternative-group" aria-label="Next available times"><h3>Next available times</h3><div className="when-alternatives">{near.map(time=><a href={`#when-slot-${time}`} key={time} aria-current={selected===time ? "time" : undefined} onClick={event=>{event.preventDefault();onPick(slots.find(s=>s.time===time)!);}}><strong>{time}</strong>{" "}<span>{selected===time ? "Selected · " : ""}{Math.abs(toMinutes(time)-toMinutes(wanted))} min {time<wanted?"earlier":"later"}</span></a>)}</div></section>
      </>}
      {near.length>0 && <button type="button" className="when-show-all" aria-expanded={allTimes} onClick={()=>setAllTimes(!allTimes)}>{allTimes ? "Hide all service times" : "See all service times"}</button>}
      {(near.length===0 || allTimes) && groups.map((group) => (
        <details key={group.service} className="rb-service when-service" open={group.service===preferred}>
          <summary className="rb-service-title">{group.service}</summary>
          <ul className="rb-slots">
            {group.slots.map((slot) => (
              <li key={slot.time}>
                <SlotButton slot={slot} selected={selected===slot.time} near={near.includes(slot.time)} onPick={onPick} />
              </li>
            ))}
          </ul>
        </details>
      ))}
    </>
  );
}
