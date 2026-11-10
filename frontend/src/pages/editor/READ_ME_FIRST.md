# frontend/src/pages/editor: read me first

## Purpose

The floor-plan editor (`/editor/:venueId`) for both kinds of venue: add,
move and resize tables, seats and zones, then save the whole layout with
`PUT /venues/{id}/layout`. The backend assigns ids and rebuilds who sits next
to whom.

## Key files

| File | Job |
|---|---|
| `EditorPage.tsx` | Loads the venue, holds the layout in `useHistory`, saves, handles the arrow-key nudge |
| `layoutModel.ts` | Pure functions: each takes a layout and returns a NEW one (create a table, set its seats, move, delete) |
| `layoutWire.ts` | Converts between the API's flat lists and the editor's nested layout (seats inside their table) |
| `useHistory.ts` | Undo and redo: a list of earlier layouts |
| `EditorCanvas.tsx` | The drawing surface: pan, zoom, drag. Hidden from screen readers; the side panel is the accessible way in |
| `PropertiesPanel.tsx` | Edit what is selected, or pick an item from the list; its heading takes focus so arrow keys keep working |
| `EditorToolbar.tsx` | Add items, undo, redo, save |
| `useUnsavedGuard.ts` | Warns before unsaved changes are lost (reload, close, or a link inside the app) |

## Data flow

```
GET /venues/{id} -> layoutFromVenue() -> useHistory(layout)
edit -> layoutModel function -> new layout pushed on the history
Save -> payloadFromLayout() -> PUT /venues/{id}/layout -> history reset with server ids
```

## Three likely walkthrough questions

**Why is undo so short to write?**
`layoutModel.ts` never edits a layout in place, so every earlier version is
still intact. Undo just shows the previous one in the list.

**Why are seats stored inside their table in the editor but flat in the API?**
Moving a table must move its chairs in one change. `layoutWire.ts` flattens
the nested form for the API, which works with plain lists and ids.

**What happens if you leave with unsaved changes?**
`useUnsavedGuard` asks the browser to warn on reload or close, and asks
"Leave without saving?" before a link inside the app. The browser's Back
button is not covered, because the app uses the simple `BrowserRouter`.
