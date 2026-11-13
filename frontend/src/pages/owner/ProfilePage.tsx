import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getOwnerProfile, saveOwnerProfile } from "../../api/owner";
import type { OwnerProfile } from "../../api/owner";
import { Button, ErrorState, PageShell, Skeleton } from "../../design/components";
import { useLoad } from "../restaurant/useLoad";
import { IdentityForm, LocationForm } from "./ProfileForms";
import "./owner.css";

export default function ProfilePage() {
  const { venueId = "" } = useParams();
  const { state, reload } = useLoad(() => getOwnerProfile(venueId), venueId);
  return <PageShell title="Restaurant profile"><Link to="/owner">← My restaurants</Link><h1>Restaurant profile</h1>
    {state.status === "loading" && <Skeleton label="Loading your profile" lines={4} />}
    {state.status === "error" && <ErrorState message="Could not open this profile. Check your sign-in or retry." onRetry={() => reload()} />}
    {state.status === "ready" && <Profile key={state.data.public_id} initial={state.data} />}
  </PageShell>;
}
function Profile({ initial }: { initial: OwnerProfile }) {
  const [profile, setProfile] = useState(initial), [location, setLocation] = useState(false), [message, setMessage] = useState("");
  const save = async (changes: Parameters<typeof saveOwnerProfile>[1]) => { setProfile(await saveOwnerProfile(profile.public_id, changes)); setMessage("Profile saved"); };
  return <><nav className="owner-profile-tabs" aria-label="Profile sections"><Button variant="secondary" aria-pressed={!location} onClick={() => { setLocation(false); setMessage(""); }}>Identity</Button><Button variant="secondary" aria-pressed={location} onClick={() => { setLocation(true); setMessage(""); }}>Location</Button></nav><p role="status">{message}</p>
    {location ? <LocationForm profile={profile} label="Save profile" onSave={save} /> : <IdentityForm profile={profile} label="Save profile" onSave={save} />}
  </>;
}
