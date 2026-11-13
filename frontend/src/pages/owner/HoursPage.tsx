// Step 4 of the owner's setup: opening hours (spec 5.3). It wraps the staff
// schedule editor, and for a restaurant with no services yet it offers a model
// to start from. Nothing is saved until the owner taps "Use this".
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getSchedule, saveSchedule } from "../../api/restaurant";
import { Button, ErrorState, PageShell, Skeleton } from "../../design/components";
import { StaffSchedule } from "../restaurant/StaffSchedule";
import { errorMessage } from "../restaurant/format";
import { useLoad } from "../restaurant/useLoad";
import { TEMPLATE_SCHEDULE, TEMPLATE_TEXT } from "./hoursTemplate";
import "./owner.css";

export default function HoursPage() {
  const { venueId = "" } = useParams();
  const { state, reload } = useLoad(() => getSchedule(venueId), venueId);
  const [saved, setSaved] = useState(0);
  return (
    <PageShell title="Opening hours">
      <Link to="/owner">← My restaurants</Link>
      <h1>Opening hours</h1>
      {state.status === "loading" && <Skeleton label="Loading your opening hours" lines={4} />}
      {state.status === "error" && <ErrorState message="Could not open your opening hours. Check your sign-in or retry." onRetry={() => reload()} />}
      {state.status === "ready" && state.data.services.length === 0 && saved === 0 && (
        <Proposal
          venueId={venueId}
          onSaved={() => {
            setSaved((n) => n + 1);
            reload();
          }}
        />
      )}
      {state.status === "ready" && (state.data.services.length > 0 || saved > 0) && <StaffSchedule key={saved} venueId={venueId} />}
      <nav className="owner-card-links" aria-label="Setup steps">
        <Link to={`/owner/${encodeURIComponent(venueId)}/photos`}>← Photos</Link>
        <Link to={`/owner/${encodeURIComponent(venueId)}/rooms`}>Next: rooms →</Link>
        <Link to={`/owner/${encodeURIComponent(venueId)}/review`}>Review and publish</Link>
      </nav>
    </PageShell>
  );
}

function Proposal({ venueId, onSaved }: { venueId: string; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const use = async (): Promise<void> => {
    setBusy(true);
    setProblem("");
    try {
      await saveSchedule(venueId, { services: TEMPLATE_SCHEDULE.service_periods, turn_times: TEMPLATE_SCHEDULE.turn_times, blackout_dates: [] });
      onSaved();
    } catch (error) {
      setProblem(errorMessage(error, "We could not save the opening hours. Please try again."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="owner-card" aria-label="A model to start from">
      <div className="owner-card-body">
        <h2>Start from a model?</h2>
        <p>{TEMPLATE_TEXT}. You can change anything afterwards.</p>
        {problem && (
          <p role="alert" className="room-error">
            {problem}
          </p>
        )}
        <Button busy={busy} onClick={() => void use()}>
          Use this
        </Button>
      </div>
    </section>
  );
}
