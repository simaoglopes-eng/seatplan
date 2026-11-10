// A link the diner can copy. The clipboard API can be blocked (old browser,
// no permission, not https), so when it fails we select the text and ask
// the person to copy it themselves; the link is never out of reach.
import { useRef, useState } from "react";
import { Button } from "../../design/components";

/** "/b/abc" -> "https://seatplan.example/b/abc"; a full URL is kept as it is. */
export function absoluteUrl(path: string): string {
  return path.startsWith("/") ? `${window.location.origin}${path}` : path;
}

export function CopyLink({ url, label }: { url: string; label: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Link copied. Paste it somewhere safe, like your notes or calendar.");
    } catch {
      inputRef.current?.select();
      setMessage("Your browser blocked copying. The link is selected: press Ctrl+C (Cmd+C on a Mac) or long-press to copy it.");
    }
  };

  return (
    <div className="rb-copy">
      <label className="field-label" htmlFor="rb-copy-input">
        {label}
      </label>
      <div className="rb-copy-row">
        <input id="rb-copy-input" ref={inputRef} className="field-input rb-copy-input" readOnly value={url} onFocus={(e) => e.target.select()} />
        <Button variant="secondary" onClick={() => void copy()}>
          Copy link
        </Button>
      </div>
      <p className="rb-muted" role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
