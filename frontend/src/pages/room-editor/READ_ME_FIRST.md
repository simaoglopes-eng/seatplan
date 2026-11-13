# Restaurant room editor

This editor owns restaurant rooms and uses centimetres with screen y down.
The event editor remains the compatibility reference. Only its existing
useHistory and useUnsavedGuard hooks are imported when the UI is introduced.

roomModel.ts defines the nested room payload and immutable room operations.
Every added item has a browser key of at most 39 characters, with a nullable
database id. Persisted ids must be preserved when moving and editing items.

geometry.ts matches the Python ambience geometry. Clockwise outlines have
positive signed area. Each point's curve is the signed outgoing sagitta.
The polygon uses 16 segments per circular side by default. Boundary points
are inside. Server validation remains authoritative at save and publish.

Why immutable values? Each history entry can retain the previous object.
Why room-local coordinates? Each room has independent walls and orientation.
Why two geometry implementations? Browser gestures and server validation need
the same conventions. Known reference cases are tested in both languages.

Run npm test -- src/pages/room-editor/geometry.test.ts and npm run typecheck.

RoomEditorPage starts the room history and accessible properties. RoomCanvas
uses the shared pan/zoom hook, centimetre grid and rulers. NewRoomDialog and
shapeModel create rectangles, L-shaped rooms and freehand outlines. Every
gesture for adding a corner also has x/y fields and a button. The legacyRoom
adapter reads the existing flat restaurant layout into an implicit Main room
without changing any database id. The later persistence tasks replace that
bootstrap with the dedicated versioned room API.

shapeEditing.ts edits corners and circular sides without changing prior history.
Splitting an arc keeps both halves on the original circle. A split across an
opening or a removal beside an opening is refused until the opening is moved.
The owner sees that explanation rather than losing window data. Drawing ignores
repeat taps and finishOutline normalises winding and remaps opening offsets.

ShapeHandles provides 44px pointer targets independent of zoom. One drag is one
history step. A single midpoint tap adds a corner after the double-tap interval;
a double tap straightens the wall. RoomProperties exposes the same edits as
forms, with decimal comma or point and visible validation errors. SVG paths use
true circular A segments. The properties heading receives focus without
scrolling the canvas away during a drag.
