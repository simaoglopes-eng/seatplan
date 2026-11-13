import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createRestaurant, getOwnerProfile, saveOwnerProfile } from "../../api/owner";
import type { OwnerProfile } from "../../api/owner";
import { Button, ErrorState, PageShell, Skeleton } from "../../design/components";
import { useLoad } from "../restaurant/useLoad";
import { EMPTY_PROFILE, IdentityForm, LocationForm } from "./ProfileForms";
import "./owner.css";

export default function NewRestaurantWizard() {
  const { venueId } = useParams();
  const { state, reload } = useLoad(() => venueId ? getOwnerProfile(venueId) : Promise.resolve(EMPTY_PROFILE), venueId ?? "new");
  return <PageShell title="Add a restaurant"><Link to="/owner">← My restaurants</Link>
    {state.status === "loading" && <Skeleton label="Loading your setup" lines={4} />}
    {state.status === "error" && <ErrorState message="Could not open your setup. Check your sign-in or retry." onRetry={() => reload()} />}
    {state.status === "ready" && <Wizard key={state.data.public_id || "new"} initial={state.data} />}
  </PageShell>;
}
function Wizard({ initial }: { initial: OwnerProfile }) {
  const [profile, setProfile] = useState(initial), [step, setStep] = useState(initial.cuisines.length && initial.price_level ? 2 : 1), [saved, setSaved] = useState(false);
  const pendingId = useRef(initial.public_id), navigate = useNavigate();
  return <section><h1>Add a restaurant</h1><ol className="owner-steps" aria-label="Restaurant setup steps">{["Identity", "Location", "Photos", "Opening hours", "Rooms", "Review"].map((name, index) => <li key={name} aria-current={index + 1 === step ? "step" : undefined}>{index + 1}. {name}</li>)}</ol>
    {saved ? <><h2>Location saved</h2><p>You can leave and resume setup from your restaurants.</p><Link to={`/owner/${profile.public_id}/photos`}>Continue to photos</Link></> : step === 1 ? <><h2>Identity</h2><IdentityForm key={profile.public_id} profile={profile} label="Save and continue" onSave={async changes => {
      if (!pendingId.current) pendingId.current = (await createRestaurant(changes.name!)).public_id;
      const next = await saveOwnerProfile(pendingId.current, changes); setProfile(next); setStep(2);
      if (!initial.public_id) navigate(`/owner/${next.public_id}/setup`, { replace: true });
    }} /></> : <><h2>Location</h2><Button variant="secondary" onClick={() => setStep(1)}>Back</Button><LocationForm profile={profile} label="Save and continue" onSave={async changes => { setProfile(await saveOwnerProfile(profile.public_id, changes)); setSaved(true); setStep(3); }} /></>}
  </section>;
}
