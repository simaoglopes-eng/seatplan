// Step 6 of the owner's setup: review and publish (spec 5.3). A checklist where
// every item says "Done" or "To do" in words (never colour alone) with a link to
// fix it. Publish only works when every required item is done, and the server
// checks everything again: this page is a convenience, not the source of truth.
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getPublishCheck, publishProblems, publishRestaurant, unpublishRestaurant } from "../../api/owner";
import type { PublishCheck, PublishProblem } from "../../api/owner";
import { Badge, Button, ErrorState, PageShell, Skeleton } from "../../design/components";
import { errorMessage } from "../restaurant/format";
import { useLoad } from "../restaurant/useLoad";
import { checklist } from "./publishChecklist";
import "./owner.css";

export default function PublishReview() {
  const { venueId = "" } = useParams();
  const { state, reload } = useLoad(() => getPublishCheck(venueId), venueId);
  return (
    <PageShell title="Review and publish">
      <Link to="/owner">← My restaurants</Link>
      <h1>Review and publish</h1>
      {state.status === "loading" && <Skeleton label="Checking your restaurant" lines={5} />}
      {state.status === "error" && <ErrorState message="Could not check your restaurant. Check your sign-in or retry." onRetry={() => reload()} />}
      {state.status === "ready" && <Review venueId={venueId} initial={state.data} refresh={() => reload(true)} />}
    </PageShell>
  );
}

function Review({ venueId, initial, refresh }: { venueId: string; initial: PublishCheck; refresh: () => void }) {
  const [check, setCheck] = useState(initial);
  const [url, setUrl] = useState<string | null>(initial.status === "published" ? publicUrl(initial.slug) : null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<PublishProblem[]>([]);
  const [problem, setProblem] = useState("");
  const published = check.status === "published";
  const rows = checklist(check.problems, check.tips);

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
    } catch (error) {
      setProblem(errorMessage(error, "We could not unpublish. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <p role="status">
        <Badge tone={published ? "success" : "neutral"}>{published ? "Published" : "Draft"}</Badge> {check.name} {published ? "is published." : "is a draft."}
      </p>
      <ol className="owner-checklist" aria-label="Before you publish">
        {rows.map((row) => (
          <li key={row.label} className={row.done ? "owner-check-done" : "owner-check-todo"}>
            <span aria-hidden="true" className="owner-check-mark">
              {row.done ? "✓" : row.required ? "✗" : "!"}
            </span>
            <div>
              <strong>{row.label}</strong> <span className="owner-check-word">{row.done ? "Done" : row.required ? "To do" : "Recommended"}</span>
              {row.messages.map((message) => (
                <p key={message} className="rb-muted">
                  {message}
                </p>
              ))}
              {!row.done && row.fix && <Link to={row.fix}>{row.fixLabel}</Link>}
            </div>
          </li>
        ))}
      </ol>
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
      <div className="room-actions">
        {!published && (
          <Button busy={busy} disabled={!check.ready} onClick={() => void publish()}>
            Publish
          </Button>
        )}
        {published && (
          <Button variant="secondary" busy={busy} onClick={() => void unpublish()}>
            Unpublish
          </Button>
        )}
        {published && url && <Link to={url}>View public page</Link>}
      </div>
      {!check.ready && !published && <p className="rb-muted">Publish switches on when every item marked To do is done.</p>}
      {published && <p className="rb-muted">Unpublishing hides {check.name} from search and stops new bookings. Bookings already made stay.</p>}
    </section>
  );
}

function publicUrl(slug: string | null): string | null {
  return slug ? `/restaurants/${encodeURIComponent(slug)}` : null;
}
