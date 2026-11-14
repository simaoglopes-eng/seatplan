// Step 6 of the owner's setup: review and publish (spec 5.3). A checklist where
// every item says "Done" or "To do" in words (never colour alone) with a link to
// fix it. Publish only works when every required item is done, and the server
// checks everything again: this page is a convenience, not the source of truth.
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getPublishCheck, publishProblems, publishRestaurant, unpublishRestaurant } from "../../api/owner";
import type { PublishCheck, PublishProblem } from "../../api/owner";
import { Badge, Button, Dialog, ErrorState, Skeleton } from "../../design/components";
import { errorMessage } from "../restaurant/format";
import { useLoad } from "../restaurant/useLoad";
import { checklist } from "./publishChecklist";
import { OwnerShell } from "./OwnerShell";
import "./owner.css";

export default function PublishReview() {
  const { venueId = "" } = useParams();
  const { state, reload } = useLoad(() => getPublishCheck(venueId), venueId);
  return (
    <OwnerShell title="Review and publish" venueId={venueId} venueName={state.status === "ready" ? state.data.name : undefined} current="review" publicHref={state.status === "ready" && state.data.slug ? publicUrl(state.data.slug) ?? undefined : undefined}>
      {state.status === "loading" && <><h1 className="ow-title">Review and publish</h1><Skeleton label="Checking your restaurant" lines={5} /></>}
      {state.status === "error" && <><h1 className="ow-title">Review and publish</h1><ErrorState message="Could not check your restaurant. Check your sign-in or retry." onRetry={() => reload()} /></>}
      {state.status === "ready" && <Review venueId={venueId} initial={state.data} refresh={() => reload(true)} />}
    </OwnerShell>
  );
}

function Review({ venueId, initial, refresh }: { venueId: string; initial: PublishCheck; refresh: () => void }) {
  const [check, setCheck] = useState(initial);
  const [url, setUrl] = useState<string | null>(initial.status === "published" ? publicUrl(initial.slug) : null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<PublishProblem[]>([]);
  const [problem, setProblem] = useState("");
  const [confirming, setConfirming] = useState(false);
  const published = check.status === "published";
  const rows = checklist(check.problems, check.tips);
  const blocking = rows.filter((row) => !row.done && row.required);
  const pending = rows.filter((row) => !row.done);
  const done = rows.filter((row) => row.done);
  // One word for where the restaurant stands: what the owner should do next follows from it.
  const stage = published ? "Published" : check.ready ? "Ready to publish" : `Draft · ${blocking.length} ${blocking.length === 1 ? "blocker" : "blockers"}`;
  const preview = url ?? publicUrl(check.slug);

  const publish = async (): Promise<void> => {
    setBusy(true);
    setRefused([]);
    setProblem("");
    try {
      const answer = await publishRestaurant(venueId);
      setCheck({ ...check, status: "published" });
      setUrl(answer.url);
    } catch (error) {
      const found = publishProblems(error);
      if (found.length > 0) {
        setRefused(found);
        refresh();
      } else setProblem(errorMessage(error, "We could not publish. Please try again."));
    } finally {
      setBusy(false);
    }
  };
  const unpublish = async (): Promise<void> => {
    setBusy(true);
    setProblem("");
    try {
      await unpublishRestaurant(venueId);
      setCheck({ ...check, status: "draft" });
      setUrl(null);
      setConfirming(false);
    } catch (error) {
      setProblem(errorMessage(error, "We could not unpublish. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ow-review">
      <div className="ow-page-head">
        <div>
          <h1 className="ow-title">Review and publish</h1>
          <p className="rb-muted">See which checks are required for {check.name} to go live.</p>
        </div>
        <p role="status" className="owner-stage"><Badge tone={published ? "success" : check.ready ? "info" : "warning"}>{stage}</Badge></p>
      </div>
      <div className="ow-two">
        <div className="rb-card ow-checks">
          {pending.length > 0 && (
            <>
              <h2 className="ow-card-title">{blocking.length > 0 ? `${blocking.length} ${blocking.length === 1 ? "thing" : "things"} to fix` : "Recommended"}</h2>
              <ol className="owner-checklist" aria-label="Before you publish">
                {pending.map((row) => <CheckRow key={row.label} row={row} />)}
              </ol>
            </>
          )}
          {/* What is already right stays visible, but below what still needs doing. */}
          {done.length > 0 && (
            <section className="owner-done" aria-label="Completed checks">
              <h2 className="ow-card-title ow-card-title-small">Completed checks <Badge tone="success">{done.length} complete</Badge></h2>
              <ol className="owner-checklist" aria-label={done.length === rows.length ? "Before you publish" : "Checks already done"}>
                {done.map((row) => <CheckRow key={row.label} row={row} />)}
              </ol>
            </section>
          )}
        </div>
        <aside className="rb-card ow-listing" aria-label="Public listing">
          <h2 className="ow-card-title">Public listing</h2>
          <p className="rb-muted">
            {published
              ? `${check.name} is live and open for bookings.`
              : check.ready
                ? "Everything required is done. Preview the restaurant, then publish it."
                : `Preview the restaurant and fix the ${blocking.length === 1 ? "blocker" : `${blocking.length} blockers`} to enable publishing.`}
          </p>
          {preview && <Link className="btn btn-secondary" to={preview}>{published ? "View public page" : "Preview listing"} <span aria-hidden="true">↗</span></Link>}
          {!published && (
            <Button busy={busy} disabled={!check.ready} onClick={() => void publish()}>
              Publish restaurant
            </Button>
          )}
          {published && (
            <Button variant="ghost" busy={busy} onClick={() => setConfirming(true)}>
              Unpublish
            </Button>
          )}
          {refused.length > 0 && (
            <div role="alert" className="room-error">
              <p>The server found problems, so nothing was published:</p>
              <ul>
                {refused.map((p) => (
                  <li key={`${p.code}-${p.message}`}>{p.message}</li>
                ))}
              </ul>
            </div>
          )}
          {problem && (
            <p role="alert" className="room-error">
              {problem}
            </p>
          )}
          {!check.ready && !published && <p className="rb-muted">Publish switches on when every item marked To do is done.</p>}
          {published && <p className="rb-muted">Unpublishing hides {check.name} from search and stops new bookings. Bookings already made stay.</p>}
        </aside>
      </div>
      <Dialog
        open={confirming}
        title="Remove from search?"
        onClose={() => setConfirming(false)}
        actions={<>
          <Button variant="secondary" onClick={() => setConfirming(false)}>Keep it published</Button>
          <Button variant="danger" busy={busy} onClick={() => void unpublish()}>Unpublish</Button>
        </>}
      >
        <p>{check.name} will disappear from search and stop taking new bookings. Bookings already made stay, and you can publish again at any time.</p>
      </Dialog>
    </section>
  );
}

function CheckRow({ row }: { row: ReturnType<typeof checklist>[number] }) {
  return (
    <li className={row.done ? "owner-check-done" : "owner-check-todo"}>
      <span aria-hidden="true" className="owner-check-mark">
        {row.done ? "✓" : "!"}
      </span>
      <div>
        <strong>{row.label}</strong> <span className="owner-check-word">{row.done ? "Done" : row.required ? "To do" : "Recommended"}</span>
        {row.messages.map((message) => (
          <p key={message} className="rb-muted">
            {message}
          </p>
        ))}
      </div>
      {!row.done && row.fix && <Link className="btn btn-secondary ow-fix" to={row.fix}>{row.fixLabel} <span aria-hidden="true">→</span></Link>}
    </li>
  );
}

function publicUrl(slug: string | null): string | null {
  return slug ? `/restaurants/${encodeURIComponent(slug)}` : null;
}
