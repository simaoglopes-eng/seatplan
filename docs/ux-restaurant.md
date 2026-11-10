# Restaurant screens: UX

Code: `frontend/src/pages/restaurant/`. API client: `frontend/src/api/restaurant.ts`.
Tests: `frontend/src/pages/restaurant/__tests__/`. Request and response shapes:
`docs/decisions-log.md`, entry "2026-11-10: restaurant screens (frontend)".

Two people use these screens, in very different situations:

| | Diner | Staff |
|---|---|---|
| Device | Phone, one hand, often on the move | Laptop on the pass or a tablet, standing up |
| Goal | A table in under 3 minutes, no help | Know the room at a glance, act in one or two taps |
| Route | `/r/:venueId`, then `/b/:token` to manage | `/staff/:venueId` (signed in) |
| Design priority | Mobile first, one decision per screen | Laptop first, everything on one screen |

## 1. Diner journey (`/r/:venueId`)

A stepper at the top always shows where the diner is: Date and party, Time,
Table, Your details, Done. Finished steps get a tick, not only a colour. When
a step opens, focus moves to its heading so a screen reader says where we are.

1. **Date and party.** Date (today by default, past days blocked), party size
   (native select, "2 people", up to the restaurant's real limit `max_party`:
   the biggest party a table or allowed combination can seat under the covers
   cap; a restaurant with no bookable size says "Online booking is not open"), "Someone needs an accessible table", and high
   chairs. If the restaurant is closed that weekday or the date is a blackout
   date, the reason appears straight away ("Closed on Thursday 24 December:
   Christmas Eve") and the button stays disabled. No time is wasted on a day
   that cannot work.
2. **Time.** Times grouped by service (Lunch, Dinner). Each time says its
   status three ways: an icon (open circle, half circle, cross), a word
   ("Available", "Few tables left", "Full, join waitlist") and a colour. A
   full time is still a button: it opens the waitlist dialog, which asks for a
   name and email and answers with the queue position and an estimated wait.
   Times that have already passed today are left out ("Times that have
   already passed are not shown."): the server calls them full with reason
   "past", and offering a waitlist for them would be a false promise. When
   every time of the day has passed: "No times left today".
3. **Table.** The floor plan for that slot, drawn by the shared `SeatMap` in
   `tables` mode. Zones are labelled on the floor (Window, Terrace, Bar,
   Quiet). Each table shows one of five looks, each with its own glyph: free
   (open), yours (tick), being chosen by someone else (stripes), booked
   (cross), does not suit your party (hatched with a bar). Accessible tables
   carry the wheelchair badge. The optimiser's suggestion has a brass halo,
   and a card beside the map says why ("By the window", "Fits 4 exactly").
   "Choose for me" lets the optimiser pick. Tapping a table holds it: a
   countdown shows "Table 7 is held for you for 4:59". Holding another table
   gives the old one back (`DELETE /r/{vid}/hold/{hold_id}`) as soon as the
   new hold succeeds, and "Change time" gives it back too, so the diner never
   blocks two tables. The map speaks in table words: "Table 7, 2 to 4 people,
   held for you, accessible, recommended". The same choices exist as a plain
   list below the map, with badges for zone, size, "Accessible" and "High
   chair OK", for anyone who prefers a list.
4. **Your details.** Name, email, optional phone and notes. Each field checks
   itself when the diner leaves it; Confirm checks all of them and moves focus
   to the first problem. The countdown stays visible. If the hold ends, the
   diner goes back to the map with a message, and what they typed is kept.
5. **Done.** Always shows the booking summary and the manage link with a Copy
   button, whatever happens to email. It says that a confirmation email with
   a calendar invite is on its way, and that the link works even if the email
   never arrives.

Live updates: the map listens to `venue-{id}-{date}` through `useLive`
(server-sent events, or a poll every 2 seconds). A table someone else books
changes on screen within about 2 seconds. If a hold fails with 409, or a live
update shows our held table as booked, the diner sees "Sorry, that table is
gone. Table 7 was just taken by someone else." and up to three free tables
that fit, recommended first, each one a button.

## 2. Manage journey (`/b/:token`)

1. The page loads the booking and shows the same summary as the confirmation.
2. **Change:** party size (up to the restaurant's `max_party`, which only
   `GET /b/{token}` sends, so the page keeps it after a change) and time. The
   time list only contains times that can take the party (from the same
   `/slots` endpoint) plus the current time. "Save changes" is disabled until
   something changed.
3. **Cancel:** a dialog repeats the date, time and party and offers "Keep my
   booking" or "Yes, cancel it". After cancelling, the page shows the
   server's answer: the booking is cancelled, the table is free for someone
   else, and the summary says "Table: None, the booking is cancelled".
4. **Invalid link:** "This link does not work", with what to do next. A
   wrong and a revoked token look the same, as the security rules require.

## 3. Staff journey (`/staff/:venueId`)

Four tabs (Floor, Dashboard, Optimise, Schedule), keyboard operable with the
arrow keys. A date picker at the top switches the day for all tabs, and the
what-if and walk-in questions are asked about that day.

1. **Glance.** Big numbers per status: "6 Free, 3 Reserved, 5 Seated,
   2 Finishing". Below, the map and a table board: one tile per table with
   its number, its status in words and the same pattern as the map, and the
   party on it. Statuses use the shared glyphs: free (open), reserved
   (stripes), seated (solid with a cross), finishing (dotted square). A
   screen reader hears staff words: "Table 2, 2 to 4 people, reserved, Rui
   Costa, party of 2".
2. **Scrub time.** A slider over the day's services in 15-minute steps
   ("Floor at 20:15 (Dinner)") with a Now button. The floor reloads for that
   time without flashing a skeleton.
3. **Arrivals.** Bookings still to come, earliest first, with badges for
   accessibility, high chairs and notes.
4. **Act.** Tap a table or an arrival: the side panel shows who, when, needs,
   notes, and only the buttons that make sense now (Seat now, No-show,
   Finishing, Complete, Move or combine, Cancel booking). Cancel asks first.
5. **Move.** Drag an arrival onto a table on the map or onto a tile. The
   keyboard way: select the booking, press "Move or combine", tick one table
   (move) or several from the same group (combine). A live sentence says
   whether the choice works ("These tables seat 6; the party is 8.").
   A third way: select an arrival, tap a free table, press "Move Rui here".
6. **Walk-in.** "New walk-in" opens a dialog: party size, accessibility, high
   chairs, then "Find a table". The optimiser's best table appears with its
   reasons (party names and table labels, never database ids) and anything it
   would displace, and focus moves to that answer, so a second Enter cannot
   seat the party before anyone heard why. One tap on "Seat at Table 3" seats
   them. Closing the dialog forgets the suggestion.
7. **What if.** A card asks "What if a party of 6 walks in at 20:15?" and
   shows the best place and what it would displace. It is labelled as a
   preview: nothing changes.
8. **Dashboard.** Covers booked, covers really seated (seated, finishing or
   completed; also per service next to the utilisation), covers cancelled,
   no-show rate (with the number of
   bookings it is based on), utilisation by service as a native meter plus
   the number in text, and the overbooking card, badged "Suggestion only",
   with the explanation and a note that SeatPlan never overbooks by itself.
9. **Optimise.** Pick a service of the day. "Optimise tonight's tables"
   first previews: every move in words ("Ana Pereira, 4 people at 19:30: from
   Table 7 to Table 8"), what the plan gains ("2 empty chairs fewer"), and how
   many bookings stay put because the diner chose the table or the party is
   seated. "Apply these moves" writes exactly that preview; if the floor
   changed in between the server answers 409 and staff preview again. The
   "Exact check" card runs the quick planner and an exact search on the first
   bookings of the service and says the gap in one sentence ("The best
   possible plan seats 2 more guests: the quick planner is 10% short."), with
   both scores, the time each took, and whether the check was cut to the
   first bookings or hit its time limit.
10. **Schedule.** Services (day, opening, last slot, slot length in 15-minute
   blocks, covers per slot), turn times by party size, and closed days with a
   reason diners will see. All problems are listed before Save; "Undo my
   changes" restores the saved version.

## 4. Screen states

| Screen | Loading | Empty | Error | Success |
|---|---|---|---|---|
| Booking, restaurant | Skeleton "Loading the restaurant" | Unknown venue: "We cannot find this restaurant" | Error box with Try again | Step 1 |
| Step 1 | (no request) | Closed weekday or blackout date with its reason; button disabled | (no request) | "See free times" enabled |
| Booking, restaurant with no bookable size | (n/a) | "Online booking is not open" | (n/a) | (n/a) |
| Step 2 | Skeleton "Looking for free times" | "Closed that day" with reason; "No times on this day"; "No times left today" when every time has passed; all full: notice pointing to the waitlist | Error box with Try again | Grouped upcoming times |
| Waitlist dialog | Button spinner | (n/a) | Inline alert, form kept | Position and estimated wait |
| Step 3 | Skeleton "Loading the floor plan" | "No table for 4 people is free at 19:30 any more" | Error box with Try again; failed hold: inline alert (a 429 shows the server's words, e.g. "You are already holding tables for this date. Book or release one first.") | Countdown and "Continue with table 7" |
| Step 4 | Button spinner | (n/a) | Inline field errors; server problem as alert; hold lost: back to map with message | Confirmation |
| Step 5 | (n/a) | (n/a) | Clipboard blocked: link selected with instructions | "Link copied" |
| Manage | Skeleton "Loading your booking" | Cancelled booking; booking already started: "can no longer be changed online" | Invalid link; other errors with Try again; change or cancel failure says nothing changed | Toast after a change, notice after cancel |
| Staff floor | Skeleton "Loading the floor" | "No more arrivals expected for this day" | Sign-in prompt on 401/403; error box with Try again; failed action as a toast | Spoken and shown confirmation of each action |
| Dashboard | Skeleton | "No bookings yet" | Sign-in prompt or error box | Numbers |
| Optimise | Skeleton "Loading the services"; busy buttons while the optimiser runs | "No service on this day"; "Nothing to improve"; "No bookings in this service yet" | Sign-in prompt or error box; failed preview, apply (409 floor changed) or check as an alert, nothing changed | Moves listed, then "Done: 1 booking moved."; exact check in words |
| Schedule | Skeleton | (empty lists show only the Add buttons) | Sign-in prompt or error box; save failure keeps the draft | Toast "Schedule saved." |

## 5. Microcopy

| Where | Text | Why this wording |
|---|---|---|
| Step 1 heading | When, and how many? | A question, as a host would ask it |
| Party hint | Including children. For more than 8, please call the restaurant. | Prevents the most common miscount and gives a way out |
| Closed day | Closed that day. Casa Linho is closed on Mondays. Please pick another date. | Bold word first, then the reason, then the next step |
| Slot statuses | Available / Few tables left / Full, join waitlist | The full label already says what tapping does |
| Passed times | Times that have already passed are not shown. | Explains why the morning is missing |
| Cancelled table | None, the booking is cancelled | "No table yet" would promise a table that is not coming |
| Waitlist result | You are number 3 in the queue. Estimated wait: about 25 minutes. | Concrete numbers, "about" for an estimate |
| Suggestion card | Our suggestion: Table 7, with its reasons | Recommendations are explained, never only highlighted |
| Map key, unsuitable | Does not suit: too small, too big or missing a need | Says why, without blaming the diner |
| Hold | Table 7 is held for you for 4:59 (almost up) | The timer and the consequence in one line |
| Hold ended | Your hold on table 7 has ended. Pick a table again to continue. | Says what happened and what to do |
| Conflict | Sorry, that table is gone. Table 7 was just taken by someone else. These are still free and fit your party: | Apology, cause, and buttons for the way forward |
| Email error | This email looks incomplete. It should look like name@example.com. | Shows the expected shape instead of "invalid" |
| Phone error | Use digits only, for example +351 912 345 678. Or leave it empty. | Reminds that the field is optional |
| Hold lost at submit | Your hold on table 7 ended before we could book it. Your details are not lost: pick a table again. | Reassures first |
| Confirmation | You are booked, Ana | Personal and final |
| Email note | A confirmation email with a calendar invite is on its way to ana@example.com. ... It works even if the email never arrives. | Sets expectations and names the fallback |
| Copy fallback | Your browser blocked copying. The link is selected: press Ctrl+C (Cmd+C on a Mac) or long-press to copy it. | Never a dead end |
| Invalid manage link | This link does not work | Plain, no error code |
| Cancel dialog | Cancel this booking? / Keep my booking / Yes, cancel it | The safe choice is first and named for what it keeps |
| Staff sign-in | Please sign in to see the floor. The staff floor shows guests' names and notes, so it is only for signed-in staff. | Explains why, and returns to the floor after login |
| What-if card | Only a preview: nothing changes on the floor. | Staff dare to ask |
| Optimise preview | With this plan: 2 empty chairs fewer. These bookings would move: | The gain first, then who is affected |
| Exact check | The best possible plan seats 2 more guests: the quick planner is 10% short. | One sentence instead of three numbers to compare |
| Overbooking | Suggestion only. SeatPlan never overbooks by itself. | A person decides |
| Move check | These tables cannot be pushed together. Pick tables from the same group. | Says the rule, not just "invalid" |

## 6. Accessibility built in

- Every state has a shape, mark or word besides its colour: slot icons, map
  glyphs (shared with the legend through `SeatGlyph`), table board patterns,
  badges with text, the selected tab's thick underline.
- Keyboard: the map is one tab stop with arrow keys (shared component); every
  table on the map is also a button in a list; tabs use arrow keys; dialogs
  trap focus and return it; moving a booking has a dialog alternative to drag.
- Live regions: hold, conflict, one-minute warning, staff actions, copy result.
  The countdown is a `timer` that does not speak every second.
- Reduced motion: no animation of our own; the shared tokens switch the map's
  motion off.
- Touch targets: at least 44 px (shared tokens); the main buttons stick to the
  bottom of the phone screen on long steps.

## 7. Self-check against Nielsen's ten heuristics

| # | Heuristic | What we do | Honest gaps |
|---|---|---|---|
| 1 | Visibility of system status | Stepper, skeletons with words, hold countdown, live map, "Floor at 20:15", spoken confirmations | No "live" or "reconnecting" indicator; `useLive` returns its status but we do not show it yet |
| 2 | Match with the real world | Restaurant words: covers, turn times, walk-in, no-show; times in 24 h; "party of 4"; both maps name tables in their own words, never "seat" | The staff map still reads its own walk-in back as "Table 3 was just taken." (the shared map has no way to know staff caused it) |
| 3 | User control and freedom | Back on every step, details kept when going back, "Keep my booking", "Undo my changes" in the schedule; going back or picking another table gives the held table back | Closing the tab does not give the hold back (it expires after 5 minutes). No undo after a staff action or an applied optimiser plan |
| 4 | Consistency and standards | Shared Button, Field, Dialog, Stepper, Badge, SeatMap; one summary component for confirmation and manage | Two ways to hold the suggested table (card and list) share the same button name |
| 5 | Error prevention | Closed days caught in step 1, past times left out, full times lead to the waitlist, party sizes only up to what a table can seat (booking and manage page), only suitable tables are pickable, move check before Save, cancel confirmation, schedule problems listed before Save, optimiser moves previewed before applying | The staff walk-in and what-if lists stop at 12 people; the staff screens do not know the venue's limit |
| 6 | Recognition rather than recall | Summary of date, time and party on every step; map key next to the map; reasons next to suggestions | The staff scrubber does not mark where each service starts on the track |
| 7 | Flexibility and efficiency | "Choose for me", drag and drop, tap-to-move, keyboard dialog, Now button | No keyboard shortcuts for staff actions (for example S to seat) |
| 8 | Aesthetic and minimalist design | One decision per diner screen; unsuitable tables counted, not listed | The staff floor is dense on a small laptop; not tested below 1024 px wide |
| 9 | Help users recover from errors | Every error says what happened and what to do; conflicts come with alternatives; failed writes say nothing changed | Errors use the server's message when present, so wording depends on the backend |
| 10 | Help and documentation | Hints under fields, the map key, map help text for screen readers | No help page or first-time tour for staff |

## 8. What was verified, and what was not

Verified by the tests in `__tests__/` (vitest, API mocked at `fetch`): the
booking happy path to the confirmation with the copyable link; a full slot
leading to the waitlist with position and wait; a 409 conflict with
alternatives; a live update that marks our held table as booked; the blackout
reason in step 1; past times left out and the "No times left today" day;
the old hold released after a new pick and after "Change time"; the 429 hold
message; the party-size limit on the booking and manage pages and a venue with
no bookable size; table words on both maps; manage cancel behind the dialog
and the cancelled table text; manage change by PATCH; the invalid link; the
staff walk-in flow, its focus on the answer and the reset on close; the
what-if asked about the day on screen; covers seated on the dashboard; the
Optimise tab (preview, apply, nothing to improve, 409 after the floor
changed, exact check in words); the staff move dialog; the staff sign-in
prompt. Every response shape used was compared with the backend routers on
2026-11-10 (`routers/restaurants.py`, `bookings.py`, `staff.py`,
`restaurant_service/service_plan.py`, `dashboard.py`).

Not verified: the screens against the real backend (the routers were being
written at the same time), the "under 3 minutes" goal with real first-time
diners, drag and drop in a real browser (jsdom cannot run `elementFromPoint`),
screen-reader output on a real device, and the layout at real phone and laptop
sizes (no visual render was made in this task).
