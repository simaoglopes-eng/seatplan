# frontend/src/seatmap: read me first

## Purpose

The one SVG seat map every screen uses: attendees and organisers (`mode="seats"`),
diners and staff (`mode="tables"`). It draws, pans, zooms, is fully usable
with a keyboard and a screen reader, and announces changes. It decides
nothing: the page says what may be picked and calls the API.

## Key files

| File | Job |
|---|---|
| `SeatMap.tsx` | The component: builds the targets, wires pan and zoom, keyboard and announcements. Its props are listed in `frontend/READ_ME_FIRST.md` |
| `Targets.tsx`, `MapLayers.tsx`, `MapControls.tsx` | Drawing: the pickable seats and tables, zones and labels, the zoom buttons |
| `glyphs.tsx` | How each state looks (shape, mark, pattern), so no state relies on colour alone; the legend uses the same code |
| `describe.ts` | The sentence for each seat or table ("Table 4, seat 3, free, accessible"); `findSeat` |
| `geometry.ts` | Plain maths: fitting the view, nearest seat in a direction, tap-target sizes (24 px minimum, 44 px comfortable) |
| `usePanZoom.ts` | Drag, pinch and wheel zoom with pointer events; "zoom to this seat" |
| `mapKeyboard.ts` | Arrow keys move a cursor between seats; Enter or Space picks |
| `useSeatChanges.ts` | Compares old and new states: one sentence for the live region and a short motion cue |
| `seatPositions.ts` | Where chairs go around a table (editor and home sample) |

## Data flow

```
page props (tables, seats, selectable, selectedId, ownId, actedOn)
  -> SeatMap builds one target per seat (or per table in tables mode)
  -> click, tap, Enter or Space on a selectable target -> onSelect(id) -> page calls the API
  -> live update -> page passes new seats -> useSeatChanges -> announcement + motion
```

## Three likely walkthrough questions

**How does a blind user pick a seat?**
The map is one tab stop with `role="listbox"`; each seat is an option with a
full sentence as its name. Arrow keys go to the nearest seat in that direction
(`nearestInDirection`), so nobody presses Tab 400 times.

**Why does the person's own hold not trigger "taken by someone else"?**
The server shows everyone's hold as `held`, including your own. The map
remembers your last pick, and the page passes `ownId` (your hold) and
`actedOn` (what your last action changed), so those changes only move.

**How are the seats big enough to tap on a phone?**
The first view never zooms out so far that a target is under 24 px; hit
areas grow towards 44 px without overlapping a neighbour. The person pans for
the rest, and "Show on map" zooms a seat to 44 px.
