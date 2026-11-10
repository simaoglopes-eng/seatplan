# Accessibility statement and heuristic self-review

Written on 2026-11-10 from the code in this repository.

## 1. Statement

SeatPlan aims for **WCAG 2.2 level AA** on every screen: the attendee page,
the organiser workspace, the diner booking and manage pages, the staff floor,
the floor-plan editor, the home page and the sign-in page.

**We do not claim conformance.** What we can show is what the code does and
which automatic checks pass. These things were **not** checked:

- Screen readers (VoiceOver, NVDA, TalkBack): not tested on any device.
- Real touch devices: not tested. The browser tests in `frontend/e2e/` run
  headless Chromium at 390x844 (with touch) and 1440x900, which is a
  simulated size, not a phone.
- Zoom to 200% and 400%, the 320 px reflow width, and user text-spacing
  overrides: not checked.
- Testing with disabled people: not done yet.
- Most component behaviour below is covered by vitest tests in jsdom (a
  simulated browser), not a real browser.

If you find a barrier, please open an issue in the team's repository and say
which page and what you were trying to do.

## 2. Automatic check we ran today

Command, run on 2026-11-10 in `frontend/`:

```
npm run contrast
```

It computes the contrast ratio of every text, border, focus and seat colour
pair from the real values in `frontend/src/design/tokens.css`, in light and
dark mode (`frontend/scripts/contrast.mjs`). Last lines of the real output:

```
| `--seat-held` | `--seat-held-soft` | 3:1 | 5.31 pass | 6.84 pass |
| `--seat-friend` | `--seat-friend-soft` | 3:1 | 6.62 pass | 7.28 pass |

86 checks, 0 failures.
```

The full table is in `docs/design-system.md`, section 5. This check covers
token pairs only. It does not see a colour placed on a background that is not
in its list.

A second automatic check is the axe-core scan in
`frontend/e2e/accessibility.spec.ts`: it runs the WCAG 2.1 A and AA rules on
six pages (home, sign-in, attendee invitation, diner booking, organiser
workspace, staff floor). On 2026-11-10 `npm run e2e` gave `12 passed`, so axe
reported no violations on those pages. A tool like this finds only part of
the problems; it does not replace a person with a screen reader.

## 3. WCAG 2.2 A and AA, criterion by criterion

Status words:
- **Built in:** the code does what the criterion asks (file given). Not
  confirmed with assistive technology.
- **Partly:** some of it is done, a gap is named.
- **Not checked:** we have not looked, or could not test it.
- **N/A:** the app has nothing this criterion applies to.

Paths are relative to `frontend/src/` unless they start with `frontend/` or
`backend/`.

### Perceivable

| Criterion | Level | Status | What the code does | Not checked or gap |
|---|---|---|---|---|
| 1.1.1 Non-text content | A | Built in | Decorative SVG icons have `aria-hidden="true"` (`design/components/States.tsx`, `Field.tsx`, `seatmap/MapControls.tsx`). Every seat or table has a full sentence as its name, for example "Table 4, seat 3, free, accessible" (`seatmap/describe.ts`). Icon-only buttons have `aria-label` ("Zoom in", "Dismiss message"). | The editor canvas is hidden from screen readers on purpose; its side panel is the way in (`pages/editor/EditorCanvas.tsx`, `PropertiesPanel.tsx`). |
| 1.2.1 to 1.2.5 Audio and video | A, AA | N/A | No audio or video. | |
| 1.3.1 Info and relationships | A | Built in | Labels tied to inputs with `htmlFor` and `aria-describedby` for hints and errors (`design/components/Field.tsx`); `main` landmark (`PageShell.tsx`); the stepper is a `nav` list with `aria-current="step"` (`Stepper.tsx`); tabs use `tablist`, `tab`, `tabpanel` (`pages/events/Tabs.tsx`, `pages/restaurant/StaffPage.tsx`). The map is a `listbox` of `option`s (`seatmap/SeatMap.tsx`). | Heading levels across all pages not audited. |
| 1.3.2 Meaningful sequence | A | Partly | Content is in reading order in the HTML. On the organiser page the map is placed above the list on a phone (`docs/ux-events.md`). | Not checked with a screen reader. |
| 1.3.3 Sensory characteristics | A | Built in | Instructions name things by their words ("Confirm this seat", "Choose for me"), not by colour or position only. | |
| 1.3.4 Orientation | AA | Built in | No orientation lock: a search for `orientation` in `frontend/src` and `frontend/index.html` found nothing. | Not tried on a rotated real device. |
| 1.3.5 Identify input purpose | AA | Built in | `autoComplete="name"`, `"email"`, `"tel"` on the diner's own details (`pages/restaurant/StepDetails.tsx`, `WaitlistDialog.tsx`); `"email"` and `"current-password"` on sign-in (`pages/Login.tsx`). The organiser's "Add guest" form uses `autoComplete="off"` because it is about someone else (`pages/events/AddGuestForm.tsx`). | |
| 1.4.1 Use of colour | A | Built in | Every seat state has its own shape and mark (open ring, stripes, cross, tick, square, hatch), drawn by `seatmap/glyphs.tsx` and reused by the legend. Slot times have an icon and a word (`pages/restaurant/SlotButton.tsx`). Field errors have an icon (`Field.tsx`). The open tab has a thick underline. | |
| 1.4.2 Audio control | A | N/A | No sound. | |
| 1.4.3 Contrast (minimum) | AA | Built in | `npm run contrast`: 86 checks, 0 failures (section 2). Text pairs need 4.5:1. | Only token pairs are checked; text drawn on the map over seat fills is not in the list. |
| 1.4.4 Resize text | AA | Partly | Font sizes are in `rem` (`design/tokens.css`, `--fs-xs` to `--fs-2xl`); map labels never go below `--map-label-min` (12 px) on screen (`seatmap/seatmap.css`). | 200% zoom not checked. |
| 1.4.5 Images of text | AA | Built in | No images of text; table numbers and labels are SVG text. | |
| 1.4.10 Reflow | AA | Partly | Layouts are written phone first. README test report: no sideways scrolling at 390x844 in headless Chromium. | 320 px width not checked. The staff floor was not tested below 1024 px wide (`docs/ux-restaurant.md`). The seat map pans by design (a two-dimensional map is an allowed exception), but this was not reviewed. |
| 1.4.11 Non-text contrast | AA | Built in | Borders, focus ring and seat shapes need 3:1 and are in the contrast check (for example `--c-focus` on `--c-bg`, `--seat-blocked` on `--c-surface-sunk`). | |
| 1.4.12 Text spacing | AA | Not checked | | No test with a text-spacing bookmarklet or style override. |
| 1.4.13 Content on hover or focus | AA | Not checked | The only tooltip found is the browser's own `title` on the "Zoom to the recommended ..." button (`seatmap/MapControls.tsx`). | Organiser map names that appear on hover were not reviewed. |

### Operable

| Criterion | Level | Status | What the code does | Not checked or gap |
|---|---|---|---|---|
| 2.1.1 Keyboard | A | Built in | The map is one tab stop; arrow keys move between seats, Enter or Space picks, `+`, `-`, `0` zoom (`seatmap/mapKeyboard.ts`). Tabs use arrows, Home and End (`pages/events/Tabs.tsx`). Every drag has a keyboard way: "Place, then seat" for organisers, the "Move or combine" dialog for staff (`pages/restaurant/MoveDialog.tsx`), arrow-key nudge in the editor (`pages/editor/EditorPage.tsx`). | Not tested end to end with keyboard only in a real browser. |
| 2.1.2 No keyboard trap | A | Built in | Escape leaves the map to the zoom buttons (`seatmap/mapKeyboard.ts`). Dialogs trap Tab on purpose but Escape closes them and focus returns to the opener (`design/components/Dialog.tsx`). | |
| 2.1.4 Character key shortcuts | A | Built in | `+`, `-`, `0` work only while the map has focus; the editor's arrow keys only inside the editor. | |
| 2.2.1 Timing adjustable | A | Partly | A seat or table hold lasts 5 minutes (`backend/app/core/holds.py`, `HOLD_MINUTES = 5`). The page shows a countdown, warns once at one minute, and after it ends offers "Hold it again" (events) or sends the diner back to the map with their typed details kept (restaurants). | The hold cannot be extended before it ends. We think the WCAG real-time exception applies (other people are competing for the same seat at the same moment), but this is our reading, not a checked fact. |
| 2.2.2 Pause, stop, hide | A | Built in | All motion stops when the system setting "reduce motion" is on (`design/tokens.css` and `design/base.css`, `prefers-reduced-motion`). The recommended seat's halo breathes twice (3.2 s) and then stays still (`seatmap/seatmap.css`, `seat-breathe ... 2 alternate`), so nothing moves for more than 5 seconds. | Not watched in a real browser after the change. |
| 2.3.1 Three flashes | A | Built in | No flashing; the slowest animation token is 1600 ms (`--dur-pulse`). | |
| 2.4.1 Bypass blocks | A | Built in | "Skip to main content" link; `main` takes focus (`design/components/PageShell.tsx`). | |
| 2.4.2 Page titled | A | Built in | Each page sets `document.title` to "<page> · SeatPlan" through `PageShell` (for example "Your booking", "Service floor"). | |
| 2.4.3 Focus order | A | Built in | Step headings take focus when a step changes; actions that remove the pressed button move focus to a sensible place (`docs/ux-events.md`, section 5; tests in `pages/events/__tests__/`). | Real-browser check not done. |
| 2.4.4 Link purpose (in context) | A | Built in | Links are words ("Organiser sign in", demo links with labels from `pages/demoLinks.ts`). | |
| 2.4.5 Multiple ways | AA | N/A for flows | Most pages are a step in a process or reached from a personal link, which WCAG excludes. The home page lists the demo links. | |
| 2.4.6 Headings and labels | AA | Built in | Questions as headings ("When, and how many?"); every field has a visible label. | |
| 2.4.7 Focus visible | AA | Built in | One rust focus ring used for nothing else, on `:focus-visible` (`design/base.css`); the map draws its own ring on the active seat (`seatmap/seatmap.css`). | |
| 2.4.11 Focus not obscured (minimum) | AA | Partly | The header is sticky at the top (`design/components.css`, `.shell-header`) and the hold bar is sticky at the bottom (`pages/events/events.css`, `.ev-holdbar`; `pages/restaurant/restaurant.css`, `.rb-actions-sticky`). `design/base.css` sets `scroll-padding-top` and `scroll-padding-bottom` to `--space-8` (4.5rem) on `html`, so a control reached with Tab stops clear of them. | Not checked with the keyboard in a real browser, and a hold bar that wraps onto two lines on a narrow phone may be taller than 4.5rem. |
| 2.5.1 Pointer gestures | A | Built in | Pinch and wheel zoom have buttons: zoom in, zoom out, fit (`seatmap/MapControls.tsx`). | |
| 2.5.2 Pointer cancellation | A | Built in | Seats and tables are picked with `onClick` (on release), and a move of 5 px or more is a pan, not a pick (`seatmap/usePanZoom.ts`, `DRAG_THRESHOLD_PX = 5`; `seatmap/Targets.tsx`). | |
| 2.5.3 Label in name | A | Built in | Spoken names start with the visible word ("Copy link for ..." for the visible "Copy link", `pages/events/GuestRow.tsx`). | Not audited on every button. |
| 2.5.4 Motion actuation | A | N/A | Nothing reacts to shaking or tilting. | |
| 2.5.7 Dragging movements | AA | Built in | Pan has buttons; drag and drop of guests and bookings has the click or keyboard ways listed under 2.1.1. | |
| 2.5.8 Target size (minimum) | AA | Built in | `--touch-target: 44px` used for buttons, checkboxes and map controls (`design/tokens.css`, `design/components.css`). Seat hit areas aim for 44 px on screen and the first view never zooms out so far that a target is under 24 px (`seatmap/geometry.ts`, `docs/design-system.md` section 7). | Not measured on a real touch screen. |

### Understandable

| Criterion | Level | Status | What the code does | Not checked or gap |
|---|---|---|---|---|
| 3.1.1 Language of page | A | Built in | `<html lang="en">` (`frontend/index.html`). | |
| 3.1.2 Language of parts | AA | Built in | Dates are written in British English on every page (`pages/events/format.ts`, `DATE_LOCALE = "en-GB"`; `pages/restaurant/format.ts`), matching `lang="en"`, whatever the browser's own language. A vitest test checks this (`pages/events/__tests__/rules.test.ts`). | Guest and venue names typed in another language carry no `lang` mark. |
| 3.2.1 On focus | A | Built in | Focus never submits or navigates. Focus from a pointer does not move the map camera (decisions log, item 14 of the last section). | |
| 3.2.2 On input | A | Not checked | Choosing a date on the staff page reloads every tab for that day. | Not reviewed against the criterion. |
| 3.2.3 Consistent navigation | AA | Built in | One `PageShell` header and footer on every page. | |
| 3.2.4 Consistent identification | AA | Partly | Shared `Button`, `Dialog`, `Badge`, `SeatMap`. | `docs/ux-restaurant.md` notes that two ways to hold the suggested table share the same button name. |
| 3.2.6 Consistent help | A | N/A | There is no help page or contact link to keep in place. | |
| 3.3.1 Error identification | A | Built in | `aria-invalid` and an error text with an icon (`Field.tsx`); server errors in `role="alert"` boxes (for example `pages/restaurant/StepDetails.tsx`, `StepTable.tsx`). | |
| 3.3.2 Labels or instructions | A | Built in | Visible labels and hints ("Including children. For more than N, please call the restaurant.", `pages/restaurant/StepParty.tsx`). | |
| 3.3.3 Error suggestion | AA | Built in | Errors say how to fix it ("It should look like name@example.com"); conflicts offer the next free seat or tables. | |
| 3.3.4 Error prevention (legal, financial, data) | AA | Built in | No payments. Bookings can be changed or cancelled from the manage link; release, cancel, new link and delete data all ask first. | |
| 3.3.7 Redundant entry | A | Built in | When a restaurant hold ends during step 4, the diner goes back to the map and the typed details are kept (`docs/ux-restaurant.md`, step 4). | |
| 3.3.8 Accessible authentication (minimum) | AA | Built in | Sign-in is email and password with `autoComplete` so a password manager can fill it; no paste blocking (a search for `onPaste` found nothing); no puzzle. Guests and diners never sign in: a personal link is enough. | |

### Robust

| Criterion | Level | Status | What the code does | Not checked or gap |
|---|---|---|---|---|
| 4.1.2 Name, role, value | A | Built in | Native HTML controls; the map uses `listbox`, `option` and `aria-activedescendant`; busy buttons use `aria-busy` and `aria-disabled` (`design/components/Button.tsx`); tabs and dialogs use their ARIA roles. | Custom map roles not tested with a screen reader. |
| 4.1.3 Status messages | AA | Built in | Toasts in an `aria-live="polite"` region (`Toast.tsx`); skeletons are `role="status"` (`States.tsx`); the map has its own polite live region for seat changes (`seatmap/SeatMap.tsx`); the hold countdown is a `role="timer"` that does not speak every second (`pages/restaurant/HoldCountdown.tsx`). | What a screen reader really says was not heard. |

## 4. Nielsen's ten heuristics: self-review

Done by reading the code and the UX notes, not with users. Each vertical has
its own detailed table in `docs/ux-events.md` (section 6) and
`docs/ux-restaurant.md` (section 7); this is the joint summary.

| # | Heuristic | What the code does (example files) | Gaps found |
|---|---|---|---|
| 1 | Visibility of system status | Stepper (`design/components/Stepper.tsx`), skeletons with words, busy buttons, hold countdown (`pages/events/HoldBar.tsx`, `pages/restaurant/HoldCountdown.tsx`), live map (`api/useLive.ts`), "Preview, not applied" banner | No "live" or "reconnecting" sign: `useLive` returns its status but no page shows it. A failed live refresh is silent. |
| 2 | Match with the real world | Venue words: hold, place cards, covers, walk-in, no-show, party of 4; 24-hour times; table and seat labels as printed at the venue | "Score" and "gap %" in the organiser's Optimise tab are optimiser words. |
| 3 | User control and freedom | Change and release seat, skip the people step, discard a preview, Undo and Redo (events and editor, `pages/editor/useHistory.ts`), "Keep my booking", "Undo my changes" in the schedule | No undo after a staff action or an applied staff plan. Closing the tab does not give a hold back; it ends after 5 minutes. |
| 4 | Consistency and standards | One design system (`frontend/src/design/`) and one map (`frontend/src/seatmap/`) for every page; one summary component for confirmation and manage page | Two ways to hold the suggested restaurant table share one button name. |
| 5 | Error prevention | Only free and suitable seats or tables can be picked; closed days caught in step 1; past times hidden; previews before applying; confirmations before release, cancel, new link and delete; the database refuses double booking (`backend/app/models.py`) | Staff walk-in and what-if lists stop at 12 people (`pages/restaurant/WhatIf.tsx`, `PARTY_CHOICES`) and do not know the venue's own limit. The organiser can drop a guest on an occupied seat and only then gets an explanation. |
| 6 | Recognition rather than recall | Legend next to every map (`design/components/Legend.tsx`), reasons on every recommendation, date, time and party summary on each diner step | Zoomed out, the organiser map shows names only on hover, focus or in the spoken label. The staff time slider does not mark where each service starts. |
| 7 | Flexibility and efficiency | "Choose for me", auto-fill, drag and drop for mouse users, keyboard ways for everything, filters and search | No keyboard shortcuts for frequent staff actions or for organiser undo and redo. |
| 8 | Aesthetic and minimalist design | One decision per attendee and diner screen; the organiser and staff pages split work into tabs | The organiser Guests tab is long; the staff floor is dense on a small laptop. |
| 9 | Help users recover from errors | Each error says what happened and the next step, with a button (next best seat, hold again, try again, sign in); 409 answers carry alternatives (decisions log, restaurants vertical API, item 5) | Some error texts come straight from the server, so their wording depends on the backend. |
| 10 | Help and documentation | Hints under fields, one-line explanations on cards, privacy preview; user guides in `docs/user-guide-*.md` | No help page or first-time tour inside the app. |

## 5. Known gaps to fix

Done on 2026-11-10 (code changed, unit and browser tests passed afterwards):

1. `scroll-padding-top` and `scroll-padding-bottom` on `html`
   (`design/base.css`), so focus is not hidden under the sticky header and
   hold bar (2.4.11).
2. The recommended halo now breathes twice and stops (`seatmap/seatmap.css`)
   (2.2.2).
3. Event dates use `"en-GB"` (`pages/events/format.ts`) (3.1.2).

Still to do:

4. Show the live-update status on the attendee, organiser and staff pages
   (heuristic 1).
5. Run the checks we could not run: a screen reader on a phone and a laptop,
   200% zoom, 320 px width, text spacing, and real touch devices.
