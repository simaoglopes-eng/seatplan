// The photos of the public page: a large cover and thumbnails. Tapping one opens
// a full-screen view with arrows, swipe, and Esc to close (the Dialog handles
// Esc, focus and returning focus). Every photo has its alt text.
import { useEffect, useRef, useState } from "react";
import type { PublicPhoto } from "../../api/discovery";
import { Button, Dialog } from "../../design/components";

/** The cover first, then the rest in the owner's order. */
export function coverFirst(photos: PublicPhoto[]): PublicPhoto[] {
  const cover = photos.findIndex((p) => p.is_cover);
  return cover <= 0 ? photos : [photos[cover], ...photos.filter((_, i) => i !== cover)];
}

export function Gallery({ photos, name }: { photos: PublicPhoto[]; name: string }) {
  const ordered = coverFirst(photos);
  const [open, setOpen] = useState<number | null>(null);
  const touchStart = useRef<number | null>(null);

  const step = (by: number): void => setOpen((i) => (i === null ? i : (i + by + ordered.length) % ordered.length));
  useEffect(() => {
    if (open === null) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // step only uses setOpen and the photo count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ordered.length]);

  if (ordered.length === 0) {
    return (
      <div className="rp-gallery rp-gallery-empty">
        <p className="rb-muted">{name} has not added photos yet.</p>
      </div>
    );
  }
  const current = open === null ? null : ordered[open];
  return (
    <div className="rp-gallery">
      <button type="button" className="rp-cover" onClick={() => setOpen(0)} aria-label={`Open photo 1 of ${ordered.length}: ${ordered[0].alt || name}`}>
        <img src={ordered[0].url} alt={ordered[0].alt} />
      </button>
      {ordered.length > 1 && (
        <ul className="rp-thumbs" aria-label="More photos">
          {ordered.slice(1).map((photo, index) => (
            <li key={photo.url}>
              <button type="button" onClick={() => setOpen(index + 1)} aria-label={`Open photo ${index + 2} of ${ordered.length}: ${photo.alt || name}`}>
                <img src={photo.url} alt={photo.alt} loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={current !== null}
        title={`Photos of ${name}`}
        onClose={() => setOpen(null)}
        actions={
          ordered.length > 1 ? (
            <>
              <Button variant="secondary" onClick={() => step(-1)}>
                Previous
              </Button>
              <Button variant="secondary" onClick={() => step(1)}>
                Next
              </Button>
              <Button onClick={() => setOpen(null)}>Close</Button>
            </>
          ) : (
            <Button onClick={() => setOpen(null)}>Close</Button>
          )
        }
      >
        {current && (
          <figure
            className="rp-lightbox"
            onTouchStart={(event) => {
              touchStart.current = event.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={(event) => {
              const from = touchStart.current;
              const to = event.changedTouches[0]?.clientX;
              touchStart.current = null;
              if (from !== null && to !== undefined && Math.abs(to - from) > 50) step(to < from ? 1 : -1);
            }}
          >
            <img src={current.url} alt={current.alt} />
            <figcaption role="status">
              Photo {(open ?? 0) + 1} of {ordered.length}
              {current.alt ? `: ${current.alt}` : ""}
            </figcaption>
          </figure>
        )}
      </Dialog>
    </div>
  );
}
