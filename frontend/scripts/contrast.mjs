// Computes WCAG 2.2 contrast ratios for every colour pair the UI uses,
// reading the real values from src/design/tokens.css (so the table can never
// drift from the code). Prints a Markdown table and exits with code 1 when a
// pair fails, so it can run in CI.
//
// Usage: npm run contrast
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const tokensPath = fileURLToPath(new URL("../src/design/tokens.css", import.meta.url));
const css = readFileSync(tokensPath, "utf8");

// Text must reach 4.5:1 (WCAG 1.4.3). Icons, borders, focus rings and seat
// shapes are "non-text" and must reach 3:1 (WCAG 1.4.11).
const TEXT = 4.5;
const NON_TEXT = 3;

const PAIRS = [
  ["c-text", "c-bg", TEXT],
  ["c-text", "c-surface", TEXT],
  ["c-text", "c-surface-sunk", TEXT],
  ["c-text", "c-surface-strong", TEXT],
  ["c-text", "c-primary-soft", TEXT],
  ["c-text", "c-accent-soft", TEXT],
  ["c-text", "c-danger-soft", TEXT],
  ["c-text-muted", "c-bg", TEXT],
  ["c-text-muted", "c-surface", TEXT],
  ["c-text-muted", "c-surface-sunk", TEXT],
  ["c-primary", "c-bg", TEXT],
  ["c-primary", "c-surface", TEXT],
  ["c-primary", "c-primary-soft", TEXT],
  ["c-on-primary", "c-primary", TEXT],
  ["c-on-primary", "c-primary-hover", TEXT],
  ["c-accent", "c-bg", TEXT],
  ["c-accent", "c-surface", TEXT],
  ["c-accent", "c-accent-soft", TEXT],
  ["c-danger", "c-bg", TEXT],
  ["c-danger", "c-surface", TEXT],
  ["c-danger", "c-danger-soft", TEXT],
  ["c-friend", "c-surface", TEXT],
  ["c-friend", "c-friend-soft", TEXT],
  ["c-info", "c-surface", TEXT],
  ["c-info", "c-info-soft", TEXT],
  ["c-border-strong", "c-bg", NON_TEXT],
  ["c-border-strong", "c-surface", NON_TEXT],
  ["c-focus", "c-bg", NON_TEXT],
  ["c-focus", "c-surface", NON_TEXT],
  ["c-focus", "c-surface-sunk", NON_TEXT],
  ["seat-free-stroke", "c-surface-sunk", NON_TEXT],
  ["seat-held", "c-surface-sunk", NON_TEXT],
  ["seat-taken", "c-surface-sunk", NON_TEXT],
  ["seat-mine", "c-surface-sunk", NON_TEXT],
  ["seat-friend", "c-surface-sunk", NON_TEXT],
  ["seat-blocked", "c-surface-sunk", NON_TEXT],
  ["seat-accessible", "c-surface-sunk", NON_TEXT],
  ["seat-highlight", "c-surface-sunk", NON_TEXT],
  ["seat-taken-mark", "seat-taken", NON_TEXT],
  ["seat-mine-mark", "seat-mine", NON_TEXT],
  ["seat-accessible-mark", "seat-accessible", NON_TEXT],
  ["seat-held", "seat-held-soft", NON_TEXT],
  ["seat-friend", "seat-friend-soft", NON_TEXT],
];

/** Reads every "--name: #hex;" inside one CSS block of text. */
function readHexTokens(block) {
  const tokens = {};
  for (const match of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[match[1]] = match[2];
  }
  return tokens;
}

/** Splits tokens.css into the light values and the dark overrides. */
function readThemes() {
  const darkStart = css.indexOf("@media (prefers-color-scheme: dark)");
  const motionStart = css.indexOf("@media (prefers-reduced-motion");
  const light = readHexTokens(css.slice(0, darkStart));
  // Dark mode only overrides some tokens; the rest keep their light value.
  const dark = { ...light, ...readHexTokens(css.slice(darkStart, motionStart)) };
  // The Restaurants look re-defines some of the same tokens for its own routes (restaurant-theme.css).
  const theme = readFileSync(fileURLToPath(new URL("../src/design/restaurant-theme.css", import.meta.url)), "utf8");
  const themeDark = theme.indexOf("@media (prefers-color-scheme: dark)");
  const restLight = { ...light, ...readHexTokens(theme.slice(0, themeDark)) };
  const restDark = { ...dark, ...readHexTokens(theme.slice(themeDark)) };
  return { light, dark, restLight, restDark };
}

/** Relative luminance as defined by WCAG. */
function luminance(hex) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function ratio(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function main() {
  const themes = readThemes();
  let failures = 0;
  console.log("| Foreground | Background | Needs | Light | Dark | Restaurants light | Restaurants dark |");
  console.log("|---|---|---|---|---|---|---|");
  for (const [fg, bg, needed] of PAIRS) {
    const cells = ["light", "dark", "restLight", "restDark"].map((name) => {
      const t = themes[name];
      const r = ratio(t[fg], t[bg]);
      const pass = r >= needed;
      if (!pass) failures += 1;
      return `${r.toFixed(2)} ${pass ? "pass" : "FAIL"}`;
    });
    console.log(`| \`--${fg}\` | \`--${bg}\` | ${needed}:1 | ${cells.join(" | ")} |`);
  }
  console.log(`\n${PAIRS.length * 4} checks, ${failures} failures.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
