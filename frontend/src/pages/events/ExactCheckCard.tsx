// "How good is our plan, really?" Runs the exact solver and explains the
// answer in plain words: how many guests each plan seats, our score, the best
// possible score, the gap, and how long each took.
//
// A result belongs to the plan it was computed on. When the plan changes
// (apply, undo, redo, a move, or someone else's change) the old figures are
// hidden and the card says the check must be run again.
import { useState } from "react";
import * as eventsApi from "../../api/events";
import type { ExactCheck } from "../../api/events";
import { ApiError } from "../../api/client";
import { Button } from "../../design/components";

interface ExactCheckCardProps {
  eventId: string;
  /** Changes whenever anyone's seat changes; see planKey() in OptimiseTab. */
  planKey: string;
}

interface CheckedPlan {
  check: ExactCheck;
  planKey: string;
}

function duration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** The one sentence screen readers hear when the check finishes. */
function summary(check: ExactCheck): string {
  if (check.gap_percent === null) return check.note;
  const gap = Math.round(check.gap_percent * 10) / 10;
  return gap === 0 ? "0%: our plan is already the best possible." : `${gap}%: our plan is within ${gap}% of the best.`;
}

export function ExactCheckCard({ eventId, planKey }: ExactCheckCardProps) {
  const [result, setResult] = useState<CheckedPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const stale = result !== null && result.planKey !== planKey;

  const onRun = async (): Promise<void> => {
    setBusy(true);
    setProblem(null);
    // Remember which plan was checked, so a later change can be noticed.
    const checkedKey = planKey;
    try {
      setResult({ check: await eventsApi.exactCheck(eventId), planKey: checkedKey });
    } catch (error) {
      setProblem(error instanceof ApiError ? error.message : "The exact check did not work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ev-card-flat" aria-labelledby="ev-exact">
      <h3 id="ev-exact" className="ev-subtitle">
        Exact check
      </h3>
      <p className="ev-muted">Compares the current plan with the best plan that exists. It can take a few seconds on big events.</p>
      <Button variant="secondary" busy={busy} onClick={() => void onRun()}>
        Run exact check
      </Button>
      {/* The verdict is the only live line: the details below are read at the person's own pace. */}
      <p aria-live="polite" className={problem || stale ? "ev-warning" : undefined}>
        {problem ?? (stale ? "The plan has changed since this check. Run it again to check the new plan." : result && <strong>{summary(result.check)}</strong>)}
      </p>
      {result && !stale && <ExactAnswer check={result.check} />}
    </section>
  );
}

function ExactAnswer({ check }: { check: ExactCheck }) {
  const tables = check.table_ids.length === 1 ? "one table" : `${check.table_ids.length} tables`;
  return (
    <dl className="ev-facts">
      <dt>Guests seated</dt>
      <dd className="tabular">
        Our plan {check.heuristic_seated}, best possible {check.exact_seated}
      </dd>
      <dt>Our plan, on these tables</dt>
      <dd className="tabular">{check.heuristic_score} points</dd>
      <dt>{check.proven_optimal ? "Best possible (proven)" : "Best found by the exact solver"}</dt>
      <dd className="tabular">{check.optimal_score} points</dd>
      <dt>Checked</dt>
      <dd>
        {check.seats} seats and {check.guests} guests on {tables}. The exact solver only fits a small part of the room, so it checks the busiest
        table.
      </dd>
      {check.gap_percent !== null && (
        <>
          <dt>How they were compared</dt>
          <dd>{check.note}</dd>
        </>
      )}
      <dt>Time taken</dt>
      <dd>
        Our plan {duration(check.heuristic_ms)}, exact check {duration(check.exact_ms)} ({check.engine}).
      </dd>
      {!check.proven_optimal && (
        <dd className="ev-warning">The exact solver hit its time limit before proving this is the best, so the real best may be higher.</dd>
      )}
    </dl>
  );
}
