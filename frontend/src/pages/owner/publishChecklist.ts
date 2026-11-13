// The review step's checklist (spec 5.3 step 6): the server's problems and tips
// laid out as the seven rows the owner reads. Pure, so the rows are tested on
// their own. The server decides what is wrong; this only groups and words it.
import type { PublishProblem } from "../../api/owner";

export interface ChecklistRow {
  label: string;
  done: boolean;
  /** False only for the photo, which is recommended but never blocks publishing. */
  required: boolean;
  /** What the server said about this row. */
  messages: string[];
  /** Where to fix it, and the words of the link. */
  fix: string | null;
  fixLabel: string;
}

interface RowSpec {
  label: string;
  codes: string[] | "rest";
  required: boolean;
  fixLabel: string;
}

const NAMED = ["identity", "location", "hours", "no_tables", "no_north", "photos"];

const ROWS: RowSpec[] = [
  { label: "Name, cuisines and price", codes: ["identity"], required: true, fixLabel: "Fix profile" },
  { label: "Address and pin on the map", codes: ["location"], required: true, fixLabel: "Fix location" },
  { label: "At least one photo (recommended)", codes: ["photos"], required: false, fixLabel: "Add photos" },
  { label: "Opening hours with at least one service", codes: ["hours"], required: true, fixLabel: "Fix opening hours" },
  { label: "A room with at least one table", codes: ["no_tables"], required: true, fixLabel: "Add tables" },
  { label: "No problems in the room plan", codes: "rest", required: true, fixLabel: "Fix room plan" },
  { label: "North set in rooms with windows", codes: ["no_north"], required: true, fixLabel: "Set north" },
];

export function checklist(problems: PublishProblem[], tips: PublishProblem[]): ChecklistRow[] {
  const all = [...problems, ...tips];
  return ROWS.map((row) => {
    const found = all.filter((p) => (row.codes === "rest" ? !NAMED.includes(p.code) : row.codes.includes(p.code)));
    return {
      label: row.label,
      done: found.length === 0,
      required: row.required,
      messages: found.map((p) => p.message),
      fix: found[0]?.fix_url ?? null,
      fixLabel: row.fixLabel,
    };
  });
}
