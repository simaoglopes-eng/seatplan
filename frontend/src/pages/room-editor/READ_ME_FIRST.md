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

wallModel.ts creates and validates openings, checks overlap and bounds in arc
centimetres, and computes the bearing from the outward normal at the opening
midpoint. WallTools exposes the same controls as WallLayer's move/resize
handles. Windows have view text, up to three tags, top height and a sun rule;
doors have the entrance flag. Glass occupies the entire side and follows side
length edits. Shape changes which would strand a window beyond the wall are
refused. Opening ids/keys survive edits. Photo attachment joins the upload
and saved-room endpoints in tasks 13/17, after an opening has a database id.

NorthTools offers numeric angles, 15-degree steps and a draggable compass.
The needle uses clockwise screen degrees. Phone readings are optional: only
absolute alpha or WebKit compass heading is accepted; relative alpha is
ignored. Permission requests occur on a button click in a secure context.
The phone must lie flat and align with the plan; the owner checks the result.
Manual controls remain available when no sensor reading arrives. API reference:
https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent and
https://www.w3.org/TR/orientation-event/ . Physical iOS/Android hardware has
not been tested in this Windows session.

roomObjects.ts owns immutable fixed-element and zone creation/editing. The
eleven fixture kinds and seven new zone kinds are listed there. Existing
stage zones remain readable/editable for compatibility. Circles keep equal
dimensions; changes preserve ids and keys. Removing a zone clears that link
on affected tables and preserves every table. FixtureTools/ZoneTools expose
palettes, placement in the room and position/size/name fields. Palette drag
uses a private MIME type; tap-then-place and the placement button also work.
ObjectLayer draws neutral icons/names and allows one-step drag undo. Zone
rectangles are behind fixtures and tables and are selectable in Zones mode.
Tables are still read-only until their own editing tasks. Outline containment
and overlap warnings are added by task 16; placement can currently be outside.
All values use centimetres and clockwise screen rotation.

Desktop properties scroll independently within the canvas height, so dragging
from a long palette does not scroll the page out from under the pointer.
Zone names retain the historical 80-character limit, including during moves.
