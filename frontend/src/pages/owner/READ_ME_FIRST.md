# Restaurant owners

OwnerSignUpPage handles the emailed-code registration flow. The session is
stored only after verification succeeds. OwnerHomePage loads private cards
through api/owner.ts. Owner sign-in reuses Login with /owner as its default
destination. Existing event and staff login destinations retain their defaults.

The page uses the shared design tokens and components. Account endpoints reject
unknown fields and the server controls ownership, publication and setup progress.

Why separate owner and guest accounts? Owners use organiser sessions, which are
accepted by the existing staff tools. Guest account sessions have another format.

Can hiding another owner's card enforce privacy? The API filters by owner id
and applies the same 404 rule at resource endpoints. The UI only displays it.

When is a demo code shown? Only when the server's existing demo checks permit
it. The UI renders code_shown if present and always supports emailed codes.

NewRestaurantWizard saves identity before switching to location. The setup URL
uses the new public id, and a reload resumes from persisted identity. ProfilePage
edits identity/location for existing restaurants. Draft cards offer Continue setup.
The wizard session key follows the loaded profile id, avoiding stale initial
state when /owner/new changes to the saved URL. Slugs are editable only in drafts.
The next upload/hours/room/review steps join this flow in their own plan tasks.

ProfileForms contains explicit geolocation and coordinate fields; Leaflet is
lazy loaded. Server validation is authoritative for URLs, cuisines and timezones.
Client controls prevent over three cuisines and count description characters.
