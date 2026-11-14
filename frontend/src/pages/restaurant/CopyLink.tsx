// A link the diner can copy. The clipboard API can be blocked (old browser,
// no permission, not https), so when it fails we open the link, select it
// and ask the person to copy it themselves; the link is never out of reach.
// The long address stays folded away: the button is the action, the text is the fallback.
import { useRef, useState } from "react";
import { Button } from "../../design/components";

/** "/b/abc" -> "https://seatplan.example/b/abc"; a full URL is kept as it is. */
export function absoluteUrl(path: string): string {
  return path.startsWith("/") ? `${window.location.origin}${path}` : path;
}

export function CopyLink({ url, label }: { url: string; label: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [shown, setShown] = useState(false);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Link copied. Paste it somewhere safe, like your notes or calendar.");
    } catch {
      setShown(true);
      window.setTimeout(() => inputRef.current?.select(), 0);
      setMessage("Your browser blocked copying. The link is selected: press Ctrl+C (Cmd+C on a Mac) or long-press to copy it.");
    }
  };

  return (
    <div className="rb-copy">
      <Button variant="secondary" onClick={() => void copy()}>
        Copy private link
      </Button>
      <details className="rb-copy-details" open={shown} onToggle={(event) => setShown(event.currentTarget.open)}>
        <summary>Show the link</summary>
        <label className="field-label" htmlFor="rb-copy-input">
          {label}
        </label>
        <input id="rb-copy-input" ref={inputRef} className="field-input rb-copy-input" readOnly value={url} onFocus={(e) => e.target.select()} />
      </details>
      <p className="rb-muted" role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
