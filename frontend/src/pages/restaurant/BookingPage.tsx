// Route /r/:venueId: the diner's booking flow, mobile first.
//
// Five steps, one screen each: 1 date and party, 2 time, 3 table, 4 details,
// 5 confirmation. This file only draws: the answers so far live in
// useBookingFlow.ts, and each step lives in its own file.
import { Navigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { getRestaurant } from "../../api/restaurant";
import type { RestaurantInfo } from "../../api/restaurant";
import { EmptyState, ErrorState, PageShell, Skeleton, Stepper } from "../../design/components";
import { ChooseSeat } from "./ChooseSeat";
import { Confirmation } from "./Confirmation";
import { errorMessage } from "./format";
import { StepDetails } from "./StepDetails";
import { StepParty } from "./StepParty";
import { StepTable } from "./StepTable";
import { StepTime } from "./StepTime";
import { STEP, useBookingFlow } from "./useBookingFlow";
import { useLinkedTime } from "./useLinkedTime";
import { useLoad } from "./useLoad";
import "./restaurant.css";

const STEPS = ["Date and party", "Time", "Table", "Your details", "Done"];

export default function BookingPage() {
  const { venueId = "" } = useParams();
  const { state, reload } = useLoad(() => getRestaurant(venueId), venueId);
  const title = state.status === "ready" ? `Book at ${state.data.name}` : "Book a table";
  return (
    <PageShell title={title}>
      <div className="rb-page">
        <h1 className="rb-title">{title}</h1>
        {state.status === "loading" && <Skeleton lines={5} label="Loading the restaurant" />}
        {state.status === "error" && <LoadError error={state.error} onRetry={() => reload()} />}
        {state.status === "ready" && state.data.slug && <ForwardToPublicPage slug={state.data.slug} />}
        {state.status === "ready" && !state.data.slug && state.data.max_party < 1 && <NotBookable name={state.data.name} />}
        {state.status === "ready" && !state.data.slug && state.data.max_party >= 1 && <BookingFlow venueId={venueId} info={state.data} />}
      </div>
    </PageShell>
  );
}

/** An old /r/<id> link of a restaurant with a public page goes there, keeping ?date=&time=&party=. */
function ForwardToPublicPage({ slug }: { slug: string }) {
  const { search } = useLocation();
  return <Navigate to={`/restaurants/${encodeURIComponent(slug)}${search}`} replace />;
}

function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (error instanceof ApiError && error.code === "not_found") {
    return (
      <EmptyState title="We cannot find this restaurant">
        <p>The booking link may be old or mistyped. Please ask the restaurant for its current link.</p>
      </EmptyState>
    );
  }
  return <ErrorState title="We could not open the booking page" message={errorMessage(error)} onRetry={onRetry} />;
}

/** The whole booking flow for one restaurant, loading it first. The public page embeds this. */
export function BookingEmbed({ venueId }: { venueId: string }) {
  const { state, reload } = useLoad(() => getRestaurant(venueId), venueId);
  return (
    <>
      {state.status === "loading" && <Skeleton lines={5} label="Loading the booking form" />}
      {state.status === "error" && <LoadError error={state.error} onRetry={() => reload()} />}
      {state.status === "ready" && state.data.max_party < 1 && <NotBookable name={state.data.name} />}
      {state.status === "ready" && state.data.max_party >= 1 && <BookingFlow venueId={venueId} info={state.data} />}
    </>
  );
}

/** max_party is 0 when no table or no service is set up yet: a party-size list would be empty. */
function NotBookable({ name }: { name: string }) {
  return (
    <EmptyState title="Online booking is not open">
      <p>{name} is not taking bookings online yet. Please call the restaurant.</p>
    </EmptyState>
  );
}

function BookingFlow({ venueId, info }: { venueId: string; info: RestaurantInfo }) {
  // A waitlist offer email links here with ?date=&time=&party= filled in.
  const [params] = useSearchParams();
  const link = { date: params.get("date"), party: params.get("party"), time: params.get("time") };
  const flow = useBookingFlow(info, link);
  const linked = useLinkedTime(venueId, link, flow);
  const { step, needs, time, hold } = flow;
  if (linked.checking) return <Skeleton lines={3} label="Checking that time" />;
  return (
    <>
      {linked.notice && step === STEP.time && <p role="status" className="rb-muted">{linked.notice}</p>}
      <Stepper steps={STEPS} current={step} label="Booking steps" />
      {step === STEP.party && <StepParty info={info} needs={needs} onChange={flow.setNeeds} onNext={() => flow.go(STEP.time)} focusOnMount={false} />}
      {step === STEP.time && <StepTime venueId={venueId} needs={needs} onPick={flow.pickTime} onBack={() => flow.go(STEP.party)} />}
      {step === STEP.table && flow.choosingSeat && hold && (
        <ChooseSeat venueId={venueId} hold={hold} secondsLeft={flow.secondsLeft} seatId={flow.seatId} onDone={flow.chooseSeat} onBackToMap={flow.backToMap} />
      )}
      {step === STEP.table && time && !flow.choosingSeat && (
        <StepTable
          venueId={venueId}
          needs={needs}
          time={time}
          hold={hold}
          secondsLeft={flow.secondsLeft}
          carriedNotice={flow.carriedNotice}
          onHold={flow.setHold}
          onNext={flow.askSeat}
          onBack={() => flow.go(STEP.time)}
        />
      )}
      {step === STEP.details && hold && (
        <StepDetails
          venueId={venueId}
          needs={needs}
          hold={hold}
          seatId={flow.seatId}
          secondsLeft={flow.secondsLeft ?? 0}
          contact={flow.contact}
          onContactChange={flow.setContact}
          onBooked={flow.booked}
          onHoldLost={flow.holdLost}
          onBack={() => flow.go(STEP.table)}
        />
      )}
      {step === STEP.done && flow.confirmation && <Confirmation confirmation={flow.confirmation} />}
    </>
  );
}
