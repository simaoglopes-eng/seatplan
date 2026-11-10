// Route /e/:token: the attendee's personal invitation page. Mobile first.
//
// Journey: Reply -> People you know (optional) -> Choose seat -> Done.
// useAttendee owns the data and the API calls; attendeeRules.currentStep
// decides which step to show; this file only puts the pieces together.
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { PageShell, Stepper } from "../../design/components";
import { ClosedStep, DeclinedStep, AttendeeSkeleton, LinkProblem } from "./AttendeeStates";
import { currentStep, stepIndex } from "./attendeeRules";
import type { AttendeeStep } from "./attendeeRules";
import { DoneStep } from "./DoneStep";
import { EventHeader } from "./EventHeader";
import { PeopleStep } from "./PeopleStep";
import { SeatStep } from "./SeatStep";
import { useAttendee } from "./useAttendee";
import type { AttendeeState } from "./useAttendee";
import { WelcomeStep } from "./WelcomeStep";
import "./events.css";

const STEPS = ["Reply", "People you know", "Choose seat", "Done"];

export default function AttendeePage() {
  const { token = "" } = useParams();
  const state = useAttendee(token);
  const [peopleDone, setPeopleDone] = useState(false);

  if (state.load.status === "loading") {
    return (
      <PageShell title="Your invitation">
        <AttendeeSkeleton />
      </PageShell>
    );
  }
  if (state.load.status === "error") {
    return (
      <PageShell title="Invitation link">
        <LinkProblem error={state.load.error} onRetry={state.actions.retry} />
      </PageShell>
    );
  }
  const view = state.load.view;
  const step = currentStep({ view, peopleDone, changingSeat: state.changingSeat });
  return (
    <PageShell title={view.event.name}>
      <div className="ev-page">
        <EventHeader event={view.event} venueName={view.venue.name} />
        <Stepper steps={STEPS} current={stepIndex(step)} label="Your progress" />
        {/* One polite live region for the results of everything the person does on this page. */}
        <p className="visually-hidden" role="status" aria-live="polite">
          {state.message}
        </p>
        <StepBody step={step} state={state} onPeopleDone={() => setPeopleDone(true)} />
      </div>
    </PageShell>
  );
}

interface StepBodyProps {
  step: AttendeeStep;
  state: AttendeeState;
  onPeopleDone: () => void;
}

function StepBody({ step, state, onPeopleDone }: StepBodyProps) {
  // Focus moves to the new step's heading only after the first screen, never on page load.
  const firstStep = useRef(step);
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    if (step !== firstStep.current) setMoved(true);
  }, [step]);

  if (state.load.status !== "ready") return null;
  const view = state.load.view;
  const { actions, busy } = state;
  switch (step) {
    case "welcome":
      return <WelcomeStep firstName={view.me.name.split(" ")[0]} busy={busy === "rsvp"} onAnswer={actions.rsvp} />;
    case "declined":
      return <DeclinedStep busy={busy === "rsvp"} moved={moved} onChangeMind={() => actions.rsvp("yes")} />;
    case "closed":
      return <ClosedStep view={view} />;
    case "people":
      return <PeopleStep people={view.people} busy={busy === "knows"} moved={moved} onSave={(ids) => actions.saveKnows(ids, onPeopleDone)} onSkip={onPeopleDone} />;
    case "seat":
      return <SeatStep state={state} view={view} moved={moved} />;
    case "done":
      return <DoneStep state={state} view={view} moved={moved} />;
  }
}
