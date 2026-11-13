# Restaurant screens: READ ME FIRST

## Purpose

Three screens of the restaurant vertical:

- `/r/:venueId` (`BookingPage.tsx`): a diner books a table in five steps
  (date and party, time, table, details, done). Phone first.
- `/b/:token` (`ManageBookingPage.tsx`): the link from the confirmation, to
  change the time or party size, or cancel.
- `/staff/:venueId` (`StaffPage.tsx`): signed-in staff run the service. Four
  tabs: Floor, Dashboard, Optimise, Schedule. Laptop first.

The journeys, every screen state, the microcopy and an honest usability
self-check are in `docs/ux-restaurant.md`.

## Key files

| File | Job |
|---|---|
| `api/restaurant.ts` (in `src/api`) | Typed calls for every restaurant endpoint. "Server..." types copy the backend; small "to..." functions turn them into screen shapes |
| `useBookingFlow.ts` | The diner's answers so far and the current step; gives a hold back (`releaseQuietly`) when the diner goes back |
| `StepParty.tsx`, `StepTime.tsx`, `StepTable.tsx`, `StepDetails.tsx`, `Confirmation.tsx` | The five booking steps |
| `RoomTabs.tsx`, `LightCursor.tsx`, `useLightCursor.ts`, `ambienceView.ts` | The table step with rooms (spec 9.3): a tab per room with its free tables; the ambience card in `TablePanels.tsx` for the table under the pointer, else the held one, else our suggestion (only when its ambience is known); and the light cursor over the stay, which asks `GET /r/{vid}/ambience` 250 ms after the last move and repaints only sun, night and sentences, never the tables, holds or live updates. `ambienceView.ts` is the pure part (tabs, steps, merging the answer) |
| `tableView.ts` | Pure rules for the diner map: the state each table shows, its spoken name, alternatives after a conflict |
| `ChangeBookingForm.tsx`, `BookingSummary.tsx` | The manage page's form and the summary shared with the confirmation |
| `StaffFloor.tsx`, `FloorLists.tsx`, `SelectionPanel.tsx`, `MoveDialog.tsx`, `WalkinDialog.tsx`, `WhatIf.tsx` | The live floor and its actions |
| `staffStatus.ts` | Pure rules for the staff floor: status looks, spoken table names, which actions fit a status |
| `StaffDashboard.tsx`, `StaffSchedule.tsx` | The day's numbers and the opening hours editor |
| `StaffOptimise.tsx`, `ServicePlanCard.tsx`, `ExactCheckCard.tsx` | The Optimise tab: re-plan one service (preview, then apply) and the exact check |
| `useLoad.ts`, `format.ts` | Loading, error and ready states in one hook; small pure text helpers |

## Data flow

```
GET /r/{vid}/slots --> StepTime (times that have passed are left out)
GET /r/{vid}/map   --> StepTable --> SeatMap (mode "tables", describe = table words)
tap a table        --> POST /r/{vid}/hold   --> 5-minute countdown
   another table   --> new hold first, then DELETE /r/{vid}/hold/{old id}
   "Change time"   --> DELETE /r/{vid}/hold/{id}, back to step 2
live version bump  --> useLive --> map fetched again within about 2 s
```

## Three likely walkthrough questions

**1. What stops two diners from getting the same table?** Not the browser. A
hold writes rows that a UNIQUE constraint protects; the slower diner gets 409
and the page offers up to three other free tables that fit.

**2. Why give a hold back instead of letting it expire?** A hold blocks the
table for everyone else for 5 minutes, and the server allows only a few live
holds per diner. Releasing it at once keeps the table bookable and keeps the
diner under that limit.

**3. How does staff know the optimiser will not move a guest who chose a
table?** The server never moves a diner's own choice or a seated party; the
Optimise tab says so, shows every move before anything changes, and applies
only the exact plan that was shown (the `plan_id`).
