import { lazy, Suspense, useState } from "react";
import { Button, Checkbox, Field, Select, Skeleton } from "../../design/components";
import { CUISINES } from "../../api/owner";
import type { OwnerProfile, ProfileChanges } from "../../api/owner";
import { phoneError } from "../restaurant/validation";
const LeafletMap = lazy(() => import("../../maps/LeafletMap"));

export const EMPTY_PROFILE: OwnerProfile = { public_id: "", status: "draft", slug: "", name: "", description: "", cuisines: [], price_level: 2, phone: null, website: null, instagram: null, google_maps_url: null, address: "", lat: null, lng: null, timezone: "Europe/Lisbon" };
export const cuisineLabel = (value: string) => value[0].toUpperCase() + value.slice(1);

export function IdentityForm({ profile, label, onSave }: { profile: OwnerProfile; label: string; onSave: (changes: ProfileChanges) => Promise<void> }) {
  const [values, setValues] = useState(profile), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const change = (patch: ProfileChanges) => setValues(v => ({ ...v, ...patch }));
  return <form className="owner-form" onSubmit={event => { event.preventDefault(); void (async () => {
    if (!values.name.trim() || values.cuisines.length < 1) { setError("Enter a name and choose one to three cuisines."); return; }
    const phone = phoneError(values.phone ?? ""); if (phone) { setError(phone); return; }
    setBusy(true); setError("");
    try { const { name, description, cuisines, price_level, phone, website, instagram, google_maps_url, slug } = values; await onSave({ name, description, cuisines, price_level, phone, website: website || null, instagram: instagram || null, google_maps_url: google_maps_url || null, ...(slug ? { slug } : {}) }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save the identity."); } finally { setBusy(false); }
  })(); }}>
    <Field label="Restaurant name" value={values.name} required maxLength={120} onChange={e => change({ name: e.target.value })} />
    <label className="field"><span className="field-label">Short description</span><textarea className="field-input" maxLength={300} value={values.description} onChange={e => change({ description: e.target.value })} /><span>{values.description.length}/300 characters</span></label>
    <fieldset className="owner-cuisines"><legend>Cuisines (choose 1–3)</legend>{CUISINES.map(c => <Checkbox key={c} label={cuisineLabel(c)} checked={values.cuisines.includes(c)} disabled={values.cuisines.length === 3 && !values.cuisines.includes(c)} onChange={e => change({ cuisines: e.target.checked ? [...values.cuisines, c] : values.cuisines.filter(item => item !== c) })} />)}</fieldset>
    <Select label="Price range" value={String(values.price_level ?? "")} required options={[{ value: "", label: "Choose a range" }, { value: "1", label: "€ · per person: under 15 €" }, { value: "2", label: "€€ · per person: 15–30 €" }, { value: "3", label: "€€€ · per person: 30–60 €" }, { value: "4", label: "€€€€ · per person: over 60 €" }]} onChange={e => change({ price_level: Number(e.target.value) })} />
    <Field label="Phone" type="tel" value={values.phone ?? ""} maxLength={40} onChange={e => change({ phone: e.target.value })} />
    <Field label="Website" type="url" value={values.website ?? ""} maxLength={200} onChange={e => change({ website: e.target.value })} />
    <Field label="Instagram" value={values.instagram ?? ""} maxLength={31} pattern="@?[A-Za-z0-9._]{1,30}" onChange={e => change({ instagram: e.target.value })} />
    <Field label="Google Maps link" type="url" value={values.google_maps_url ?? ""} maxLength={200} onChange={e => change({ google_maps_url: e.target.value })} />
    {profile.public_id && <Field label="Public link" hint={profile.status === "published" ? "Fixed after publication." : "Use lowercase letters, digits and hyphens."} value={values.slug ?? ""} readOnly={profile.status === "published"} required={profile.status === "draft"} maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" onChange={e => change({ slug: e.target.value })} />}
    {error && <p role="alert" className="owner-error">{error}</p>}<Button type="submit" busy={busy}>{label}</Button>
  </form>;
}

export function LocationForm({ profile, label, onSave }: { profile: OwnerProfile; label: string; onSave: (changes: ProfileChanges) => Promise<void> }) {
  const [address, setAddress] = useState(profile.address), [lat, setLat] = useState(profile.lat?.toString() ?? ""), [lng, setLng] = useState(profile.lng?.toString() ?? "");
  const [timezone, setTimezone] = useState(profile.timezone), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const zones = ["Europe/Lisbon", "Atlantic/Madeira", "Atlantic/Azores"];
  const valid = lat.trim() !== "" && lng.trim() !== "" && Number.isFinite(Number(lat.replace(",", "."))) && Math.abs(Number(lat.replace(",", "."))) <= 90 && Number.isFinite(Number(lng.replace(",", "."))) && Math.abs(Number(lng.replace(",", "."))) <= 180;
  const point = valid ? { lat: Number(lat.replace(",", ".")), lng: Number(lng.replace(",", ".")) } : null;
  return <form className="owner-form" onSubmit={event => { event.preventDefault(); if (!point) { setError("Place the pin or enter valid latitude and longitude."); return; } setBusy(true); setError(""); void onSave({ address, ...point, timezone }).catch(caught => setError(caught instanceof Error ? caught.message : "Could not save the location.")).finally(() => setBusy(false)); }}>
    <Field label="Address" value={address} required maxLength={200} onChange={e => setAddress(e.target.value)} />
    <Suspense fallback={<Skeleton label="Loading the location map" lines={4} />}><LeafletMap point={point} onChange={p => { setLat(p.lat.toFixed(6)); setLng(p.lng.toFixed(6)); }} /></Suspense>
    <p>{point ? `Pin at ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}.` : "Place the pin on your building."} The sun on your tables is worked out from this point, so place it on your building.</p>
    <Button variant="secondary" busy={locating} onClick={() => { if (!navigator.geolocation) { setError("Location is unavailable. Place the pin manually."); return; } setLocating(true); navigator.geolocation.getCurrentPosition(position => { setLat(position.coords.latitude.toFixed(6)); setLng(position.coords.longitude.toFixed(6)); setLocating(false); setError(""); }, () => { setLocating(false); setError("Could not get your location. Place the pin manually."); }, { timeout: 10000, maximumAge: 0 }); }}>Use my current location</Button>
    <div className="owner-location-fields"><Field label="Latitude" value={lat} inputMode="decimal" required onChange={e => setLat(e.target.value)} /><Field label="Longitude" value={lng} inputMode="decimal" required onChange={e => setLng(e.target.value)} /></div>
    <Select label="Time zone" value={zones.includes(timezone) ? timezone : "other"} options={[...zones.map(value => ({ value, label: value })), { value: "other", label: "Other…" }]} onChange={e => setTimezone(e.target.value === "other" ? "" : e.target.value)} />
    {!zones.includes(timezone) && <Field label="Other time zone" value={timezone} required maxLength={64} onChange={e => setTimezone(e.target.value)} />}
    {error && <p role="alert" className="owner-error">{error}</p>}<Button type="submit" busy={busy}>{label}</Button>
  </form>;
}
