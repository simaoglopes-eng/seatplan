import { useEffect, useState } from "react";
import { photoObjectUrl } from "../../api/photos";

export function PhotoPreview({ url, alt, className }: { url: string; alt: string; className?: string }) {
  const [source, setSource] = useState(""), [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let objectUrl = "";
    setSource(""); setFailed(false);
    void photoObjectUrl(url, controller.signal).then(next => { objectUrl = next; if (controller.signal.aborted) URL.revokeObjectURL(next); else setSource(next); }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url]);
  return source ? <img className={className} src={source} alt={alt} /> : <div className={className} role="status">{failed ? "Photo unavailable" : "Loading photo…"}</div>;
}
