// Compare two saved scenarios side by side: each term for plan A, plan B,
// and the difference with a sign, so "better" never depends on colour.
import { useEffect, useState } from "react";
import * as eventsApi from "../../api/events";
import type { Scenario, ScenarioComparison } from "../../api/events";
import { Button, Select } from "../../design/components";
import { ScoreTable } from "./ScoreTable";

interface ScenarioCompareProps {
  eventId: string;
  /** Changes whenever a new scenario is made, so the list is fetched again. */
  refreshKey: number;
}

export function ScenarioCompare({ eventId, refreshKey }: ScenarioCompareProps) {
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [result, setResult] = useState<ScenarioComparison | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    eventsApi.listScenarios(eventId).then(
      (list) => {
        setScenarios(list);
        // Start with the two newest plans: usually the ones being weighed up.
        setA(list.length >= 2 ? String(list[list.length - 2].id) : "");
        setB(list.length >= 1 ? String(list[list.length - 1].id) : "");
      },
      () => setProblem("Saved scenarios could not be loaded."),
    );
  }, [eventId, refreshKey]);

  const compare = async (): Promise<void> => {
    setProblem(null);
    try {
      setResult(await eventsApi.compareScenarios(eventId, Number(a), Number(b)));
    } catch {
      setProblem("The comparison did not work. Please try again.");
    }
  };

  if (problem && !scenarios) return <p className="ev-muted">{problem}</p>;
  if (!scenarios || scenarios.length < 2) {
    return <p className="ev-muted">Make at least two previews (for example auto-fill and re-plan) to compare them here.</p>;
  }
  const options = scenarios.map((s) => ({ value: String(s.id), label: s.label }));
  return (
    <div className="ev-form">
      <div className="ev-filters">
        <Select label="Plan A" options={options} value={a} onChange={(e) => setA(e.target.value)} />
        <Select label="Plan B" options={options} value={b} onChange={(e) => setB(e.target.value)} />
      </div>
      <Button variant="secondary" disabled={a === b} onClick={() => void compare()}>
        {a === b ? "Choose two different plans" : "Compare"}
      </Button>
      {problem && <p className="ev-warning">{problem}</p>}
      {result && (
        <p>
          {result.guests_seated_differently} {result.guests_seated_differently === 1 ? "guest sits" : "guests sit"} differently in the two plans.
        </p>
      )}
      {result && (
        <ScoreTable
          caption={`${result.a.label} compared with ${result.b.label}`}
          columns={[
            { heading: "A", score: result.a.score },
            { heading: "B", score: result.b.score },
            { heading: "B minus A", score: result.delta, signed: true },
          ]}
        />
      )}
    </div>
  );
}
