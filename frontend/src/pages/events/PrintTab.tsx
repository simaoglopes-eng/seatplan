// Print tab: a seating chart for the door (table by table) and place cards
// for the tables. The print stylesheet in events.css hides everything except
// the part marked "ev-print-active", so the paper shows only what was chosen.
import { useEffect, useState } from "react";
import * as eventsApi from "../../api/events";
import type { SeatingChart } from "../../api/events";
import { ApiError } from "../../api/client";
import { Button, EmptyState, ErrorState, Skeleton } from "../../design/components";

type PrintPart = "chart" | "cards";

export function PrintTab({ eventId, eventName }: { eventId: string; eventName: string }) {
  const [chart, setChart] = useState<SeatingChart | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [part, setPart] = useState<PrintPart>("chart");

  const loadChart = (): void => {
    setProblem(null);
    eventsApi.getChart(eventId).then(setChart, (error: unknown) => setProblem(error instanceof ApiError ? error.message : "The chart could not be loaded."));
  };
  useEffect(loadChart, [eventId]);

  const print = (which: PrintPart): void => {
    setPart(which);
    // Wait one frame so the chosen part is marked before the print dialog takes its picture.
    window.requestAnimationFrame(() => window.print());
  };

  if (problem) return <ErrorState title="Nothing to print yet" message={problem} onRetry={loadChart} />;
  if (!chart) return <Skeleton lines={5} label="Preparing the seating chart" />;
  if (chart.place_cards.length === 0) return <EmptyState title="Nobody is seated yet">Seat a few guests first, then come back to print.</EmptyState>;

  return (
    <div className="ev-panel-stack">
      <div className="ev-actions">
        <Button onClick={() => print("chart")}>Print seating chart</Button>
        <Button variant="secondary" onClick={() => print("cards")}>
          Print place cards
        </Button>
      </div>
      {chart.unseated.length > 0 && <p className="ev-warning">Not seated yet, so not printed: {chart.unseated.join(", ")}.</p>}
      <section className={`ev-print ${part === "chart" ? "ev-print-active" : ""}`} aria-label="Seating chart preview">
        <h3 className="ev-print-title">{eventName}: seating chart</h3>
        <div className="ev-chart">
          {chart.tables.map((table) => (
            <div key={table.id} className="ev-chart-table">
              <h4>Table {table.label}</h4>
              <ol>
                {table.seats.map((seat) => (
                  <li key={seat.seat_id}>
                    <span className="tabular">{seat.label}</span> {seat.name ?? "(empty)"}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>
      <section className={`ev-print ${part === "cards" ? "ev-print-active" : ""}`} aria-label="Place cards preview">
        <h3 className="ev-print-title">Place cards</h3>
        <ul className="ev-cards">
          {chart.place_cards.map((card) => (
            <li key={`${card.table}-${card.seat}`} className="ev-place-card">
              <span className="ev-place-name">{card.name}</span>
              <span className="ev-place-seat">
                Table {card.table}, seat {card.seat}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
