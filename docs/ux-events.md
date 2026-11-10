# Events screens: UX

The attendee page (`/e/:token`, phone first) and the organiser page
(`/organiser/:eventId`, laptop first). Code: `frontend/src/pages/events/`.
Shared pieces (buttons, fields, seat map, legend, toasts, states) come from
the design system unchanged (`docs/design-system.md`).

## 1. Attendee journey

Goal: a first-time guest chooses a seat in under 3 minutes with no help.
The happy path is **5 taps**: Yes, a person, Continue, a seat, Confirm.

| Step | What the guest sees | What they do |
|---|---|---|
| 0. Open link | Event name (largest text), date and time in their own language on a 24-hour clock, the venue name, "Your invitation", a 4-step progress bar | Nothing to learn: one question on screen |
| 1. Reply | "Hi Ana, will you be there?" and how long the rest takes ("about two minutes") | "Yes, I will be there" or "No, I cannot come" |
| 2. People you know (optional) | Search box, list of names already shortened by the privacy setting, "N selected" | Tick people, "Continue with 2 people", or "Skip this step" |
| 3. Choose seat | "Recommended for you" cards with reasons, the map with friends (plum squares) and good seats (brass halo), "Free next to someone you know" buttons, legend, privacy switch. A card says "Best match" only when it really is near someone the guest knows; otherwise the cards are "Option 1, 2, 3" | Tap a card ("Show on map" zooms the map in on that seat), then "Hold this seat for 5 minutes"; or tap a free seat on the map to hold it straight away |
| 3b. On hold | A bar stuck to the bottom of the screen: "Held for you, Table 1, seat 3, 4:59 left" and "Confirm this seat" | Confirm, or tap another free seat to switch |
| 4. Done | "You are all set", the seat label in large type, "A confirmation email with a calendar invite is on its way to you. You can close this page.", a small map with the seat ticked | "Change seat", "Release my seat" (asks first), privacy switch |

The person can leave at any moment: the reply and the people list are saved
when given, and the progress bar shows where they are on return.

## 2. Organiser journey

| Step | Where | What happens |
|---|---|---|
| 1. Overview | Header | Event name, date, venue, "5 of 8 guests seated" |
| 2. Who is missing | Guests tab (opens first) | "3 guests have no seat yet", filter "Not seated yet" preselected; second filter "Did not choose themselves" |
| 3. Fix one guest | Guests tab + map | Press "Place" on a guest (or drag the name onto a seat), then choose a seat. On a phone the map is above the list, so "Place" scrolls the map into view and gives it the keyboard focus. Choosing an occupied seat with no guest selected picks that guest up, so moves work with keyboard only |
| 4. Fill the rest | Optimise tab | "Preview auto-fill" draws the proposal on the map, changed seats marked with a square outline ("changed by preview", also in the legend), plus a score table. "Apply this plan" or "Discard" |
| 5. Improve | Optimise tab | "Preview re-plan" (moves as few people as possible), "Compare plans" side by side, Undo and Redo |
| 6. Think before moving | Optimise tab, What if? | Tick "Show the score change before moving anyone"; a move then shows Now, After and Change per score term and any rule it would break; "Make this move" or "Cancel" |
| 7. Check quality | Optimise tab, Exact check | How many guests each plan seats, our score, the proven best, the gap in % (only when both plans seat the same number of guests; otherwise the server's sentence says why), timings. When the plan changes afterwards, the old figures are hidden: "The plan has changed since this check. Run it again." |
| 8. Privacy and deadline | Settings tab | Three privacy modes with a live preview table (real name next to what attendees will see); deadline date and time, or "No deadline" |
| 9. Print | Print tab | Seating chart by table and place cards; each button prints only its own part |
| 10. Guests admin | Guests tab | Add a guest (link shown once, "Copy link"), import CSV with a line-by-line error report, download CSV, "New link" (asks first, old link stops), "Delete data" (asks first, cannot be undone) |

## 3. States of each screen

| Screen | Loading | Empty | Error | Success |
|---|---|---|---|---|
| Attendee, any step | Skeleton shaped like title and card, "Loading your invitation..." for screen readers | Nobody to list: "No names to show yet. You can skip this step and pick any seat." No recommendations: "No suggestions yet. Pick any free seat on the map." | Wrong, old or revoked link: "This link does not work" with what to do (no pointless retry). Network or server: "We could not load your invitation" + "Try again" | Step heading takes focus; live region says what happened |
| Attendee, seat step | Recommendations skeleton "Finding good seats for you" | All recommended seats taken: falls back to the map | Conflict (409 or live update): "That seat was just taken" + next best seat button. Hold ran out (timer or 409): "Your 5 minutes ran out" + "Hold it again". Deadline: "Seat changes are closed". Anything else: "That did not work" + server message | Hold bar with countdown; "Done. Table 1, seat 3 is now your seat." |
| Attendee, after deadline | | No seat: "Seat choice has closed" + "the organiser will place you" | | Seat shown read-only |
| Attendee, declined | | | | "Thank you for letting us know" + "I can come after all" |
| Organiser page | Two skeletons (map, list) | "Everyone has a seat" / "No guests here" | Not signed in: "Please sign in" + link back. Not found or not theirs: "We could not find this event". Other: message + "Try again" | Toast + live region for every write |
| Optimise tab | Spinner in the pressed button | "Make at least two previews ... to compare them here"; "Everyone has a seat" disables auto-fill | Optimiser or exact check fails: message in the card | Preview card; "applied. You can undo it." |
| Print tab | "Preparing the seating chart" | "Nobody is seated yet" | "Nothing to print yet" + retry | Preview of both parts, unseated names listed |
| CSV import | Button spinner | | "Nothing was imported yet. 2 lines need fixing first" + table of line and problem | "Added 18 guests. Their personal links are ready to copy." |

## 4. Microcopy

| Moment | Text | Why |
|---|---|---|
| RSVP question | "Hi Ana, will you be there?" | First name: personal, and confirms the link is theirs |
| Time promise | "It takes about two minutes, and you can change your seat later." | Lowers the cost of starting; removes fear of a wrong choice |
| People step | "This step is optional, and nobody else sees your list." | Privacy worry answered before it is asked |
| Hidden anonymous guests | "2 guests have chosen to stay anonymous, so they are not listed." | Explains a shorter list instead of hiding it |
| No search match | "Nobody matches "Mar". Names may be shortened for privacy, so try a first name." | Teaches the privacy rule at the moment it matters |
| Seat step | "Tap a free seat to hold it for 5 minutes, then confirm." | The whole interaction in one sentence |
| Recommendation card | "Best match", "Next to Maya R.", "Show on map"; "Option 1" when nobody the guest knows is near | The reason is the selling point; "Best match" is never claimed without one |
| After "People you know" | "Saved 2 people. Seats near them are suggested below." or, when none of them has a seat yet, "Saved 1 person. Nobody you chose has a seat yet, so any free seat is fine for now. You can change it later." | Never promises seats near people who are not seated |
| Deadline | "You can change or release your seat until Saturday 5 June 2027, 23:59 WEST" | 24-hour clock and time zone; a midnight deadline is shown as 23:59 of the day before, so "Sunday 00:00" cannot be read as the end of Sunday |
| Hold bar | "Held for you ... 4:59 left" (under one minute: "left, hurry") | Time pressure shown in words as well as red |
| Conflict | "Someone else chose Table 1, seat 3 a moment before you. Sorry about that." + "Hold Table 1, seat 4" | Not their fault; the next step is one tap |
| Hold expired | "We kept Table 1, seat 3 for you for 5 minutes, then let others choose it again. It may still be free." | Explains the rule and the chance |
| Anonymous switch | "Other guests will see "Guest" instead of your name. The organiser always sees your name." | Who sees what, in one line |
| Success | "You are all set" / "A confirmation email with a calendar invite is on its way to you. You can close this page." | Closure and the next thing that happens |
| Release dialog | "Someone else can take it straight away." | Consequence before the action |
| Organiser filter | "Not seated yet", "Did not choose themselves" | Organiser's words, not database states |
| New link dialog | "Their current link stops working at once." | Irreversible effect named |
| Delete dialog | "This erases their name, email, seat and personal link. It cannot be undone." / "Delete for good" | GDPR erase is final; the button says so |
| Preview banner | "Preview, not applied." | Prevents "did it already change?" doubt |
| Exact check gap | "2.9%: our plan is within 2.9% of the best." | A percentage with its meaning |
| Exact check, different seat counts | "The heuristic left 1 guest unseated that the optimum seats." (no %) | Points of a plan that seats fewer guests are not comparable |
| Guest row buttons | Visible "Place", "New link", "Delete data"; heard as "Place Bea Costa", "New link for Bea Costa", "Delete data of Bea Costa" | 28 identical button names tell a screen-reader user nothing |
| Auto-fill card, everyone seated | Only the button "Everyone has a seat" (no "Seats the 0 guests" sentence) | No contradictory copy |

## 5. Accessibility and motion, checked in code and tests

- Every step heading takes focus when the step changes (not on first load), so
  screen readers announce the new step.
- Organiser actions that remove the pressed button never drop focus to the
  page: a new preview focuses its heading, "Apply this plan" focuses "Undo
  and redo", "Discard" focuses the auto-fill heading, and "Add guest" puts
  the cursor back in the Name field for the next guest.
- The attendee's own hold, also one restored after a reload, is passed to the
  map as `ownId`, so it is never read out as "put on hold by someone else".
- One polite live region per page announces results ("Table 1, seat 3 is held
  for you for 5 minutes."); conflicts and expiry use `role="alert"`.
- The countdown is not read every second; the hidden text says minutes, and a
  one-minute warning is announced once.
- No colour-only meaning: seat states have glyphs (shared map), the open tab
  has a thick underline, recommendation cards say "(showing)", score changes
  have a + or - sign, statuses are words in badges, selected guest rows say
  "Choosing seat...".
- Keyboard: the map is one tab stop with arrow keys (shared); tabs use arrow
  keys, Home and End (`Tabs.tsx`); drag and drop always has the "Place, then
  seat" alternative; dialogs trap focus (shared).
- Touch targets are at least 44 px (`--touch-target`); main buttons fill the
  width on phones; the Confirm bar sticks to the bottom of the screen.
- Reduced motion: no new animation was added; every transition uses a
  duration token, which `tokens.css` sets to 0.01 ms under
  `prefers-reduced-motion`.

## 6. Self-check against Nielsen's ten heuristics

| # | Heuristic | How the screens meet it | Honest gaps |
|---|---|---|---|
| 1 | Visibility of system status | Progress bar, skeletons, button spinners, countdown, live map, "N of M guests seated", preview banner | The organiser page does not show whether live updates are streaming or polling |
| 2 | Match with the real world | "Hold", "place card", "seating chart", table and seat numbers as printed at the venue | "Score" and "gap %" are optimiser words; the table rows translate them, the total stays abstract |
| 3 | User control and freedom | Change seat, release, skip people step, discard preview, undo and redo, cancel what-if | No undo for "Delete data" or "New link" (on purpose: both must be final; both ask first) |
| 4 | Consistency and standards | Shared design system and map; one notice pattern; same button order (main action first) | The attendee can only hold from the map tap or the card button; tapping a card does not hold, which a few people may expect |
| 5 | Error prevention | Only free seats are tappable; confirmations before release, new link, delete; email check before submit; what-if disables moves that break a rule | The organiser can drop a guest onto an occupied seat and only then gets an explanation |
| 6 | Recognition rather than recall | Legend on screen, reasons on every recommendation, seat names in words, chips for seats next to friends; the organiser map prints guests' names under their seats once zoomed in far enough to read them | Zoomed out, the organiser map shows names only on hover, focus or in the seat's spoken label |
| 7 | Flexibility and efficiency | Drag and drop for mouse users; "Place, then seat" and arrow keys for keyboard; filters and search; auto-fill for bulk work | No keyboard shortcuts for undo/redo; no bulk select of guests |
| 8 | Aesthetic and minimalist design | One question per attendee step; the organiser panel splits work into four tabs | The organiser Guests tab is long (list, add, import, export in one column) |
| 9 | Help users recover from errors | Every error says what happened and the next step, with a button for it (next best seat, hold again, try again, sign in) | A failed live refresh is silent; the next tick retries, but a long outage shows stale data without a warning |
| 10 | Help and documentation | Hints under fields, one-line explanations on each card, privacy preview | No help page; the 3-minute target is reasoned from the 5-tap path, not measured with real users |

## 7. What was verified and how

- Unit and component tests (`frontend/src/pages/events/__tests__/`) with the
  API mocked at the fetch level: attendee happy path to confirmation, 409
  conflict with the next best seat, a live update that takes my held seat,
  expired hold, invalid link, organiser auto-fill preview then apply, privacy
  preview then save, keyboard placement of a guest. Added after the review:
  venue name, "Best match" and the saved-people sentence when nobody known is
  seated, "Show on map" moving the map's cursor and camera to the seat, a
  restored hold not announced as a conflict, guest names in row buttons,
  "Place" scrolling and focusing an off-screen map, occupant names on the
  organiser map, focus after preview, apply and add guest, the stale exact
  check after Undo, the exact check with different seat counts, CSV errors
  keeping the server's code, and the 24-hour and midnight deadline format.
  These newer checks ran in jsdom only, not in a real browser.
- Headless Chromium screenshots against a throwaway fake API (390 px phone
  and 1440 px laptop) of the welcome, seat, hold, done and organiser screens.
  Not checked in a real browser with the real backend, and not with a screen
  reader.
