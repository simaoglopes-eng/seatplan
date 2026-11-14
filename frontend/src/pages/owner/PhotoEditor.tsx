import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { deletePhoto, describePhoto, listPhotos, orderPhotos, uploadPhoto } from "../../api/photos";
import type { OwnerPhoto } from "../../api/photos";
import { Button, ErrorState, Field, Skeleton } from "../../design/components";
import { OwnerShell } from "./OwnerShell";
import { useLoad } from "../restaurant/useLoad";
import { PhotoPreview } from "./PhotoPreview";
import { resizePhoto } from "./photoResize";
import "./owner.css";

export default function PhotoEditorPage() {
  const { venueId = "" } = useParams(), [query] = useSearchParams();
  return <OwnerShell title="Restaurant photos" venueId={venueId} current="photos"><h1 className="ow-title">{query.get("opening") ? "Window view photo" : "Restaurant photos"}</h1><p>Step 3 of 6 · Photos</p><PhotoEditor venueId={venueId} openingKey={query.get("opening") ?? undefined} />
    <Link className="btn btn-primary" to={`/owner/${venueId}/hours`}>Save and continue</Link>
  </OwnerShell>;
}

export function PhotoEditor({ venueId, openingKey }: { venueId: string; openingKey?: string }) {
  const { state, reload } = useLoad(() => listPhotos(venueId), venueId);
  return state.status === "loading" ? <Skeleton label="Loading photos" lines={4} /> : state.status === "error" ? <ErrorState message="Could not load your photos. Check your sign-in or retry." onRetry={() => reload()} /> : <Gallery key={`${venueId}:${openingKey ?? "gallery"}`} venueId={venueId} openingKey={openingKey} initial={state.data} />;
}
function Gallery({ venueId, openingKey, initial }: { venueId: string; openingKey?: string; initial: OwnerPhoto[] }) {
  const [photos, setPhotos] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const items = openingKey ? photos.filter(p => p.kind === "view" && String(p.opening_id) === openingKey.replace(/^o/, "")) : photos.filter(p => p.kind === "gallery");
  const maximum = openingKey ? 1 : 10;
  const perform = async (change: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await change(); setPhotos(await listPhotos(venueId)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not change the gallery."); setPhotos(await listPhotos(venueId).catch(() => photos)); }
    finally { setBusy(false); }
  };
  const add = (files: File[]) => {
    if (!files.length || busy) return;
    if (items.length + files.length > maximum) { setError(`You can have at most ${maximum} ${openingKey ? "view photo" : "gallery photos"}.`); return; }
    void perform(async () => { for (const file of files) await uploadPhoto(venueId, { ...await resizePhoto(file), kind: openingKey ? "view" : "gallery", ...(openingKey ? { opening_key: openingKey } : {}), alt_text: "" }); });
  };
  const move = (from: number, to: number) => {
    if (from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return;
    const ids = items.map(p => p.id), moved = ids.splice(from, 1)[0]; ids.splice(to, 0, moved);
    void perform(() => orderPhotos(venueId, ids, items.find(p => p.is_cover)?.id ?? ids[0]));
  };
  return <section aria-label={openingKey ? "Window view photo" : "Photo gallery"} className="owner-photo-editor">
    <div className="owner-photo-drop" onDragOver={event => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }} onDrop={event => { if (event.dataTransfer.files.length) { event.preventDefault(); add(Array.from(event.dataTransfer.files)); } }}>
      <label className="field"><span className="field-label">Add photos</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple={!openingKey} disabled={busy || items.length >= maximum} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; add(files); }} /></label>
      <p>Drop photos here, or choose from your gallery or camera. JPEG, PNG or WebP, up to 15 MB each. Photos are resized before upload.</p>
    </div>
    <p role="status">{busy ? "Saving photos…" : `${items.length} of ${maximum} photos`}</p>
    {error && <p role="alert" className="owner-error">{error}</p>}
    <div className="owner-photo-grid">{items.map((photo, index) => <article key={photo.id} className="owner-photo-card" draggable={!openingKey && !busy} onDragStart={event => { event.dataTransfer.setData("application/x-seatplan-photo", String(index)); event.dataTransfer.effectAllowed = "move"; }} onDragOver={event => { if (!busy && !openingKey && event.dataTransfer.types.includes("application/x-seatplan-photo")) event.preventDefault(); }} onDrop={event => { if (!busy && !openingKey) { const from = event.dataTransfer.getData("application/x-seatplan-photo"); if (from !== "") { event.preventDefault(); move(Number(from), index); } } }}>
      <PhotoPreview url={photo.url} alt={photo.alt_text} className="owner-photo-thumbnail" />
      {photo.is_cover && <p>Cover</p>}
      <PhotoDescription photo={photo} number={index + 1} disabled={busy} onSave={text => perform(() => describePhoto(venueId, photo.id, text))} />
      {!openingKey && <div className="owner-photo-actions"><Button variant="secondary" disabled={busy || photo.is_cover} aria-label={`Set photo ${index + 1} as cover`} onClick={() => void perform(() => orderPhotos(venueId, items.map(p => p.id), photo.id))}>Set as cover</Button>
        <Button variant="secondary" disabled={busy || index === 0} aria-label={`Move photo ${index + 1} left`} onClick={() => move(index, index - 1)}>Move left</Button><Button variant="secondary" disabled={busy || index === items.length - 1} aria-label={`Move photo ${index + 1} right`} onClick={() => move(index, index + 1)}>Move right</Button></div>}
      <Button variant="danger" disabled={busy} aria-label={`Remove photo ${index + 1}`} onClick={() => void perform(() => deletePhoto(venueId, photo.id))}>Remove</Button>
    </article>)}</div>
  </section>;
}
function PhotoDescription({ photo, number, disabled, onSave }: { photo: OwnerPhoto; number: number; disabled: boolean; onSave: (text: string) => Promise<void> }) {
  const [text, setText] = useState(photo.alt_text);
  useEffect(() => setText(photo.alt_text), [photo.alt_text]);
  return <Field label={`Describe photo ${number}`} hint="Describe what is visible (recommended)." value={text} maxLength={150} disabled={disabled} onChange={e => setText(e.target.value)} onBlur={() => { if (text !== photo.alt_text) void onSave(text); }} />;
}
