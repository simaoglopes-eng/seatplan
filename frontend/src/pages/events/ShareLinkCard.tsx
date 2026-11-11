// Settings tab: the event's shared link (docs/guest-accounts.md section 6.3).
// The organiser switches it on, copies it, sets an optional limit, and can
// replace it ("Make a new link"), which stops the old one at once.
//
// The link is never stored in the database: the server works it out again
// from its secret each time, so it can be shown again at any time.
import { useCallback, useEffect, useRef, useState } from "react";
import * as eventsApi from "../../api/events";
import type { OrganiserEvent, ShareSettings } from "../../api/events";
import { Button, Checkbox, Dialog, ErrorState, Field, Skeleton } from "../../design/components";
import { asApiError } from "./useAttendeeData";
import { copyText, fullLink } from "./browserHelpers";
import type { OrganiserState } from "./useOrganiser";

/** The same limits as the server (PATCH /events/{eid}/share). */
const CAP_MIN = 1;
const CAP_MAX = 5000;

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; share: ShareSettings };

/** The limit field's text as a number, null for "no limit", or an error message. */
export function parseCap(text: string): { cap: number | null } | { error: string } {
  const trimmed = text.trim();
  if (trimmed === "") return { cap: null };
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < CAP_MIN || value > CAP_MAX) {
    return { error: `Enter a whole number from ${CAP_MIN} to ${CAP_MAX}, or leave it empty.` };
  }
  return { cap: value };
}

export function ShareLinkCard({ org, data }: { org: OrganiserState; data: OrganiserEvent }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });

  const fetchShare = useCallback(async (): Promise<void> => {
    try {
      setLoad({ status: "ready", share: await eventsApi.getShare(org.eventId) });
    } catch (error) {
      setLoad({ status: "error", message: asApiError(error).message });
    }
  }, [org.eventId]);

  // `data` is new after every reload of the event (live updates included), so the counts stay fresh.
  useEffect(() => {
    void fetchShare();
  }, [fetchShare, data]);

  return (
    <section className="ev-card-flat" aria-labelledby="ev-share">
      <h3 id="ev-share" className="ev-subtitle">
        Shared link
      </h3>
      {load.status === "loading" && <Skeleton lines={2} label="Loading the shared link" />}
      {load.status === "error" && <ErrorState title="We could not load the shared link" message={load.message} onRetry={() => void fetchShare()} />}
      {load.status === "ready" && <ShareControls org={org} share={load.share} onSaved={(share) => setLoad({ status: "ready", share })} />}
    </section>
  );
}

interface ControlsProps {
  org: OrganiserState;
  share: ShareSettings;
  onSaved: (share: ShareSettings) => void;
}

function ShareControls({ org, share, onSaved }: ControlsProps) {
  const [asking, setAsking] = useState(false);

  /** One write through org.run (busy flag, announcement, toast), keeping the answer. */
  const save = (name: string, done: string, call: () => Promise<ShareSettings>): Promise<boolean> =>
    org.run(name, done, async () => onSaved(await call()));

  const toggle = (enabled: boolean): void => {
    const done = enabled ? "The shared link is on. Copy it and send it to your guests." : "The shared link is off. Nobody new can join with it.";
    void save("share", done, () => eventsApi.patchShare(org.eventId, { enabled }));
  };

  const regenerate = (): void => {
    void save("share-new", "New link made. The old link no longer works.", () => eventsApi.regenerateShare(org.eventId)).then(() => setAsking(false));
  };

  return (
    <>
      <Checkbox
        label="Allow people to join with the shared link"
        hint="Anyone with the link sees the seat map, with names shown as set above. To choose a seat they create an account with a checked email address. Your invited guests keep their personal links."
        checked={share.enabled}
        disabled={org.busy === "share"}
        onChange={(e) => toggle(e.target.checked)}
      />
      {share.enabled ? (
        <LinkBox share={share} onNewLink={() => setAsking(true)} />
      ) : (
        <p className="ev-muted">The link is off. Nobody new can join with it. People who already joined keep their seats and can still sign in.</p>
      )}
      <CapForm org={org} share={share} save={save} />
      {/* Not a live region: the numbers change with every live update and would interrupt. */}
      <p>{shareCounts(share)}</p>
      <Dialog
        open={asking}
        title="Make a new link?"
        onClose={() => setAsking(false)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <Button busy={org.busy === "share-new"} onClick={regenerate}>
              Make a new link
            </Button>
          </>
        }
      >
        <p>The current link stops working at once. People who already joined keep their places.</p>
      </Dialog>
    </>
  );
}

/** The link itself, Copy, and Make a new link. */
function LinkBox({ share, onNewLink }: { share: ShareSettings; onNewLink: () => void }) {
  const [status, setStatus] = useState("");
  const box = useRef<HTMLDivElement>(null);

  if (share.needs_new_link || share.link === null) {
    return (
      <div className="ev-share-box">
        <p className="ev-warning">The link had to be reset for security. Make a new link to share.</p>
        <Button variant="secondary" onClick={onNewLink}>
          Make a new link
        </Button>
      </div>
    );
  }
  const url = fullLink(share.link);

  const copy = async (): Promise<void> => {
    if (await copyText(url)) {
      setStatus("Link copied");
      return;
    }
    // The clipboard is blocked (old browser, plain http): select the text so the keyboard can copy it.
    const input = box.current?.querySelector("input");
    input?.focus();
    input?.select();
    setStatus("Press Ctrl+C or Cmd+C to copy.");
  };

  return (
    <div ref={box} className="ev-share-box">
      <Field label="Link to share" readOnly value={url} onFocus={(e) => e.target.select()} />
      <div className="ev-actions">
        <Button variant="secondary" onClick={() => void copy()}>
          Copy link
        </Button>
        <Button variant="ghost" onClick={onNewLink}>
          Make a new link
        </Button>
      </div>
      <p className="ev-muted" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}

interface CapFormProps {
  org: OrganiserState;
  share: ShareSettings;
  save: (name: string, done: string, call: () => Promise<ShareSettings>) => Promise<boolean>;
}

/** The optional limit on how many people may join with the link. */
function CapForm({ org, share, save }: CapFormProps) {
  const [text, setText] = useState(share.cap === null ? "" : String(share.cap));
  const [error, setError] = useState<string | null>(null);

  const submit = (): void => {
    const parsed = parseCap(text);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    setError(null);
    const done = parsed.cap === null ? "Limit removed." : `Limit saved: at most ${parsed.cap} people can join with the link.`;
    void save("share-cap", done, () => eventsApi.patchShare(org.eventId, { cap: parsed.cap }));
  };

  return (
    <div className="ev-share-box">
      <Field
        label="Most people who may join with this link"
        hint="Leave empty to allow up to the number of free seats."
        type="number"
        inputMode="numeric"
        min={CAP_MIN}
        max={CAP_MAX}
        step={1}
        value={text}
        error={error}
        onChange={(e) => setText(e.target.value)}
      />
      <div>
        <Button variant="secondary" busy={org.busy === "share-cap"} onClick={submit}>
          Save limit
        </Button>
      </div>
    </div>
  );
}

/** "2 joined with the link. 1 place left (7 guests for 8 seats)." */
export function shareCounts(share: ShareSettings): string {
  const left = share.places_left === 1 ? "1 place left" : `${share.places_left} places left`;
  return `${share.joined} joined with the link. ${left} (${share.guests} guests for ${share.capacity} seats).`;
}
