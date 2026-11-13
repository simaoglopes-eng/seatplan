import { Button } from "../../design/components";
import type { RoomProblem } from "./validation";

export function ProblemList({ problems, onSelect }: { problems: RoomProblem[]; onSelect: (problem: RoomProblem) => void }) {
  const errors = problems.filter(p => p.level === "error").length, warnings = problems.filter(p => p.level === "warning").length, tips = problems.filter(p => p.level === "info").length;
  return <details className="room-problems"><summary>{errors} {errors === 1 ? "error" : "errors"} · {warnings} warnings · {tips} tips (show)</summary>
    <ul>{problems.map((problem, index) => <li key={`${problem.room_key}:${problem.code}:${index}`}><Button variant="ghost" className={problem.level === "error" ? "room-problem-error" : ""} onClick={() => onSelect(problem)}><span aria-hidden="true">{problem.level === "error" ? "⚠" : problem.level === "warning" ? "△" : "ⓘ"}</span> {problem.message}</Button></li>)}</ul>
    {!problems.length && <p>No layout problems found.</p>}
  </details>;
}
