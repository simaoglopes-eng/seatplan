# Events screens: READ ME FIRST

## Purpose

Two screens of the events vertical:

- `/e/:token` (`AttendeePage.tsx`): an invited guest replies, says who they
  know, picks a seat on the live map and confirms it. Mobile first.
- `/organiser/:eventId` (`OrganiserPage.tsx`): the organiser sees the whole
  map with real names, manages guests, runs the optimiser, sets privacy, the
  deadline and the shared link, and prints. Laptop first.

The attendee journey is also used by guest accounts (`/my/:eventId`, in
`pages/account/`): `useAttendee` takes an `AttendeeApi` (`attendeeApi.ts`),
either `linkApi(token)` for `/a/{token}` or `accountApi(eventId)` for
`/guest/events/{eid}`. The shared link itself lives in `pages/join/`.

The journeys, every screen state, the microcopy and an honest usability
self-check are in `docs/ux-events.md`.

## Key files

| File | Job |
|---|---|
| `api/events.ts` (one folder up, in `src/api`) | Typed calls for every events endpoint; shapes copy the backend routers |
| `attendeeApi.ts` | `AttendeeApi`: the nine attendee calls. `linkApi(token)` (personal link) and `accountApi(eventId)` (guest account) |
| `useAttendeeData.ts` | Loads the view and the recommendations through the `AttendeeApi`, listens to live updates |
| `useAttendee.ts` | Attendee actions (hold, confirm, release, RSVP, people, privacy) and friendly notices; takes an `AttendeeApi` that pages keep stable with `useMemo` |
| `attendeeRules.ts` | Pure rules: which step to show, "was my seat just taken?", the next best seat |
| `AttendeePage.tsx` | Puts the steps together: Welcome, People, Seat, Done, plus the odd states. `AttendeeJourney` (exported) is reused by `pages/account/MySeatPage.tsx` |
| `SeatStep.tsx`, `HoldBar.tsx`, `RecommendationStrip.tsx`, `SeatNotice.tsx` | The seat step and its parts |
| `useOrganiser.ts` | Organiser data, live updates, one `run()` helper for every write |
| `OrganiserPage.tsx`, `OrganiserMap.tsx`, `Tabs.tsx` | Layout: map on the left, tabbed panel on the right. The map prints names (`showOccupants`) and marks preview changes with a square (`marked`) |
| `GuestsTab.tsx`, `OptimiseTab.tsx`, `SettingsTab.tsx`, `PrintTab.tsx` | The four tabs. `GuestRow.tsx` adds the badges "Joined with link" and "Has an account" |
| `ShareLinkCard.tsx` | Settings tab: the shared link switch, Copy link, Make a new link (asks first), the optional limit and the counts (`GET`/`PATCH /events/{eid}/share`, `POST .../share/regenerate`) |
| `seatPick.ts` | What clicking a seat means for the organiser (the keyboard alternative to drag and drop) |
| `planPreview.ts`, `friendSeats.ts`, `format.ts` | Small pure helpers, each tested (`formatDeadline` writes a midnight deadline as 23:59 of the day before) |
| `browserHelpers.ts` | Clipboard, file download, and `bringMapIntoView` (on a phone "Place" scrolls to the map and focuses it) |

## Data flow

```
GET /a/{token} ---> useAttendeeData (load, recs) ---> AttendeePage ---> step component
                         ^                                                 |
   live version bump ----+ (useLive)                     tap a seat: useAttendee.actions.hold
                                                                           |
                       409 seat_taken -> SeatNotice "That seat was just taken" + next best seat
```

The organiser side is the same pattern: `useOrganiser` loads
`GET /events/{eid}` and `GET /events/{eid}/guests` together, every write goes
through `run()` (busy flag, reload, announcement, toast), and `useLive`
reloads when anyone changes the event.

## Three likely walkthrough questions

**1. What happens if two people tap the same seat at the same moment?**
Both pages call `POST /a/{token}/hold`. The database lets one insert win; the
other gets HTTP 409 `seat_taken`. `useAttendee.handleError` turns that into a
`conflict` notice, fetches fresh data, and `nextBest` (in `attendeeRules.ts`)
offers the best recommendation that is still free, with a one-tap button.

**2. How does the page notice that someone else took the seat I am holding?**
`useLive` calls back whenever the event's version goes up. We fetch the view
again and `lostSeat` compares: my held seat now shows as `taken` or `friend`,
so the hold bar disappears and the same friendly notice appears. The seat map
itself announces the change in its hidden live region.

**3. Why is the countdown not stored in state?**
`useCountdown` keeps only a "tick" counter that forces a redraw every second;
the seconds left are worked out from the real clock on each draw. So a new
hold can never show the old value for a moment and be mistaken for an expired
one. The server still decides when a hold really ends (409 `hold_expired`).
