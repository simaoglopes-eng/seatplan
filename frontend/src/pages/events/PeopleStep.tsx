// Step 2 (optional): "People I know". A searchable list of the other guests,
// with names already shortened by the organiser's privacy setting.
// The choice only feeds the recommendations; nobody else sees it.
import { useMemo, useState } from "react";
import type { VisiblePerson } from "../../api/events";
import { Button, Checkbox, Field } from "../../design/components";
import { StepTitle } from "./StepTitle";

interface PeopleStepProps {
  people: VisiblePerson[];
  busy: boolean;
  moved: boolean;
  onSave: (ids: number[]) => void;
  onSkip: () => void;
}

// Anonymous guests all appear as "Guest"; a list of identical "Guest" rows helps nobody.
const ANONYMOUS_LABEL = "Guest";

function matches(person: VisiblePerson, query: string): boolean {
  return person.name.toLowerCase().includes(query.trim().toLowerCase());
}

export function PeopleStep({ people, busy, moved, onSave, onSkip }: PeopleStepProps) {
  const [query, setQuery] = useState("");
  // Start from the people already marked as known, so coming back never loses them.
  const [chosen, setChosen] = useState<Set<number>>(() => new Set(people.filter((p) => p.known).map((p) => p.id)));
  const named = useMemo(() => people.filter((p) => p.name !== ANONYMOUS_LABEL), [people]);
  const hiddenCount = people.length - named.length;
  const shown = named.filter((p) => matches(p, query));

  const toggle = (id: number): void => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChosen(next);
  };

  return (
    <section className="ev-card" aria-labelledby="ev-people">
      <StepTitle id="ev-people" focusOnMount={moved}>
        Who do you know here?
      </StepTitle>
      <p>Pick the people you know and we will suggest seats near them. This step is optional, and nobody else sees your list.</p>
      <Field label="Search by name" type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
      <PeopleList shown={shown} chosen={chosen} query={query} onToggle={toggle} />
      {hiddenCount > 0 && (
        <p className="ev-muted">
          {hiddenCount} {hiddenCount === 1 ? "guest has" : "guests have"} chosen to stay anonymous, so they are not listed.
        </p>
      )}
      <p className="ev-muted" aria-live="polite">
        {chosen.size} selected
      </p>
      <div className="ev-actions">
        <Button busy={busy} onClick={() => onSave(Array.from(chosen))} disabled={chosen.size === 0}>
          {chosen.size === 0 ? "Select people to continue" : `Continue with ${chosen.size} ${chosen.size === 1 ? "person" : "people"}`}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onSkip}>
          Skip this step
        </Button>
      </div>
    </section>
  );
}

interface PeopleListProps {
  shown: VisiblePerson[];
  chosen: Set<number>;
  query: string;
  onToggle: (id: number) => void;
}

function PeopleList({ shown, chosen, query, onToggle }: PeopleListProps) {
  if (shown.length === 0 && query.trim() === "") {
    return <p className="ev-empty-line">No names to show yet. You can skip this step and pick any seat.</p>;
  }
  if (shown.length === 0) {
    return (
      <p className="ev-empty-line">
        Nobody matches "{query}". Names may be shortened for privacy, so try a first name.
      </p>
    );
  }
  return (
    <fieldset className="ev-people">
      <legend className="visually-hidden">People you know</legend>
      {shown.map((person) => (
        <Checkbox key={person.id} label={person.name} checked={chosen.has(person.id)} onChange={() => onToggle(person.id)} />
      ))}
    </fieldset>
  );
}
