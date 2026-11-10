// The card shown while a scenario is previewed on the map. Nothing has
// changed yet; the organiser decides with Apply or Discard.
import type { RefObject } from "react";
import type { OrganiserEvent, Scenario } from "../../api/events";
import { Button } from "../../design/components";
import { placedCount } from "./planPreview";
import { ScoreTable } from "./ScoreTable";

interface ScenarioPreviewProps {
  scenario: Scenario;
  data: OrganiserEvent;
  busy: boolean;
  /** The parent focuses this heading when the preview appears (the pressed button is gone by then). */
  headingRef: RefObject<HTMLHeadingElement>;
  onApply: () => void;
  onDiscard: () => void;
}

function names(ids: number[], data: OrganiserEvent): string {
  const byId = new Map(data.guests.map((g) => [g.id, g.name]));
  return ids.map((id) => byId.get(id) ?? "Guest").join(", ");
}

export function ScenarioPreview({ scenario, data, busy, headingRef, onApply, onDiscard }: ScenarioPreviewProps) {
  return (
    <section className="ev-preview" aria-labelledby="ev-preview-title">
      <h3 id="ev-preview-title" className="ev-subtitle" ref={headingRef} tabIndex={-1}>
        Preview: {scenario.label}
      </h3>
      <p>
        Not applied yet. <strong>{scenario.seated}</strong> guests would have a seat (
        <strong>{placedCount(scenario, data.guests)}</strong> newly placed), <strong>{scenario.moved.length}</strong> moved.
      </p>
      {scenario.moved.length > 0 && <p className="ev-muted">Would move: {names(scenario.moved, data)}.</p>}
      {scenario.unseated.length > 0 && (
        <p className="ev-warning">
          Still without a seat: {names(scenario.unseated, data)}. There may be no seat that fits their needs.
        </p>
      )}
      <ScoreTable caption="Score of this plan" columns={[{ heading: "Points", score: scenario.score }]} />
      <div className="ev-actions">
        <Button busy={busy} onClick={onApply}>
          Apply this plan
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </section>
  );
}
