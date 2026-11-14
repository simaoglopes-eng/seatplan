import { Button } from "../../design/components";
import type { RoomProblem } from "./validation";

export function ProblemList({ problems, onSelect }: { problems: RoomProblem[]; onSelect: (problem: RoomProblem) => void }) {
  const errors = problems.filter(p => p.level === "error").length, warnings = problems.filter(p => p.level === "warning").length, tips = problems.filter(p => p.level === "info").length;
  // The most serious thing first, with a way to see it on the plan; the full list is one tap away.
  const first = problems.find(p => p.level === "error") ?? problems.find(p => p.level === "warning");
  return <div className="room-problem-wrap">
    {first && <p className="room-problem-strip"><span aria-hidden="true">{first.level === "error" ? "⚠" : "△"}</span> <span>{first.message}</span> <Button variant="ghost" onClick={() => onSelect(first)}>Show in plan</Button></p>}
    <details className="room-problems"><summary>{errors} {errors === 1 ? "error" : "errors"} · {warnings} warnings · {tips} tips (show)</summary>
    <ul>{problems.map((problem, index) => <li key={`${problem.room_key}:${problem.code}:${index}`}><Button variant="ghost" className={problem.level === "error" ? "room-problem-error" : ""} onClick={() => onSelect(problem)}><span aria-hidden="true">{problem.level === "error" ? "⚠" : problem.level === "warning" ? "△" : "ⓘ"}</span> {problem.message}</Button></li>)}</ul>
    {!problems.length && <p>No layout problems found.</p>}
  </details></div>;
}
