# Personas

Four example people, one for each main screen of SeatPlan.

**Important:** these are assumption personas. They were written by the team
from what we expect, not from interviews or usability sessions (none have
been run yet, see `docs/usability/`). Names, jobs and details are invented.
After real sessions, update or replace them.

The demo data in `backend/app/seed/` gives each persona a real place to try
the app: the wedding "Ana and Bruno's wedding" and the conference "Lisbon
Data Summit" (`demo_events.py`), and the restaurant "Casa Lumen"
(`demo_restaurant.py`). The home page lists the demo links when
`DEMO_MODE=1`.

## 1. Rita, the wedding guest (attendee, events)

| | |
|---|---|
| Age, job | 34, primary school teacher |
| Device | Phone, often one hand, on the bus |
| Screen | `/e/:token`, `frontend/src/pages/events/AttendeePage.tsx` |
| Demo place | "Ana and Bruno's wedding", privacy mode "first name and last initial" |

**Goal.** Sit next to her cousin and two old university friends, without
calling the bride.

**Frustrations.** Long forms. Creating an account for one evening. Not
knowing who will see her choices.

**What SeatPlan does for her.**
- No account: her personal link is enough (`WelcomeStep.tsx`).
- "People you know" is optional and says "nobody else sees your list"
  (`PeopleStep.tsx`).
- Recommendation cards explain why a seat is good (`RecommendationStrip.tsx`).
- A big hold bar with a countdown at the bottom of the phone screen
  (`HoldBar.tsx`).
- "You are all set" and the seat label in large type (`DoneStep.tsx`).

**Risk to test.** Does she understand that tapping a seat only holds it, and
that she still has to press "Confirm this seat"?

## 2. Joana, the wedding planner (organiser, events)

| | |
|---|---|
| Age, job | 41, runs a small events business |
| Device | Laptop at her desk; sometimes her phone on site |
| Screen | `/organiser/:eventId`, `frontend/src/pages/events/OrganiserPage.tsx` |
| Demo place | "Ana and Bruno's wedding" or "Lisbon Data Summit" (signed in as `organiser@example.com`) |

**Goal.** A complete, sensible seating plan a week before the event, with
the fewest possible last-minute moves.

**Frustrations.** Guests who never answer. Redoing the plan in a spreadsheet
after one change. Printing place cards by hand.

**What SeatPlan does for her.**
- "Not seated yet" filter on the Guests tab (`GuestsTab.tsx`).
- "Preview auto-fill" that never moves guests who chose their own seat
  (`OptimiseTab.tsx`).
- "Preview re-plan", "Compare plans", Undo and Redo.
- The what-if card before a risky move (`WhatIfCard.tsx`).
- The Print tab for the chart and place cards (`PrintTab.tsx`).
- CSV import with a line-by-line error list (`ImportCsv.tsx`).

**Risk to test.** Does she understand that a preview is not applied until she
presses "Apply this plan"? Does she trust the score?

## 3. Tiago, the diner (restaurants)

| | |
|---|---|
| Age, job | 27, junior accountant |
| Device | Phone, booking a table for Friday night |
| Screens | `/r/:venueId` (`BookingPage.tsx`) and `/b/:token` (`ManageBookingPage.tsx`) |
| Demo place | "Casa Lumen" |

**Goal.** A table by the window for 4 people at about 20:00, in under three
minutes.

**Frustrations.** Booking a time and then getting the table near the toilets.
Phoning. Losing the confirmation email.

**What SeatPlan does for him.**
- A closed day is shown before he picks a time (`StepParty.tsx`).
- Each time says "Available", "Few tables left" or "Full, join waitlist"
  (`SlotButton.tsx`).
- The floor plan with zones such as Window, plus "Choose for me"
  (`StepTable.tsx`).
- The manage link on the confirmation page with a Copy button, in case the
  email never comes (`Confirmation.tsx`, `CopyLink.tsx`).
- Change party size or time, or cancel, from the link
  (`ChangeBookingForm.tsx`, `BookingActions.tsx`).

**Risk to test.** Does he notice the 5-minute hold while typing his details?
Does he find the waitlist when the time he wants is full?

## 4. Marta, the restaurant host (staff, restaurants)

| | |
|---|---|
| Age, job | 38, front-of-house manager |
| Device | Tablet or laptop on the pass, standing, often interrupted |
| Screen | `/staff/:venueId`, `frontend/src/pages/restaurant/StaffPage.tsx` |
| Demo place | "Casa Lumen" (signed in as `staff@example.com`) |

**Goal.** Know at a glance which tables are free, seat walk-ins without
upsetting bookings, and keep the evening moving.

**Frustrations.** A paper book that is out of date. Guessing whether two
tables can be pushed together. Software that needs many clicks during a rush.

**What SeatPlan does for her.**
- Status counts and a table board with words and patterns (`StaffFloor.tsx`,
  `FloorLists.tsx`).
- "New walk-in": best table with reasons and what it would displace
  (`WalkinDialog.tsx`).
- Status buttons that match the moment (`TablePanels.tsx`) and the move or
  combine dialog (`MoveDialog.tsx`).
- The what-if card, labelled "Only a preview" (`WhatIf.tsx`).
- Dashboard and schedule tabs (`StaffDashboard.tsx`, `StaffSchedule.tsx`).

**Risk to test.** Can she seat a walk-in in two or three taps? Is the floor
readable on a smaller laptop? (The UX notes say it was not tested below
1024 px wide.)

## How the personas are used

- Each task in `docs/usability/script.md` belongs to one persona.
- When recruiting testers, aim for people who match the device and the goal,
  not the exact age or job.
