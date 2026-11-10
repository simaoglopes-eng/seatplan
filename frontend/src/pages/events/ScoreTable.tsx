// A score broken down into its terms, as a real table so screen readers can
// move by row and column. One or more columns: a single plan, a comparison
// of two plans, or before / after / change for a what-if move.
import type { ScoreBreakdown } from "../../api/events";
import { SCORE_TERMS, signed } from "./format";

export interface ScoreColumn {
  heading: string;
  score: ScoreBreakdown;
  /** Show numbers with a + or - sign (for differences). */
  signed?: boolean;
}

function show(value: number, withSign: boolean | undefined): string {
  return withSign ? signed(value) : String(Math.round(value * 10) / 10);
}

export function ScoreTable({ caption, columns }: { caption: string; columns: ScoreColumn[] }) {
  return (
    <table className="ev-table ev-score">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Part of the score</th>
          {columns.map((column) => (
            <th key={column.heading} scope="col" className="ev-num">
              {column.heading}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {SCORE_TERMS.map((term) => (
          <tr key={term.key}>
            <th scope="row">{term.label}</th>
            {columns.map((column) => (
              <td key={column.heading} className="ev-num tabular">
                {show(column.score[term.key], column.signed)}
              </td>
            ))}
          </tr>
        ))}
        <tr className="ev-score-total">
          <th scope="row">Total</th>
          {columns.map((column) => (
            <td key={column.heading} className="ev-num tabular">
              {show(column.score.total, column.signed)}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}
