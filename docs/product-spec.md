# SeatPlan product specification

Written on 2026-11-10 from the code in this repository. Every rule below
points at the file that does it, so it can be checked in a walkthrough.
Team: Sergio and Martim (restaurants), Simao and Federico (events).

Related documents: `docs/CONTRACT.md` (technical agreement),
`docs/decisions-log.md` (every change to it), `docs/personas.md`,
`docs/ux-events.md`, `docs/ux-restaurant.md`, `docs/accessibility.md`,
`docs/usability/` (test kit).

## 1. The problem

Choosing a seat is usually done for people, not by them.

- **At events** (weddings, conferences), an organiser builds a seating plan in
  a spreadsheet or on paper. Guests cannot see it, cannot say who they know,
  and every late change means redoing part of the plan by hand.
- **At restaurants**, a diner books "a table for 4 at 20:00" but cannot choose
  which table. Staff then juggle tables in their heads: who arrives when, which
  tables can be pushed together, where a walk-in can go without breaking a
  booking.

In both cases the same three things are missing: a shared live map, a way to
stop two people taking the same place, and help to fill the gaps sensibly.

## 2. Who it is for

| User | Vertical | Device we design for | Main screen (route, file) |
|---|---|---|---|
| Attendee (invited guest) | Events | Phone | `/e/:token`, `frontend/src/pages/events/AttendeePage.tsx` |
| Visitor with the shared link, then guest account holder | Events | Phone | `/j/:token`, `frontend/src/pages/join/`; `/my/...`, `frontend/src/pages/account/` |
| Organiser | Events | Laptop | `/organiser/:eventId`, `frontend/src/pages/events/OrganiserPage.tsx` |
| Diner | Restaurants | Phone | `/r/:venueId`, `frontend/src/pages/restaurant/BookingPage.tsx`, and `/b/:token`, `ManageBookingPage.tsx` |
| Staff (host, manager) | Restaurants | Laptop or tablet | `/staff/:venueId`, `frontend/src/pages/restaurant/StaffPage.tsx` |
| Organiser or staff | Both | Laptop | `/editor/:venueId`, `frontend/src/pages/editor/EditorPage.tsx` |

The personas in `docs/personas.md` describe one example person for each of the
first four rows. They are assumptions, not research results.

## 3. Scope

### 3.1 Shared core (both verticals)

| Feature | What it does | Where |
|---|---|---|
| Live 2D map | Hand-written SVG map with pan, zoom and keyboard use; seats or tables show their state with a shape and a mark, not only a colour | `frontend/src/seatmap/` |
| Holds | A seat or table is held for 5 minutes (`HOLD_MINUTES = 5`) before it is confirmed | `backend/app/core/holds.py` |
| No double booking | The database refuses a second claim with a UNIQUE constraint; the API answers 409 with a friendly message | `backend/app/models.py`, contract section 4 |
| Live updates | The page listens to a server-sent event stream and falls back to asking every 2 seconds | `backend/app/core/live.py`, `frontend/src/api/useLive.ts` |
| Optimiser | Recommends seats or tables with reasons, fills gaps, re-plans with few moves, and can compare with a proven best answer on small cases | `backend/app/optimiser/` |
| Email | Emails are queued in an outbox and sent later by a scheduled job, with a calendar invite | `backend/app/mail/` |
| Sign-in | Organiser and staff accounts with a signed session | `backend/app/security.py`, `frontend/src/pages/Login.tsx` |
| Floor-plan editor | Add, move and resize zones, tables and seats; undo and redo; warns about unsaved changes | `frontend/src/pages/editor/` |
| Design system | Shared colours, sizes, buttons, fields, dialogs and messages | `frontend/src/design/` |

### 3.2 Events vertical

Guests get a personal link. They reply, optionally say who they know, see who
sits where (names shortened or hidden according to the event's privacy mode)
and pick a seat. The organiser sees everything, places people, auto-fills the
rest, compares plans and prints place cards.

The organiser can also switch on one **shared link** per event. Anyone who
opens it is a visitor: they see the event and the live map, but cannot hold
or confirm. To choose a seat they create a **guest account** (name, email,
password, consent), proven by a 6-digit emailed code. An account holder gets
their seat by email with a picture of the room and their seat marked, and can
delete the account at any time. Design: `docs/guest-accounts.md`.

### 3.3 Restaurant vertical

Diners pick a date and party size, a time and a table (or let SeatPlan choose),
then give their details and get a manage link. Staff see a live floor, seat
walk-ins, move or combine tables, ask "what if", preview an optimised plan,
read a dashboard and edit the opening schedule.

## 4. User stories and acceptance criteria

Each criterion describes what the code does today. "Where" names the main file;
the test files listed are the ones that cover that area (not every criterion
has its own test).

### 4.1 Attendee (events)

**A1. As a guest, I want to open my invitation from a link, so that I do not
need an account.**
- Opening `/e/<token>` shows the event name, date and time, the venue and a
  progress bar.
- A wrong, old or revoked link shows "This link does not work". The server
  gives the same 404 for a wrong and a revoked token, so nobody can tell which.
- Where: `pages/events/AttendeePage.tsx`, `backend/app/routers/attendee.py`.
  Tests: `backend/tests/test_attendee_flow.py`,
  `frontend/src/pages/events/__tests__/AttendeePage.test.tsx`.

**A2. As a guest, I want to say whether I am coming.**
- "Yes, I will be there" and "No, I cannot come" save the reply.
- A guest who answered "no" must answer "yes" before holding a seat (409
  `conflict`).
- After the change deadline the reply cannot be changed (409
  `deadline_passed`).
- Where: `pages/events/WelcomeStep.tsx`, `backend/app/routers/attendee.py`.

**A3. As a guest, I want to say who I know, so that I am seated near them.**
- The step is optional ("Skip this step").
- Search only looks at the name this guest is allowed to see, never the real
  name (`GET /a/{token}/people?q=`).
- Guests who chose to stay anonymous are not listed; the page says how many
  were left out.
- Where: `pages/events/PeopleStep.tsx`, `backend/app/core/privacy.py`.
  Tests: `test_attendee_privacy.py`, `test_privacy.py`.

**A4. As a guest, I want suggested seats with reasons.**
- Up to a few cards, each with a rank and plain reasons ("Next to Maya R.").
- "Best match" appears only when someone the guest knows is really near.
- The API never sends a raw score, so the order cannot reveal who listed this
  guest.
- Where: `pages/events/RecommendationStrip.tsx`,
  `backend/app/optimiser/events_recommend.py`.

**A5. As a guest, I want to hold a seat, then confirm it.**
- Tapping a free seat (or "Hold this seat") holds it for 5 minutes and shows a
  countdown bar.
- Holding another seat drops the old hold (one live hold per guest).
- If someone else was faster, the page says so and offers the next best seat.
- If the 5 minutes run out, the page says so and offers "Hold it again".
- Seats the guest may not use (blocked, reserved for another tag, not
  accessible when they need it) are refused with 409 `conflict`.
- Where: `pages/events/SeatStep.tsx`, `HoldBar.tsx`,
  `backend/app/core/holds.py`. Tests: `test_holds.py`, `test_attendee_flow.py`.

**A6. As a guest, I want to change or release my seat later.**
- The done step offers "Change seat" and "Release my seat" (asks first).
- After the change deadline, hold, confirm and release are refused (409
  `deadline_passed`); privacy and "who I know" stay open.
- Where: `pages/events/DoneStep.tsx`, `events_service/`.

**A8. As someone who was sent the shared link, I want to see the event and
the map before I commit, so that I know where I could sit.** (built
2026-11-10)
- `/j/:token` shows the event, places left and the live map; names follow
  the privacy mode, as for attendees; seats reserved for a tag show as not
  available.
- Picking a free seat opens a panel that explains an account is needed; no
  request ever holds a seat (Playwright `guest-account.spec.ts`, step 1).
- A switched-off link says "This link is closed for now" with no map; a
  replaced link says "This link does not work".
- Where: `pages/join/JoinPage.tsx`, `routers/visitor.py`, `events_service/share.py`.

**A9. As a visitor, I want an account so that I can choose a seat and get it
by email with a picture of the room.** (built 2026-11-10)
- The form asks for name, email, password (at least 10 characters) and
  consent; the account exists only after the emailed code is typed, in the
  same browser; the guest then lands on their seat page.
- Places left never go below 0: never more guests than seats (also when
  someone says "yes" again after "no"), and never more than the organiser's
  cap.
- Confirming a seat, a single organiser move or an applied plan queues one
  email with the event, date, place, table and seat, the picture (inline PNG
  with alt text, no other guest's name), the calendar invite and a link to
  `/my/<event>` (Playwright step 4: one `seat_confirmed` row with
  `has_picture`).
- An address the organiser already invited is linked to that invitation only
  after its code is typed; it is never taken over by typing the address.
- Signing out and in brings the seat back; deleting the account frees the
  seat and wipes the emails we keep.
- Where: `pages/join/RegisterPage.tsx`, `pages/account/`,
  `events_service/accounts.py`, `mail/seat_picture.py`.

**A7. As a guest, I want to hide my name from other guests.**
- The anonymous switch shows "Guest" to others; the organiser still sees the
  real name.
- Where: `pages/events/AnonymousSwitch.tsx`, `backend/app/core/privacy.py`.

### 4.2 Organiser (events)

**O1. As an organiser, I want to see who has no seat yet.**
- The header shows how many guests are seated. The Guests tab opens first,
  with "Not seated yet" and "Did not choose themselves" filters.
- Where: `pages/events/OrganiserPage.tsx`, `GuestsTab.tsx`.

**O2. As an organiser, I want to add guests one by one or from a CSV file.**
- A personal link is shown once, with "Copy link".
- CSV import is all or nothing; bad rows are listed by line. Limit: 200 KB and
  1000 rows (decisions log, events vertical API, item 1).
- Where: `AddGuestForm.tsx`, `ImportCsv.tsx`, `backend/app/routers/events.py`.
  Tests: `frontend/src/pages/events/__tests__/csv.test.ts`,
  `test_events_organiser.py`.

**O3. As an organiser, I want to place or move a guest myself.**
- "Place", then choose a seat; drag and drop also works with a mouse.
- The organiser is not bound by the change deadline.
- Where: `OrganiserMap.tsx`, `GuestRow.tsx`.

**O4. As an organiser, I want to auto-fill the empty seats.**
- "Preview auto-fill" shows a plan that is not applied yet; "Apply this plan"
  or "Discard".
- Guests' own choices and organiser moves are never changed by the plan.
- Hard rules are never broken: one guest per seat, blocked seats unused,
  reserved seats only for the right tag, accessible seats for guests who need
  them.
- Where: `OptimiseTab.tsx`, `backend/app/optimiser/events_anneal.py`,
  `events_model.py`. Tests: `test_optimiser_events_rules.py`,
  `test_optimiser_events_properties.py`, `test_events_plans.py`.

**O5. As an organiser, I want to re-plan with as few moves as possible, compare
plans, and undo.**
- "Preview re-plan" adds a penalty for each guest moved.
- "Compare plans" shows two scenarios side by side. Undo and Redo never undo a
  guest's own choice.
- Where: `ScenarioCompare.tsx`, `backend/app/optimiser/events_replan.py`.

**O6. As an organiser, I want to see what a move would do before I make it.**
- The what-if card shows Now, After and Change for each score term, and any
  rule the move would break.
- Where: `WhatIfCard.tsx`, `POST /events/{eid}/whatif`.

**O7. As an organiser, I want to know how good the plan is.**
- Exact check on one or two tables (at most 16 seats) compares our plan with
  the proven best; the gap in % appears only when both seat the same number of
  guests.
- Where: `ExactCheckCard.tsx`, `backend/app/optimiser/events_exact.py`.
  Tests: `test_optimiser_events_exact.py`.

**O8. As an organiser, I want to set privacy and a deadline.**
- Three privacy modes (full name, first name and last initial, anonymous) with
  a preview table; a deadline or "No deadline".
- Where: `SettingsTab.tsx`, `format.ts` (preview only), `core/privacy.py`.

**O9. As an organiser, I want to print the plan and place cards.**
- Print tab with a seating chart by table and place cards.
- Where: `PrintTab.tsx`, `GET /events/{eid}/chart`.

**O10. As an organiser, I want to erase a guest's personal data.**
- "Delete data" asks first and cannot be undone. Name, email, seat and link are
  removed; an empty "Deleted guest" row stays so old plans still make sense.
- "New link" asks first and stops the old link at once.
- Where: `GuestRow.tsx`, decisions log, events vertical API, item 11.

**O11. As an organiser, I want one link I can post anywhere, so that people
I did not invite one by one can join.** (built 2026-11-10)
- Settings tab, "Shared link": "Allow people to join with the shared link"
  (off for existing events, on for the demo events), "Copy link", "Make a new
  link" (asks first; the old link stops at once), an optional limit, and the
  line "{joined} joined with the link. {places left} ({guests} guests for
  {capacity} seats)."
- The guest list marks people who joined with the link ("Joined with link")
  and people with an account ("Has an account"); removing one also stops that
  account from joining again with the link.
- Where: `ShareLinkCard.tsx`, `GuestRow.tsx`, `GET|PATCH /events/{eid}/share`.

### 4.3 Diner (restaurants)

**D1. As a diner, I want to know straight away if the restaurant is closed on
my date.**
- Step 1 shows the reason for a closed weekday or a blackout date, and the
  button stays disabled.
- Party size goes up to the restaurant's `max_party` (largest table or allowed
  combination under the covers cap, at most 30).
- Where: `pages/restaurant/StepParty.tsx`. Tests:
  `frontend/src/pages/restaurant/__tests__/booking.test.tsx`,
  `test_restaurant_slots.py`.

**D2. As a diner, I want to see which times are free.**
- Times are grouped by service; each says "Available", "Few tables left" or
  "Full, join waitlist" with an icon and a colour.
- Times that already passed today are not shown.
- A full time opens the waitlist dialog, which answers with a position and an
  estimated wait.
- Where: `StepTime.tsx`, `SlotButton.tsx`, `WaitlistDialog.tsx`.

**D3. As a diner, I want to choose my table on the map, or let SeatPlan
choose.**
- Tapping a table holds it for 5 minutes. Holding another one, or "Change
  time", gives the old one back.
- "Choose for me" lets the optimiser pick; the suggestion comes with reasons.
- Tables that do not suit the party are shown as "does not suit".
- One client can hold at most 3 tables for a date, and live holds can never
  block more than half the tables of a slot (both 429).
- If someone else was faster, the page offers up to three free tables that fit.
- Where: `StepTable.tsx`, `SelectionPanel.tsx`,
  `backend/app/restaurant_service/`. Tests: `test_restaurant_booking_flow.py`.

**D4. As a diner, I want to give my details and get a confirmation I can keep.**
- Name and email are required; phone and notes are optional; each field checks
  itself when left.
- If the hold ends before booking, the diner goes back to the map and what
  they typed is kept.
- The confirmation always shows the manage link with a Copy button, even if
  the email never arrives.
- Where: `StepDetails.tsx`, `Confirmation.tsx`, `CopyLink.tsx`.

**D5. As a diner, I want to change or cancel my booking from the link.**
- `/b/<token>` shows the booking. Party size and time can be changed; "Save
  changes" stays disabled until something changed.
- Cancel asks first ("Keep my booking" or "Yes, cancel it").
- Where: `ManageBookingPage.tsx`, `ChangeBookingForm.tsx`,
  `BookingActions.tsx`. Tests: `test_bookings_manage.py`,
  `frontend/src/pages/restaurant/__tests__/manage.test.tsx`.

### 4.4 Staff (restaurants)

**S1. As staff, I want to see the floor at a glance.**
- Counts per status (free, reserved, seated, finishing), the map and a table
  board with words and patterns.
- A time slider in 15-minute steps with a Now button.
- The page asks to sign in when there is no session.
- Where: `StaffFloor.tsx`, `TimeScrubber.tsx`, `SignInPrompt.tsx`.

**S2. As staff, I want to seat a walk-in quickly.**
- "New walk-in" asks for party size and needs, shows the best table with
  reasons and anything it would displace, then "Seat at Table N".
- Where: `WalkinDialog.tsx`, `POST /staff/{vid}/walkins`.
  Tests: `test_staff_endpoints.py`,
  `frontend/src/pages/restaurant/__tests__/staff.test.tsx`.

**S3. As staff, I want to update a booking's status and move or combine
tables.**
- Only the buttons that make sense now are shown (Seat now, No-show,
  Finishing, Complete, Move or combine, Cancel booking).
- Combining only works for tables in the same combine group; a sentence says
  whether the choice fits.
- Where: `TablePanels.tsx`, `MoveDialog.tsx`.

**S4. As staff, I want to ask "what if a party of N walks in?" without changing
anything.**
- The card is labelled as a preview. Party sizes in this list go from 1 to 12
  (`PARTY_CHOICES` in `WhatIf.tsx`).
- Where: `WhatIf.tsx`.

**S5. As staff, I want to improve tonight's table plan.**
- The Optimise tab previews each move in words; "Apply these moves" writes
  exactly that preview, or answers 409 if the floor changed in between.
- Only bookings where the diner let SeatPlan choose (`auto`) can move.
- The exact check works on the first bookings of a service (8 by default, at
  most 12).
- Where: `StaffOptimise.tsx`, `ServicePlanCard.tsx`, `ExactCheckCard.tsx`.
  Tests: `test_staff_optimise.py`.

**S6. As a manager, I want a dashboard and a schedule editor.**
- Dashboard: covers booked and seated, utilisation per service, no-show rate
  with the number of bookings behind it, and an overbooking suggestion that is
  marked "Suggestion only".
- Schedule: services, turn times and closed days; problems are listed before
  Save; "Undo my changes".
- Where: `StaffDashboard.tsx`, `StaffSchedule.tsx`.

## 5. Out of scope

- Payments, deposits and no-show fees.
- More than one language. The interface is in English only (`lang="en"` in
  `frontend/index.html`); dates are written in British English
  (`"en-GB"`) and times on a 24-hour clock, in the browser's time zone.
- Native phone apps and push notifications. SMS.
- Many separate businesses on one install: this is a single-tenant demo, and
  staff see every venue (decisions log, backend foundation, item 10).
- A stay that crosses midnight (decisions log, restaurants vertical API,
  item 9).
- Overbooking done by the system. It only suggests.
- Database migrations for changed columns: there is no migration tool
  (`README.md`, Deploying to Vercel).

## 6. Not done yet

- A real Vercel deployment: not done yet.
- Real email sending through Resend: not done yet (the console provider is
  used locally).
- Usability sessions with real people: not done yet. The kit is in
  `docs/usability/`; the results file is an empty template.
- Testing with screen readers and on real touch devices: not done yet.
- The "under 3 minutes" goals in the UX notes are design targets, not measured
  results.
- Presentation date: not set in this document.
