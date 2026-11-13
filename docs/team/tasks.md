# Who owns what

Team: Sergio and Martim (restaurants), Simao and Federico (events).

Restaurant integration update, 2026-11-13: `claude/ambiente` was merged locally
into `martim/restaurantes-impl` at 31cc829. Claude's implemented work and decisions
are in [his notes](../claude-ambiente-notas.md). Codex added final browser/performance
checks and reviewed the integration against the approved spec. Task 38 is only
partly verified: tasks 25/26/29 (discovery and the public page) are absent.
Tasks 33/34/36 (chair management and email/demo integration) also remain pending;
20 and 32 have remaining UI details. Do not present the whole platform as done.
The [acceptance matrix](../restaurant-final-review.md) is the handoff list.
No push, PR, deployment or merge into main was performed; Martim integrates.

The rule is simple: **each person owns a slice from the button on the screen
down to the row in the database**, plus one piece of the shared core. In the
walkthrough you must be able to open any file in your list, say what it is for,
and follow one request through it.

## How the split was made fair

Each vertical has two sides, and each side has a backend and a frontend:

| Vertical | Side A | Side B |
|---|---|---|
| Events | Attendee (Simao) | Organiser and events optimiser (Federico) |
| Restaurants | Diner (Sergio) | Staff and restaurant optimiser (Martim) |

The shared core (database, holds, live updates, email, seat map, design
system, editor, deploy files) is split so that everybody also owns one
"platform" piece.

Size of each list, counted on 2026-11-10 with a small Python script that
counts lines in the `.py`, `.ts` and `.tsx` files below (tests and CSS not
included):

| Person | Files | Lines of source |
|---|---|---|
| Simao | 67 | 6085 |
| Federico | 38 | 5378 |
| Sergio | 49 | 5896 |
| Martim | 46 | 6298 |

Simao has more files because the design components are many small files.
Other people may still edit files today, so these numbers can move a little.

## Everyone must know (shared, examiners ask anyone)

Study these first, in this order, before your own list:

1. `README.md` (what the app does, how to run it) and `docs/CONTRACT.md`
   sections 1, 4 and 6.
2. `backend/app/models.py`: the four UNIQUE rules. `Hold` (lines 161 to 180),
   `SeatAssignment` (lines 290 to 304), `PlanSnapshot` (line 310) and
   `TableSlot` (lines 378 to 388).
3. `backend/app/core/holds.py` (124 lines): `take_hold`, `confirm_hold`,
   `commit_or_seat_taken`. This is the heart of "no double booking".
4. The idea of the optimisers: `random.Random(seed)`, the iteration budget as
   the stopping rule, and "human choices are never moved"
   (`docs/CONTRACT.md` section 6).
5. How to run the app and the tests locally (`docs/team/demo-script.md`,
   backup plan).

## Simao (events: attendee side, live updates, email, platform)

**Backend**

- `backend/app/routers/attendee.py` (personal-link endpoints `/a/{token}`)
- `backend/app/events_service/seating.py` (hold, confirm, release a seat)
- `backend/app/events_service/recommend.py` (seat suggestions with reasons, privacy rule)
- `backend/app/events_service/seatmap.py` (seat states for the attendee map)
- `backend/app/events_service/access.py` (token lookup, deadline)
- `backend/app/events_service/mailer.py` (seat emails and reminders for events)
- `backend/app/core/holds.py`, `core/live.py`, `core/privacy.py`, `core/audit.py`
- `backend/app/core/layout.py`, `core/neighbours.py`, `routers/venues.py` (floor-plan save, "who sits next to whom")
- `backend/app/mail/` (all files) and `backend/app/routers/emails.py`
- `backend/app/main.py`, `backend/app/config.py`, `api/index.py`, `vercel.json`

**Frontend**

- `frontend/src/api/useLive.ts` (stream first, polling every 2 s as fallback)
- `frontend/src/pages/events/`: `AttendeePage.tsx`, `WelcomeStep.tsx`,
  `PeopleStep.tsx`, `SeatStep.tsx`, `HoldBar.tsx`, `DoneStep.tsx`,
  `SeatNotice.tsx`, `RecommendationStrip.tsx`, `AnonymousSwitch.tsx`,
  `AttendeeStates.tsx`, `StepTitle.tsx`, `EventHeader.tsx`, `useAttendee.ts`,
  `useAttendeeData.ts`, `useCountdown.ts`, `attendeeRules.ts`,
  `friendSeats.ts`, `seatPick.ts`
- `frontend/src/pages/editor/` (floor-plan editor)
- `frontend/src/design/components/`, `frontend/src/App.tsx`,
  `frontend/src/main.tsx`, `frontend/src/pages/NotFound.tsx`

**Your tests:** `test_holds.py`, `test_attendee_flow.py`,
`test_attendee_privacy.py`, `test_privacy.py`, `test_demo_live.py`,
`test_mail_*.py`, `test_outbox.py`, `test_main.py`, `test_config.py`,
`test_venues.py`, `test_neighbours.py`; frontend `api/useLive.test.tsx`,
`pages/events/__tests__/AttendeePage.test.tsx`, `rules.test.ts`,
`pages/editor/*.test.tsx`, `design/components/components.test.tsx`.

**Study first:** `core/holds.py` whole file, then `seating.py` lines 30 to 134
(lock, hold, confirm), then `core/live.py` lines 56 to 126 and `useLive.ts`.
Then `core/privacy.py` and `recommend.py` lines 29 to 66.

## Federico (events: organiser side, events optimiser)

**Backend**

- `backend/app/routers/events.py` (organiser endpoints)
- `backend/app/events_service/plans.py` (scenarios, apply, undo and redo)
- `backend/app/events_service/optimise.py` (auto-fill, re-plan, what-if, compare)
- `backend/app/events_service/problem.py` (database rows to optimiser dataclasses)
- `backend/app/events_service/guests.py`, `csv_io.py`, `exact_check.py`, `chart.py`, `schemas.py`
- `backend/app/optimiser/events_model.py`, `events_score.py`,
  `events_greedy.py`, `events_anneal.py`, `events_replan.py`,
  `events_recommend.py`, `events_exact.py`
- `backend/app/seed/demo_events.py`, `backend/scripts/gap_report_events.py`

**Frontend**

- `frontend/src/api/events.ts`
- `frontend/src/pages/events/`: `OrganiserPage.tsx`, `GuestsTab.tsx`,
  `GuestRow.tsx`, `AddGuestForm.tsx`, `ImportCsv.tsx`, `OptimiseTab.tsx`,
  `ScenarioPreview.tsx`, `ScenarioCompare.tsx`, `ScoreTable.tsx`,
  `WhatIfCard.tsx`, `ExactCheckCard.tsx`, `SettingsTab.tsx`, `PrintTab.tsx`,
  `OrganiserMap.tsx`, `Tabs.tsx`, `useOrganiser.ts`, `planPreview.ts`,
  `format.ts`, `browserHelpers.ts`

**Your tests:** `test_events_organiser.py`, `test_events_plans.py`,
`test_events_setup.py`, `test_events_seed.py`, `test_optimiser_events_*.py`
(four files); frontend `pages/events/__tests__/OrganiserPage.test.tsx`,
`csv.test.ts`.

**Study first:** `docs/optimiser-events.md`, then `events_score.py` (the
objective, all of it), `events_greedy.py`, `events_anneal.py` lines 77 to 212.
Then `plans.py` `apply_plan` (lines 167 to 200) and `problem.py` `human_fixed`
(lines 63 to 70).

## Sergio (restaurants: diner side, database and security)

**Backend**

- `backend/app/routers/restaurants.py` (public diner endpoints `/r/{vid}`)
- `backend/app/routers/bookings.py` (manage link `/b/{token}`, waitlist)
- `backend/app/restaurant_service/`: `diner_flow.py`, `holding.py`,
  `availability.py`, `booking_rows.py`, `schedule.py`, `clock.py`,
  `occupancy.py`, `alternatives.py`, `manage_flow.py`, `waitlist.py`,
  `emails.py`, `map_view.py`, `changes.py`, `venue_access.py`
- `backend/app/models.py`, `backend/app/db.py`, `backend/app/security.py`
- `backend/app/routers/auth.py`, `routers/health.py`, `core/errors.py`, `core/text.py`

**Frontend**

- `frontend/src/api/restaurant.ts`, `api/client.ts`, `api/types.ts`
- `frontend/src/pages/Login.tsx`
- `frontend/src/pages/restaurant/`: `BookingPage.tsx`, `StepParty.tsx`,
  `StepTime.tsx`, `StepTable.tsx`, `TablePanels.tsx`, `SlotButton.tsx`,
  `StepDetails.tsx`, `StepHeading.tsx`, `HoldCountdown.tsx`,
  `Confirmation.tsx`, `CopyLink.tsx`, `ManageBookingPage.tsx`,
  `BookingSummary.tsx`, `ChangeBookingForm.tsx`, `WaitlistDialog.tsx`,
  `MapKey.tsx`, `SignInPrompt.tsx`, `useBookingFlow.ts`, `useLoad.ts`,
  `validation.ts`, `tableView.ts`, `format.ts`

**Your tests:** `test_restaurant_booking_flow.py`, `test_restaurant_slots.py`,
`test_restaurant_helpers.py`, `test_bookings_manage.py`, `test_models.py`,
`test_security.py`, `test_health_auth.py`; frontend `api/restaurant.test.ts`,
`pages/restaurant/__tests__/booking.test.tsx`, `manage.test.tsx`.

**Study first:** `models.py` (all tables, especially `TableSlot`), then
`holding.py` (whole file), `diner_flow.py` (whole file),
`availability.py` lines 81 to 118 (covers cap and its lock). Then
`security.py` (passwords, tokens, sessions, rate limit).

## Martim (restaurants: staff side, restaurant optimiser, seat map, CI)

**Backend**

- `backend/app/routers/staff.py`
- `backend/app/restaurant_service/`: `staff_floor.py`, `dashboard.py`,
  `whatif.py`, `service_plan.py`, `schedule_edit.py`
- `backend/app/optimiser/restaurant_model.py`, `restaurant_assign.py`,
  `restaurant_exact.py`
- `backend/app/seed/demo_restaurant.py`, `seed/run.py`, `seed/migrate.py`,
  `backend/app/routers/demo.py`, `backend/scripts/gap_report_restaurant.py`

**Frontend**

- `frontend/src/pages/restaurant/`: `StaffPage.tsx`, `StaffFloor.tsx`,
  `FloorLists.tsx`, `BookingActions.tsx`, `MoveDialog.tsx`,
  `WalkinDialog.tsx`, `WhatIf.tsx`, `StaffDashboard.tsx`,
  `StaffOptimise.tsx`, `ServicePlanCard.tsx`, `ExactCheckCard.tsx`,
  `StaffSchedule.tsx`, `scheduleRules.ts`, `staffStatus.ts`,
  `TimeScrubber.tsx`, `SelectionPanel.tsx`
- `frontend/src/seatmap/` (the shared SVG map: pan, zoom, keyboard)
- `frontend/src/pages/Home.tsx`, `demoLinks.ts`, `homeSample.ts`
- `.github/workflows/ci.yml`, `.github/workflows/email-cron.yml`

**Your tests:** `test_staff_endpoints.py`, `test_staff_optimise.py`,
`test_restaurant_seed.py`, `test_optimiser_restaurant_*.py` (four files),
`test_e2e_slice.py`; frontend `pages/restaurant/__tests__/staff.test.tsx`,
`seatmap/SeatMap.test.tsx`, `seatmap/geometry.test.ts`,
`pages/Home.test.tsx`.

**Study first:** `docs/optimiser-restaurant.md`, then `restaurant_model.py`
(`ScoreBreakdown.key` lines 77 to 84, `candidate_choices` lines 196 to 206,
`Floor` lines 234 to 290), then `restaurant_assign.py` lines 88 to 105 and
151 to 309. Then `staff_floor.py` `seat_walkin` and `service_plan.py`
`propose` and `apply_proposal`.

## Pairs for practice

- Simao and Federico quiz each other on events; Sergio and Martim on
  restaurants. Each pair must be able to cover for the other side if one
  person is ill on the day.
- Then swap across verticals once: Simao explains holds to Sergio (both use
  `core/holds.py`), Federico explains annealing to Martim, Martim explains the
  lexicographic score to Federico.

## Before the presentation (everyone)

- [ ] Read your list once from top to bottom.
- [ ] Answer your 12 questions in `docs/team/walkthrough-qa.md` out loud,
      without reading.
- [ ] Run the tests for your files and say what one of them proves.
- [ ] Rehearse your part of `docs/team/demo-script.md` twice, once with the
      backup plan.
- [ ] Read `docs/team/ai-use.md` and do the "own it" tasks for your list.

## The restaurant platform (2026-11-13): who owns the new pieces

Split from section 13 of the platform spec. Because the work was finished in one branch (`claude/ambiente`), Sergio's tasks (19, 25, 26, 29 and
the parts of 34 and 36 about discovery and demo data) are in their own commits so they can be reviewed or swapped alone.

| Person | New pieces |
|---|---|
| Martim | Room editor (`pages/room-editor/`), ambience engine (`backend/app/ambience/`), `ambience_view.py`, map with rooms (`map_view.py`, `seatmap/RoomLayers.tsx`), light cursor, optimiser wishes, chair choice and change (`chosen_seat.py`, `ChooseSeat.tsx`, `ChangeSeat.tsx`), mini-map (`mail/restaurant_picture.py`) |
| Sergio | Owner accounts and list, wizard, profile, photos, hours and publish (`pages/owner/`, `publishing.py`), discovery (`discovery.py`, `pages/discover/`), public page (`pages/restaurant-public/`), restaurant emails (`mail/restaurant_templates.py`, `email_facts.py`), demo restaurants (`seed/demo_showcase.py`, `demo_photos.py`) |
