// A photo of the restaurant. A published restaurant's photos are public, so the browser loads them
// by address. A draft's photos are the owner's alone (the server wants their sign-in), and a plain
// <img> cannot send it, so for the owner's preview the picture is fetched with the sign-in and shown from memory.
import { useEffect, useState } from "react";
import { photoObjectUrl } from "../../api/photos";

interface Props {
  url: string;
  alt: string;
  /** The owner looking at an unpublished restaurant: fetch with their sign-in. */
  preview?: boolean;
  lazy?: boolean;
}

export function PhotoImg({ url, alt, preview = false, lazy = false }: Props) {
  const [src, setSrc] = useState<string | null>(preview ? null : url);
  useEffect(() => {
    if (!preview) {
      setSrc(url);
      return undefined;
    }
    const abort = new AbortController();
    let made: string | null = null;
    setSrc(null);
    photoObjectUrl(url, abort.signal).then(
      (object) => {
        made = object;
        setSrc(object);
      },
      () => setSrc(null),
    );
    return () => {
      abort.abort();
      if (made) URL.revokeObjectURL(made);
    };
  }, [url, preview]);
  if (!src) return <span className="rp-photo-wait" role="img" aria-label={alt || "Photo"} />;
  return <img src={src} alt={alt} loading={lazy ? "lazy" : undefined} />;
}
