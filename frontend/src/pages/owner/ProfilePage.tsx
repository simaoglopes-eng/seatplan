import { useState } from "react";
import { useParams } from "react-router-dom";
import { getOwnerProfile, saveOwnerProfile } from "../../api/owner";
import type { OwnerProfile } from "../../api/owner";
import { Button, ErrorState, Skeleton } from "../../design/components";
import { OwnerShell } from "./OwnerShell";
import { useLoad } from "../restaurant/useLoad";
import { IdentityForm, LocationForm } from "./ProfileForms";
import "./owner.css";

export default function ProfilePage() {
  const { venueId = "" } = useParams();
  const { state, reload } = useLoad(() => getOwnerProfile(venueId), venueId);
  return <OwnerShell title="Restaurant profile" venueId={venueId} current="profile"><h1 className="ow-title">Restaurant profile</h1>
    {state.status === "loading" && <Skeleton label="Loading your profile" lines={4} />}
    {state.status === "error" && <ErrorState message="Could not open this profile. Check your sign-in or retry." onRetry={() => reload()} />}
    {state.status === "ready" && <Profile key={state.data.public_id} initial={state.data} />}
  </OwnerShell>;
}
function Profile({ initial }: { initial: OwnerProfile }) {
  const [profile, setProfile] = useState(initial), [location, setLocation] = useState(false), [message, setMessage] = useState("");
  const save = async (changes: Parameters<typeof saveOwnerProfile>[1]) => { const next = await saveOwnerProfile(profile.public_id, changes); setProfile(next); setMessage(profile.status === "published" && next.status === "draft" ? "Profile saved as a draft. New bookings are closed until you fix the problems and publish again. Existing bookings are kept." : "Profile saved"); };
  return <><nav className="owner-profile-tabs" aria-label="Profile sections"><Button variant="secondary" aria-pressed={!location} onClick={() => { setLocation(false); setMessage(""); }}>Identity</Button><Button variant="secondary" aria-pressed={location} onClick={() => { setLocation(true); setMessage(""); }}>Location</Button></nav><p role="status">{message}</p>
    {location ? <LocationForm profile={profile} label="Save profile" onSave={save} /> : <IdentityForm profile={profile} label="Save profile" onSave={save} />}
  </>;
}
