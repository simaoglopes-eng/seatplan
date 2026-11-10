# SeatPlan design system

The look and the rules every screen shares. Code lives in `frontend/src/design/`
(tokens and components) and `frontend/src/seatmap/` (the map and its glyphs).

## 1. Identity: linen and bottle green

A seating plan is traditionally printed on card and pinned up at the door of
a dining room. SeatPlan borrows that calm instead of the usual blue-on-white
software look:

- **Linen** paper background, **ink** text.
- **Bottle green** means "yours": your seat, primary buttons, confirmations.
- **Brass** means "pay attention": recommended seats and seats on hold.
- **Plum** marks friends; **brick** marks errors; **slate** marks accessibility.
- A **rust** focus ring, used for nothing else, so keyboard focus is never
  confused with a state.

Type pairing, all system fonts (no download, works offline):

| Role | Stack | Why |
|---|---|---|
| Display (headings, table numbers) | Iowan Old Style, Charter, Cambria, Georgia | A book serif: feels like a printed programme, has old-style numerals |
| Body | Avenir Next, Segoe UI, system-ui | Humanist sans, very legible at small sizes on phones |
| Mono | ui-monospace, SF Mono, Menlo | Codes and tokens only |

## 2. Tokens

`frontend/src/design/tokens.css` is the ONLY file that defines raw values.
Every stylesheet reads `var(--...)`, so a change of colour, spacing or speed is
a one-line edit there.

| Group | Tokens | Notes |
|---|---|---|
| Colour roles | `--c-bg`, `--c-surface`, `--c-surface-sunk`, `--c-surface-strong`, `--c-text`, `--c-text-muted`, `--c-border`, `--c-border-strong`, `--c-primary(-hover, -soft)`, `--c-on-primary`, `--c-accent(-bright, -soft)`, `--c-danger(-soft)`, `--c-friend(-soft)`, `--c-info(-soft)`, `--c-focus`, `--c-overlay` | Light values in `:root`, dark values in `@media (prefers-color-scheme: dark)` |
| Seat colours | `--seat-free-*`, `--seat-held(-soft)`, `--seat-taken(-mark)`, `--seat-mine(-mark)`, `--seat-friend(-soft)`, `--seat-blocked(-soft)`, `--seat-accessible(-mark)`, `--seat-highlight` | Helpers only, see the glyph table |
| Type | `--font-display`, `--font-body`, `--font-mono`, `--fs-xs` to `--fs-3xl` (ratio 1.2, base 16 px), `--lh-*`, `--fw-*` | `--fs-3xl` is fluid with `clamp()` |
| Space | `--space-1` (4 px) to `--space-8` (72 px) | 4 px base |
| Layout | `--layout-max`, `--layout-narrow`, `--layout-panel`, `--touch-target` (44 px), `--map-height`, `--map-label-size` | One-line layout changes |
| Shape | `--radius-sm/md/lg/pill`, `--border-width`, `--focus-width`, `--focus-offset` | |
| Depth | `--shadow-sm/md/lg` | Darker in dark mode |
| Layers | `--z-base`, `--z-map-controls`, `--z-header`, `--z-dialog`, `--z-toast`, `--z-skip-link` | |
| Motion | `--dur-instant` 80 ms, `--dur-fast` 140 ms, `--dur-base` 220 ms, `--dur-slow` 420 ms, `--dur-pulse` 1600 ms, `--ease-out`, `--ease-in-out`, `--ease-spring` | All durations drop to 0.01 ms under reduced motion |

## 3. Components

All in `frontend/src/design/components/`, imported from
`design/components` (the `index.ts`).

| Component | Purpose | Accessibility built in |
|---|---|---|
| `PageShell` | Header with wordmark, main landmark, footer, browser tab title | Skip link to `#main`; main is focusable so the skip link moves focus |
| `Button` | `primary`, `secondary`, `ghost`, `danger`; `busy` shows a spinner | 44 px minimum; `aria-busy`; while busy it is `aria-disabled` and ignores clicks (no double submit) but keeps keyboard focus |
| `Field` | Text input with label, hint and error | Label `for`, `aria-describedby` to hint and error, `aria-invalid`; error has an icon, not only red |
| `Select` | Native select with the same wiring | Native keyboard behaviour |
| `Checkbox` | Native checkbox with a large label | Whole row is a 44 px target |
| `Dialog` | Modal | Focus moves in, Tab is trapped, Escape closes, focus returns to the opener |
| `ToastProvider` / `useToast` | Short messages | One `aria-live="polite"` region; each toast starts with a word ("Done", "Problem"), not only a colour; stays 6 s and can be dismissed |
| `Badge` | Small status label | Text carries the meaning |
| `Skeleton`, `EmptyState`, `ErrorState` | Loading, empty, error | Skeleton is a `status` with hidden text; error is an `alert` with a retry button |
| `Stepper` | Steps of a flow | `aria-current="step"`; finished steps get a tick and hidden "(done)" |
| `Legend` | Key to the seat map | Draws the exact glyphs the map uses |

## 4. Seat states: never colour alone

Each state has its own shape, mark or pattern (WCAG 1.4.1), drawn by
`frontend/src/seatmap/glyphs.tsx`. The map and the legend import the same
functions, so they cannot drift apart. Every seat also has a full sentence as
its `aria-label`, for example "Table 4, seat 3, free, accessible".

| State | Shape | Mark / pattern | Colour (light) | Spoken as |
|---|---|---|---|---|
| free | circle, open ring | none | linen fill, ink ring | "free" |
| held | circle, dashed edge | diagonal stripes | brass | "on hold" |
| taken | solid disc | cross (x) | grey | "taken", plus the name if privacy allows |
| mine | solid disc, thick edge | tick | bottle green | "your seat" |
| friend | rounded SQUARE | dot pattern | plum | "friend", plus the name |
| blocked | circle | cross-hatch with a bar | warm grey | "not available" |
| accessible (flag) | any of the above | wheelchair badge, top right | slate | ", accessible" |
| recommended (highlight) | any | dashed brass halo that breathes | brass | ", recommended" |
| marked (second highlight, e.g. "changed by preview") | any | solid ink SQUARE outline, so it differs from the round halo in shape | ink | ", " plus the page's words (`markedLabel`) |
| selected | any | solid ink ring | ink | ", selected" |
| keyboard cursor | any | rust ring, only while the map has keyboard focus | rust | read through `aria-activedescendant` |

In restaurant mode (`mode="tables"`) the whole table takes the state: the table
shape gets the same fill pattern and mark, scaled up.

## 5. Contrast (WCAG 2.2 AA)

Computed by `frontend/scripts/contrast.mjs` from the real values in
`tokens.css` (run `npm run contrast`; it exits with an error if any pair fails).
Text needs 4.5:1 (1.4.3). Borders, focus rings, icons and seat shapes need 3:1
(1.4.11). Result on 2026-11-10: **86 checks, 0 failures.**

| Foreground | Background | Needs | Light | Dark |
|---|---|---|---|---|
| `--c-text` | `--c-bg` | 4.5:1 | 13.38 pass | 14.58 pass |
| `--c-text` | `--c-surface` | 4.5:1 | 14.45 pass | 13.20 pass |
| `--c-text` | `--c-surface-sunk` | 4.5:1 | 12.11 pass | 15.30 pass |
| `--c-text` | `--c-surface-strong` | 4.5:1 | 10.23 pass | 10.05 pass |
| `--c-text` | `--c-primary-soft` | 4.5:1 | 12.14 pass | 9.92 pass |
| `--c-text` | `--c-accent-soft` | 4.5:1 | 12.19 pass | 10.55 pass |
| `--c-text` | `--c-danger-soft` | 4.5:1 | 11.76 pass | 11.89 pass |
| `--c-text-muted` | `--c-bg` | 4.5:1 | 5.95 pass | 8.25 pass |
| `--c-text-muted` | `--c-surface` | 4.5:1 | 6.42 pass | 7.47 pass |
| `--c-text-muted` | `--c-surface-sunk` | 4.5:1 | 5.38 pass | 8.66 pass |
| `--c-primary` | `--c-bg` | 4.5:1 | 7.01 pass | 10.31 pass |
| `--c-primary` | `--c-surface` | 4.5:1 | 7.58 pass | 9.34 pass |
| `--c-primary` | `--c-primary-soft` | 4.5:1 | 6.37 pass | 7.02 pass |
| `--c-on-primary` | `--c-primary` | 4.5:1 | 7.58 pass | 10.82 pass |
| `--c-on-primary` | `--c-primary-hover` | 4.5:1 | 10.04 pass | 12.84 pass |
| `--c-accent` | `--c-bg` | 4.5:1 | 5.83 pass | 9.44 pass |
| `--c-accent` | `--c-surface` | 4.5:1 | 6.29 pass | 8.55 pass |
| `--c-accent` | `--c-accent-soft` | 4.5:1 | 5.31 pass | 6.84 pass |
| `--c-danger` | `--c-bg` | 4.5:1 | 6.33 pass | 8.00 pass |
| `--c-danger` | `--c-surface` | 4.5:1 | 6.84 pass | 7.24 pass |
| `--c-danger` | `--c-danger-soft` | 4.5:1 | 5.57 pass | 6.53 pass |
| `--c-friend` | `--c-surface` | 4.5:1 | 8.15 pass | 8.32 pass |
| `--c-friend` | `--c-friend-soft` | 4.5:1 | 6.62 pass | 7.28 pass |
| `--c-info` | `--c-surface` | 4.5:1 | 8.08 pass | 8.61 pass |
| `--c-info` | `--c-info-soft` | 4.5:1 | 6.78 pass | 7.68 pass |
| `--c-border-strong` | `--c-bg` | 3:1 | 4.02 pass | 5.05 pass |
| `--c-border-strong` | `--c-surface` | 3:1 | 4.34 pass | 4.57 pass |
| `--c-focus` | `--c-bg` | 3:1 | 4.95 pass | 8.76 pass |
| `--c-focus` | `--c-surface` | 3:1 | 5.35 pass | 7.94 pass |
| `--c-focus` | `--c-surface-sunk` | 3:1 | 4.48 pass | 9.20 pass |
| `--seat-free-stroke` | `--c-surface-sunk` | 3:1 | 7.85 pass | 10.73 pass |
| `--seat-held` | `--c-surface-sunk` | 3:1 | 5.27 pass | 9.91 pass |
| `--seat-taken` | `--c-surface-sunk` | 3:1 | 4.98 pass | 6.24 pass |
| `--seat-mine` | `--c-surface-sunk` | 3:1 | 6.35 pass | 10.82 pass |
| `--seat-friend` | `--c-surface-sunk` | 3:1 | 6.83 pass | 9.64 pass |
| `--seat-blocked` | `--c-surface-sunk` | 3:1 | 3.65 pass | 4.08 pass |
| `--seat-accessible` | `--c-surface-sunk` | 3:1 | 6.77 pass | 9.97 pass |
| `--seat-highlight` | `--c-surface-sunk` | 3:1 | 3.64 pass | 9.91 pass |
| `--seat-taken-mark` | `--seat-taken` | 3:1 | 5.94 pass | 6.24 pass |
| `--seat-mine-mark` | `--seat-mine` | 3:1 | 7.58 pass | 10.82 pass |
| `--seat-accessible-mark` | `--seat-accessible` | 3:1 | 8.08 pass | 9.97 pass |
| `--seat-held` | `--seat-held-soft` | 3:1 | 5.31 pass | 6.84 pass |
| `--seat-friend` | `--seat-friend-soft` | 3:1 | 6.62 pass | 7.28 pass |

## 6. Motion rules

1. **Motion explains a change, never decorates.** Three seat animations exist:
   - *hold* (a seat becomes `held`): a quick inhale, scale 1 to 0.82 to 1, `--dur-slow`, `--ease-out`.
   - *confirm* (a seat becomes `mine`): a small pop from 0.6 to 1, `--dur-slow`, `--ease-spring`.
   - *conflict* (the seat you selected was taken by someone else): a short head-shake, `--dur-slow`, `--ease-in-out`.
   The recommended halo breathes slowly (`--dur-pulse`), twice, to draw the eye, then stays still (WCAG 2.2.2).
2. **Only when something changed.** The first render never animates; the
   map compares old and new states (`useSeatChanges.ts`) and animates only
   the seats that changed. The cue is cleared after 900 ms.
3. **Every duration comes from a token.** Under `prefers-reduced-motion:
   reduce`, `tokens.css` sets every `--dur-*` to 0.01 ms, and `base.css` also
   forces animations to one short iteration as a safety net. Nothing moves;
   the state change is still visible through the glyph and announced in the
   live region.
4. **Animate transform and opacity only**, on an inner group without its own
   SVG `transform` attribute, so the browser never has to re-lay out the map.
5. **UI transitions are short:** hover and colour changes `--dur-fast`,
   dialogs and toasts rise in with `--dur-base`.

## 7. Map interaction rules

- One tab stop for the whole map (`role="listbox"`); seats are `option`s
  reached with `aria-activedescendant`. Arrow keys move to the nearest seat in
  that direction (sideways distance counts double), Enter or Space selects,
  `+`, `-` and `0` zoom and show the whole floor, Escape moves focus to the zoom buttons.
- Mouse and touch: drag to pan, wheel or pinch to zoom, buttons for zoom in,
  zoom out and fit (WCAG 2.5.7: no gesture is the only way).
- A drag of 5 px or more is a pan, not a tap, so shaky fingers still select.
- Tap targets (`geometry.ts`). Each seat has an invisible hit area that aims
  for 44 px on screen (`seatHitRadius`), but never reaches past half the
  distance to the nearest seat (`roomAround`), so two hit areas never overlap,
  and is never smaller than the drawn seat plus 4 units. Restaurant tables get
  a round hit area 4 units larger than the table.
- First view. The map fits the whole floor, but never zooms out so far that
  the smallest target is under 24 px (WCAG 2.5.8). When the floor is then too
  big for the screen (a phone), it opens centred on the focused, selected or
  recommended target and the person pans. The fit button and `0` still show
  the whole floor. A target button zooms to the recommended seat or table, and
  pages can set `focusId` ("Show on map") to zoom to any target at 44 px.
- Text on the map is drawn in venue units, so it would shrink when zoomed
  out. Zone and table labels never go below `--map-label-min` (12 px) on
  screen: the CSS divides that minimum by the zoom (`--map-zoom`). Theatre-row
  labels sit in a narrow aisle and keep their plain size. With `showOccupants`
  (organiser map) names appear under seats from zoom 1.4, when they are
  readable; they are also in each seat's accessible name.
- A visually hidden live region announces changes: "Table 4, seat 2 was just
  taken.", conflicts on your selection, and your own selections. More than
  three changes at once are summarised ("12 seats changed on the map."). The
  person's own actions are not read out as someone else's: a seat they just
  picked, or the page's `ownId`, turning "held" or "mine" only moves, and so
  does the next change of a table in `actedOn` (the tables staff just seated
  or moved, which the page already announced). Restaurant
  maps say "table" instead of "seat" everywhere.
- Performance: seats are memoised components that receive only simple
  values; pan and zoom change one transform on a parent group. Measured with
  400 seats in headless Chromium on 2026-11-10: 162 animation frames during a
  120-step drag plus 20 wheel zooms, median 16.7 ms, worst 16.8 ms (60 fps).
