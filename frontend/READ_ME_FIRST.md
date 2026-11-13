# Frontend: READ ME FIRST

## Purpose

The browser side of SeatPlan: one React 18 + TypeScript app (built with Vite)
that shows a live seat map and lets people pick a seat or a table. It never
decides anything important on its own: the backend (FastAPI) and its database
decide who gets which seat; the frontend shows the result and asks.

## How to run

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173, /api is proxied to http://127.0.0.1:8000
npm test           # vitest, unit and component tests
npm run typecheck  # TypeScript, strict mode
npm run build      # production build into frontend/dist
npm run contrast   # WCAG contrast check of every colour pair in tokens.css
```

## Key files

| File | Job |
|---|---|
| `src/main.tsx` | Loads the design tokens and mounts the app inside the router and the toast provider |
| `src/App.tsx` | The complete route table: one line per page |
| `src/api/types.ts` | TypeScript copies of the backend shapes (seat states, map, venue, layout). Import from here |
| `src/api/client.ts` | `request()` and `api.get/post/...`: one place for JSON, errors (`ApiError`) and the session token. Start with `src/api/READ_ME_FIRST.md` |
| `src/api/useLive.ts` | Live updates: SSE stream, falling back to polling `/version` every 2 s |
| `src/seatmap/SeatMap.tsx` | The one seat map every screen uses (`mode="seats"` for events, `mode="tables"` for restaurants). Start with `src/seatmap/READ_ME_FIRST.md` |
| `src/seatmap/glyphs.tsx` | How each seat state looks (shape, mark, pattern). The legend uses the same code |
| `src/seatmap/usePanZoom.ts` | Drag, pinch, wheel zoom, the first view, "zoom to this seat" |
| `src/seatmap/mapKeyboard.ts`, `geometry.ts` | Arrow-key movement to the nearest seat; camera maths; tap-target sizes |
| `src/seatmap/Targets.tsx`, `describe.ts` | The pickable seats and tables; their spoken names (`findSeat` looks a seat up by id) |
| `src/seatmap/useSeatChanges.ts` | Spots seats that changed, for the screen-reader announcement and the motion cue |
| `src/design/tokens.css` | The only place with colours, spacing, type, radii, shadows, layers, durations |
| `src/design/components/` | Button, Field, Select, Checkbox, Dialog, Toast, Badge, states, Stepper, Legend, PageShell. See `src/design/READ_ME_FIRST.md` |
| `src/pages/Home.tsx`, `Login.tsx` | Landing page with demo links; organiser sign-in |
| `src/pages/owner/` | Owner registration and private restaurant list. Owner login reuses Login with a default /owner destination |
| `src/pages/editor/` | Floor-plan editor: pure layout functions, undo history, canvas, side panel, unsaved-changes guard. See `src/pages/editor/READ_ME_FIRST.md` |
| `src/pages/events/` | Attendee flow (`/e/:token`) and organiser screens (`/organiser/:eventId`). Start with `pages/events/READ_ME_FIRST.md` |
| `src/pages/join/` | The event's shared link (`/j/:token`): the visitor's map, creating a guest account with an emailed code, signing in to join. Start with `pages/join/READ_ME_FIRST.md` |
| `src/pages/account/` | The guest account area (`/my`, `/my/:eventId`, sign-in, password reset, delete account). Start with `pages/account/READ_ME_FIRST.md` |
| `src/pages/restaurant/` | Diner booking (`/r/:venueId`), manage-booking link (`/b/:token`) and the staff page (`/staff/:venueId`) with four tabs: Floor, Dashboard, Schedule and Optimise. Start with `pages/restaurant/READ_ME_FIRST.md` |

## Data flow

```
backend /api  --JSON-->  api/client.ts  --typed data-->  page component (state)
                                                          |
                                     props: tables, seats, selectable, selectedId
                                                          v
                                                   seatmap/SeatMap.tsx
                                                          |
                                     onSelect(id)  <------+  (click, tap, Enter, Space)
                                                          |
page calls api.post(".../hold") -> backend says yes (200) or "seat_taken" (409)

backend writes  -> live version +1 -> SSE "version" event (or the 2 s poll)
                -> useLive calls the page's callback -> page fetches the map again
                -> SeatMap sees changed states -> announces and animates them
```

A typical page:

```tsx
const [map, setMap] = useState<SeatMapPayload | null>(null);
// Illustration only: the real response shape of each page endpoint is set by its owner.
const reload = () => api.get<{ map: SeatMapPayload }>(`/a/${token}`).then((d) => setMap(d.map));
useLive(`event-${eventId}`, reload);
// ...
<SeatMap label="Seat map" tables={map.tables} seats={map.seats} selectedId={chosen} onSelect={hold} />
```

SeatMap's optional props, all backward compatible:

| Prop | What it does |
|---|---|
| `highlight` | Recommended targets: round dashed halo, ", recommended" |
| `marked`, `markedLabel` | A second highlight, a square outline, e.g. "changed by preview" |
| `ownId` | The viewer's own hold: its turning "held" or "mine" is not announced as someone else's |
| `actedOn` | The targets the viewer's last action changed (the tables staff just seated or moved): their next change moves without a sentence, because the page already said what happened |
| `focusId` | Each new id zooms to that target and centres it ("Show on map") |
| `showOccupants` | Names under seats once zoomed in far enough to read them |
| `describe(item)` | Replaces the default spoken name of a seat or table; return null to keep it |

## Three likely walkthrough questions

**1. How do you make sure two people cannot get the same seat?**
The frontend does not try to. Selecting a seat calls the backend, which inserts
a row protected by a UNIQUE constraint; if someone else was faster, the
database refuses and the API answers 409 `seat_taken`. `client.ts` turns that
into an `ApiError` with `code === "seat_taken"`, the page shows a message, and
the live update redraws the seat as taken. `useSeatChanges` then shakes that
seat and announces "was just taken by someone else".

**2. How can a blind or keyboard-only user choose a seat?**
The whole map is one tab stop (`role="listbox"`). Arrow keys move a cursor to
the nearest seat in that direction (`nearestInDirection` in `geometry.ts`),
and the screen reader hears each seat as a sentence such as "Table 4, seat 3,
free, accessible" (`describe.ts`). Enter or Space selects. Changes made by
other people are read out from a hidden live region. States are never shown by
colour alone: each has its own shape or mark (`glyphs.tsx`), checked by a test.

**3. Why does the map stay smooth with 400 seats?**
Panning and zooming change a single `transform` on one SVG group; the seats
themselves are memoised components (`React.memo`) that receive only simple
values (numbers, strings, booleans), so React skips them unless their own data
changed. Callbacks passed to seats are stable (a "latest value" ref), so they
do not force a redraw either. Measured: 60 frames per second while dragging a
400-seat map in headless Chromium (see `docs/design-system.md`).
