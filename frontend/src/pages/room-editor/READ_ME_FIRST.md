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
