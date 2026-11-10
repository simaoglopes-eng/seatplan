// The Optimise tab: put the restaurant optimiser to work on one whole service.
// Two cards: re-plan the tables (preview who would move, then apply) and the
// exact check (how close the quick planner is to the proven best plan).
// Staff first pick the service; the list comes from the saved schedule.
import { useState } from "react";
import { getSchedule } from "../../api/restaurant";
import type { Schedule } from "../../api/restaurant";
import { EmptyState, ErrorState, Select, Skeleton } from "../../design/components";
import { ExactCheckCard } from "./ExactCheckCard";
import { errorMessage, formatDate, needsSignIn } from "./format";
import { ServicePlanCard } from "./ServicePlanCard";
import { SignInPrompt } from "./SignInPrompt";
import { pythonWeekday } from "./StepParty";
import { useLoad } from "./useLoad";

/** The names of the services open on this date, in schedule order, without repeats. */
export function servicesOn(schedule: Schedule, date: string): string[] {
  const weekday = pythonWeekday(date);
  const names = schedule.services.filter((s) => s.weekday === weekday).map((s) => s.name);
  return [...new Set(names)];
}

export function StaffOptimise({ venueId, date }: { venueId: string; date: string }) {
  const { state, reload } = useLoad(() => getSchedule(venueId), venueId);
  if (state.status === "loading") return <Skeleton lines={4} label="Loading the services" />;
  if (state.status === "error") {
    if (needsSignIn(state.error)) return <SignInPrompt venueId={venueId} />;
    return <ErrorState title="We could not load the services" message={errorMessage(state.error)} onRetry={() => reload()} />;
  }
  const services = servicesOn(state.data, date);
  if (services.length === 0) {
    return (
      <EmptyState title="No service on this day">
        <p>The restaurant is closed on {formatDate(date)}, so there is nothing to optimise. Pick another day above.</p>
      </EmptyState>
    );
  }
  return <OptimiseView venueId={venueId} date={date} services={services} />;
}

function OptimiseView({ venueId, date, services }: { venueId: string; date: string; services: string[] }) {
  const [chosen, setChosen] = useState(services[0] ?? "");
  // The day above may change to one without the chosen service; fall back to the first.
  const service = services.includes(chosen) ? chosen : (services[0] ?? "");
  // The key resets both cards when the day or service changes, so an old answer is never shown for another service.
  const key = `${date}|${service}`;
  return (
    <div className="st-dashboard">
      <Select label="Service" options={services.map((name) => ({ value: name, label: name }))} value={service} onChange={(e) => setChosen(e.target.value)} />
      <div className="st-optimise">
        <ServicePlanCard key={`plan-${key}`} venueId={venueId} date={date} service={service} />
        <ExactCheckCard key={`exact-${key}`} venueId={venueId} date={date} service={service} />
      </div>
    </div>
  );
}
