import { useEffect, useState } from "react";
import { Field } from "../../design/components";

/** Commit complete decimal edits on blur, keeping invalid input visible. */
export function RoomNumberField({ label, value, onCommit, decimals = 0, min, max }: {
  label: string; value: number; onCommit: (value: number) => void;
  decimals?: number; min?: number; max?: number;
}) {
  const format = (n: number) => n.toFixed(decimals).replace(".", ",");
  const [text, setText] = useState(format(value));
  const [error, setError] = useState("");
  useEffect(() => { setText(value.toFixed(decimals).replace(".", ",")); setError(""); }, [value, decimals]);
  return <Field label={label} inputMode="decimal" value={text} error={error || undefined}
    onChange={event => { setText(event.target.value); setError(""); }}
    onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }}
    onBlur={() => {
      if (text === format(value)) return;
      const number = Number(text.replace(",", "."));
      if (!text.trim() || !Number.isFinite(number) || (min !== undefined && number < min) || (max !== undefined && number > max)) { setError("Use a number within the allowed range."); return; }
      try { onCommit(number); } catch (caught) { setError(caught instanceof Error ? caught.message : "Check this value."); }
    }} />;
}

export type ShapeSelection = { kind: "corner" | "side"; index: number } | null;
