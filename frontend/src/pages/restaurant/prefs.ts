// The ambience wishes a diner may tick on step 1 (spec 8.1). The keys are the
// ones the server knows; "sunny" and "in the shade" exclude each other.
export interface PrefOption {
  key: string;
  label: string;
  /** How the wish reads in a sentence, e.g. on the confirmation. */
  words: string;
}

export const PREF_OPTIONS: PrefOption[] = [
  { key: "sun", label: "Sunny table", words: "sunny table" },
  { key: "shade", label: "In the shade", words: "in the shade" },
  { key: "view", label: "With a view", words: "with a view" },
  { key: "quiet", label: "Quiet corner", words: "quiet corner" },
  { key: "away_from_wc", label: "Away from the toilets", words: "away from the toilets" },
];

const EXCLUSIVE: Record<string, string> = { sun: "shade", shade: "sun" };

/** Ticks or unticks one wish. Sunny and shade never stay together (the newest wins); the order is always the same. */
export function togglePref(prefs: string[] | undefined, key: string, on: boolean): string[] {
  const kept = (prefs ?? []).filter((k) => k !== key && !(on && EXCLUSIVE[key] === k));
  const next = on ? [...kept, key] : kept;
  return PREF_OPTIONS.map((o) => o.key).filter((k) => next.includes(k));
}

/** "sunny table, with a view", or "" for no wishes. */
export function prefWords(prefs: string[] | undefined): string {
  return PREF_OPTIONS.filter((o) => (prefs ?? []).includes(o.key))
    .map((o) => o.words)
    .join(", ");
}
