// Optimise tab: let the optimiser suggest a plan, look at it on the map,
// then apply or discard it. Also undo and redo, comparison of plans,
// what-if moves and the exact check.
//
// Keyboard focus: previewing, applying and discarding each remove the button
// that was pressed. Focus then goes to the heading of what replaced it, so a
// keyboard or screen-reader user is not sent back to the top of the page.
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import * as eventsApi from "../../api/events";
import type { OrganiserEvent, OrganiserGuest, Scenario } from "../../api/events";
import { ApiError } from "../../api/client";
import { Button } from "../../design/components";
import { ExactCheckCard } from "./ExactCheckCard";
import { ScenarioCompare } from "./ScenarioCompare";
import { ScenarioPreview } from "./ScenarioPreview";
import type { OrganiserState } from "./useOrganiser";
import { WhatIfCard } from "./WhatIfCard";

type FocusSpot = "preview" | "history" | "suggest";
type HeadingRef = RefObject<HTMLHeadingElement>;

/** Who sits where, as one string: it changes whenever any seat changes. */
function planKey(guests: OrganiserGuest[]): string {
  return guests.map((g) => `${g.id}:${g.seat_id ?? "-"}`).join(",");
}

/** Focus a heading after the next render, when the new content exists. */
function useFocusAfterRender() {
  const refs: Record<FocusSpot, HeadingRef> = { preview: useRef(null), history: useRef(null), suggest: useRef(null) };
  const [spot, setSpot] = useState<FocusSpot | null>(null);
  useEffect(() => {
    if (spot === null) return;
    refs[spot].current?.focus();
    setSpot(null);
    // The refs never change identity, so the spot is the only thing to watch.
  }, [spot]);
  return { refs, focusNext: setSpot };
}

export function OptimiseTab({ org, data }: { org: OrganiserState; data: OrganiserEvent }) {
  // Bumped after each new preview, so the comparison list fetches the new one.
  const [made, setMade] = useState(0);
  const { refs, focusNext } = useFocusAfterRender();
  const waiting = data.guests.filter((g) => g.seat_id === null && g.rsvp !== "no").length;

  const makePreview = async (name: string, ask: () => Promise<Scenario>): Promise<void> => {
    try {
      org.setPreview(await ask());
      setMade((n) => n + 1);
      focusNext("preview");
      org.announce(`${name} preview is on the map. Nothing has changed yet: apply or discard it.`);
    } catch (error) {
      org.announce(`Problem: ${error instanceof ApiError ? error.message : "the optimiser did not answer."}`);
    }
  };

  const apply = async (scenario: Scenario): Promise<void> => {
    let kept = 0;
    const ok = await org.run("apply", `${scenario.label} applied. You can undo it.`, async () => {
      const result = await eventsApi.applyScenario(org.eventId, scenario.id);
      kept = result.conflicts.length;
    });
    if (!ok) return;
    org.setPreview(null);
    focusNext("history");
    // Guests may have picked a seat while the organiser was looking: their choice wins.
    if (kept > 0) org.announce(`${scenario.label} applied. ${kept} ${kept === 1 ? "guest" : "guests"} chose a seat in the meantime and kept it.`);
  };

  const discard = (): void => {
    org.setPreview(null);
    focusNext("suggest");
    org.announce("Preview discarded. The plan is unchanged.");
  };

  return (
    <div className="ev-panel-stack">
      {org.preview ? (
        <ScenarioPreview scenario={org.preview} data={data} busy={org.busy === "apply"} headingRef={refs.preview} onApply={() => void apply(org.preview as Scenario)} onDiscard={discard} />
      ) : (
        <SuggestCards
          waiting={waiting}
          headingRef={refs.suggest}
          onAutofill={() => makePreview("Auto-fill", () => eventsApi.autofill(org.eventId))}
          onReplan={() => makePreview("Re-plan", () => eventsApi.replan(org.eventId))}
        />
      )}
      <UndoRedo org={org} headingRef={refs.history} />
      <section className="ev-card-flat" aria-labelledby="ev-compare">
        <h3 id="ev-compare" className="ev-subtitle">
          Compare plans
        </h3>
        <ScenarioCompare eventId={org.eventId} refreshKey={made} />
      </section>
      <WhatIfCard org={org} data={data} />
      <ExactCheckCard eventId={org.eventId} planKey={planKey(data.guests)} />
    </div>
  );
}

interface SuggestCardsProps {
  waiting: number;
  headingRef: HeadingRef;
  onAutofill: () => Promise<void>;
  onReplan: () => Promise<void>;
}

function SuggestCards({ waiting, headingRef, onAutofill, onReplan }: SuggestCardsProps) {
  const [busy, setBusy] = useState<"fill" | "replan" | null>(null);
  const runWith = async (name: "fill" | "replan", action: () => Promise<void>): Promise<void> => {
    setBusy(name);
    await action();
    setBusy(null);
  };
  return (
    <>
      <section className="ev-card-flat" aria-labelledby="ev-fill">
        <h3 id="ev-fill" className="ev-subtitle" ref={headingRef} tabIndex={-1}>
          Auto-fill remaining guests
        </h3>
        {/* With nobody waiting the button already says so; "Seats the 0 guests" would only confuse. */}
        {waiting > 0 && (
          <p className="ev-muted">
            Seats the {waiting} {waiting === 1 ? "guest" : "guests"} without a seat near people they know. Nobody who already has a seat is moved.
          </p>
        )}
        <Button busy={busy === "fill"} disabled={waiting === 0} onClick={() => void runWith("fill", onAutofill)}>
          {waiting === 0 ? "Everyone has a seat" : "Preview auto-fill"}
        </Button>
      </section>
      <section className="ev-card-flat" aria-labelledby="ev-replan">
        <h3 id="ev-replan" className="ev-subtitle">
          Re-plan with minimal change
        </h3>
        <p className="ev-muted">Improves the whole plan while moving as few people as possible. Seats that guests chose themselves never move.</p>
        <Button variant="secondary" busy={busy === "replan"} onClick={() => void runWith("replan", onReplan)}>
          Preview re-plan
        </Button>
      </section>
    </>
  );
}

/** The server keeps the history; when there is nothing to undo it answers with a friendly 409. */
function UndoRedo({ org, headingRef }: { org: OrganiserState; headingRef: HeadingRef }) {
  return (
    <section className="ev-card-flat" aria-labelledby="ev-history">
      <h3 id="ev-history" className="ev-subtitle" ref={headingRef} tabIndex={-1}>
        Undo and redo
      </h3>
      <div className="ev-actions">
        <Button variant="secondary" busy={org.busy === "undo"} onClick={() => void org.run("undo", "Last change undone.", () => eventsApi.undo(org.eventId).then(() => undefined))}>
          Undo
        </Button>
        <Button variant="secondary" busy={org.busy === "redo"} onClick={() => void org.run("redo", "Change redone.", () => eventsApi.redo(org.eventId).then(() => undefined))}>
          Redo
        </Button>
      </div>
    </section>
  );
}
