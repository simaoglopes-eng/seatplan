# Decisions log

Every deviation from `docs/CONTRACT.md`, with the date and the reason.

## 2026-11-10: backend foundation

1. **Import root is `app`, run from `backend/`.** The optimiser code and its
   tests (written in parallel) already import `app.optimiser...` with
   `backend/` on the path. Mixing `backend.app` and `app` would load each module
   twice, so one `ApiError` class would not match the other. Everything now
   uses `app.*`. The seed command is therefore
   `cd backend && python -m app.seed.run` (not `python -m backend.app.seed.run`).
   `backend/pyproject.toml` sets `pythonpath = ["."]` for pytest, and
   `api/index.py` puts `backend/` on `sys.path` before importing.
2. **Two extra environment variables:** `DEMO_ORGANISER_PASSWORD` and
   `DEMO_STAFF_PASSWORD` (section 9 has no place for demo passwords). When
   empty and `DEMO_MODE=1`, documented defaults in `seed/run.py` are used;
   with demo mode off they are required.
3. **Error code `internal`** for unexpected 500 errors, so the frontend always
   receives the uniform error shape. It is not in the section 5 list.
4. **Two extra files in `core/`:** `errors.py` (typed errors shared by every
   module) and `layout.py` + `neighbours.py` (layout save and neighbour
   geometry, kept out of the router so each file has one job).
5. **Layout payload uses client keys.** `PUT /venues/{id}/layout` items carry a
   `key` and an optional `id`; tables point at zones with `zone_key`, seats at
   tables with `table_key`. New items have no id yet, so keys are the only way
   to link them. Existing items missing from the payload are deleted (409
   `conflict` if still used by an assignment or booking).
6. **`public_id` and `manage_token_hash` are indexed, not UNIQUE**, because
   section 4 lists UNIQUE only where written. 72 random bits make collisions
   practically impossible.
7. **`guests.email` is nullable**, so deleting a guest can erase the address.
8. **Holds:** `take_hold` commits by itself (it is its own unit of work);
   `confirm_hold` consumes the hold without committing; the new helper
   `commit_or_seat_taken` maps a UNIQUE clash on the final insert to
   `SeatTaken`.
9. **`first_initial` privacy mode** shows first name plus last initial
   ("Ana S."). The contract names the mode but not the exact format.
10. **Staff see every venue; organisers only their own.** Single-tenant demo.

## 2026-11-10: Vercel wiring, what was checked

Checked with the Vercel documentation search tool (Context7 index of
vercel.com/docs) on 2026-11-10:

- `vercel.com/docs/functions/runtimes/python` and
  `vercel.com/docs/frameworks/backend/fastapi`: a Python file that defines a
  top-level `app` (ASGI, FastAPI) is served as a function; dependencies come
  from `requirements.txt` (or `pyproject.toml`). `api/index.py` does that.
- `vercel.com/docs/functions/configuring-functions/duration` and
  `vercel.com/docs/project-configuration/vercel-json`: `functions` keyed by
  the entry file accepts `maxDuration` and `excludeFiles`. We set 30 s, which
  covers the 25 s live stream.
- `vercel.com/docs/frameworks/frontend/vite` and the `rewrites` section of
  `vercel-json`: a rewrite to `/index.html` gives client-side routing for a
  Vite single-page app; `buildCommand` and `outputDirectory` override the
  project settings.
- The docs show that a function reads the original path unless a
  `request.path` transform changes it, so routes keep their `/api/...` prefix.
  **Not verified on a real deployment** (no deploy was done).

## 2026-11-10: events optimiser

1. **Extra optional parameters, all with defaults, so the section 6 calls
   still work unchanged.** `score(problem, assignment, previous=None)` and
   `anneal(..., previous=None)`: replan needs the change penalty in both.
   `solve` and `replan` take `time_limit_s` (safety cut-off only; first 60 s,
   lowered to 15 s after the review, see the last section). `solve_exact(problem, time_limit_s=10.0, engine="auto")`: `engine`
   lets tests and the gap report force `"cp-sat"` or `"branch-and-bound"`.
2. **Where functions live.** `check_hard` is in `events_model.py` (next to
   `seat_allows`, the per-seat rules); `solve` is at the bottom of
   `events_anneal.py`. Section 6 names the functions but not their modules.
3. **Result shapes.** `SolveResult(assignment, score, iterations, seed,
   unseated, moved)`, where `moved` is filled by replan only.
   `ExactResult(assignment, score, seated, engine, proven_optimal, seconds)`.
   `Recommendation(seat_id, gain, reasons, known_nearby)`: `known_nearby` holds
   ids (never names) of people from the guest's own `knows` list near the
   seat, so the API can name them. All are in `events_model.py`.
4. **Exact objective is lexicographic:** seat as many guests as possible, then
   maximise the score. Without the first rule, "optimal" could leave a guest
   standing to gain a few points.
5. **Recommendation gain uses the mutual "knows" rule** (as the objective
   does), but reasons only use the guest's own list. A raw gain number could
   therefore reveal who listed the guest. Superseded after the review: the
   API now ranks with the guest's own list only and returns `rank` and
   `match`, never the gain (see the last section).

## 2026-11-10: frontend foundation and seat map

1. **Seat map payload (proposal, not yet in section 5).** Every map endpoint
   (`GET /a/{token}`, `GET /r/{vid}/map`, `GET /staff/{vid}/floor`,
   `GET /events/{eid}`) is asked to return the map as
   `{width, height, zones, tables, seats}` with
   `MapTable {id, label, shape, x, y, w, h, rotation, zone_id?, state?, accessible?}`
   and `MapSeat {id, table_id, label, x, y, state, accessible, occupant?}`.
   `state` uses the section 5 seat states; `occupant` is the name already
   filtered by `core/privacy.py`. In restaurant maps `MapTable.state` is the
   table's state for the chosen slot. Types: `frontend/src/api/types.ts`.
2. **Table geometry follows the backend** (`models.py`): `(x, y)` is the
   top-left corner of the unrotated box and `rotation` turns it around its
   centre. The frontend's `tableCentre()` is the one place that converts.
3. **Demo links:** the frontend reads `GET /demo/links` as `{links: {name: path}}`
   (the shape in `routers/demo.py`). Paths should be frontend routes (`/e/`,
   `/organiser/`, `/r/`, `/b/`, `/staff/`, `/editor/`); an API attendee path
   `/a/<token>` is mapped to `/e/<token>` as a safety net.
4. **404 from `/demo/links` is shown as "the demo is switched off"**, not as an
   error, because that is what the backend means by it.
5. **Live stream:** the hook listens to the named `version` event (as the
   backend sends it) and also to unnamed messages, and accepts `data` as a bare
   number or `{"version": n}`.
6. **Session token in `sessionStorage`** under the key `seatplan.session`.
7. **The floor-plan editor does not use `<SeatMap>`.** It needs dragging and
   per-chair editing, which the booking map must never allow. It reuses the
   same drawing pieces (`TableShape`, `SeatGlyph`, `usePanZoom`), so both look
   identical.

## 2026-11-10: email system

1. **Extra outbox status `sending`.** Section 4 lists `queued`, `sent`,
   `failed`, `skipped`. `process_due()` first moves a row from `queued` to
   `sending` with one conditional UPDATE; only the processor whose UPDATE
   changes the row may send it, so two overlapping cron calls never send the
   same email twice. While `sending`, `next_attempt_at` holds a 10 minute
   lease: if the processor crashes, another one takes the row again after
   that. The column is VARCHAR(10), so the new value fits without a schema change.
2. **The allowlist applies to every provider, the console one included.**
   One rule with no exceptions is easier to trust in a demo. Locally, put
   the demo addresses in `EMAIL_ALLOWLIST` to see them reach the console log.
3. **`/emails/log` shows every outbox row to any organiser.** The outbox has
   no venue or organiser column, and this is a single-tenant demo (see the
   foundation entry 10). Recipients are masked (`an***@example.com`).
4. **POST `/internal/email/process` is rate limited** (30 calls per minute per
   IP) before the secret check, to slow down guessing. An empty `CRON_SECRET`
   rejects every call instead of accepting an empty header.

## 2026-11-10: events screens (attendee and organiser frontend)

`frontend/src/api/events.ts` copies the shapes of `routers/events.py`,
`routers/attendee.py` and `events_service/` as they were on 2026-11-10 (the
"events vertical API" entry below). Frontend-side choices:

1. **The organiser screen reads two endpoints together:** `GET /events/{eid}`
   (map, `not_chosen`, counts) and `GET /events/{eid}/guests` (the list), in
   one `getOrganiserEvent()` call, because every part of the screen needs both.
2. **Personal links** exist only in the answer that created them (add guest,
   import, new link). The list shows "Copy link" for those, and "New link"
   (after a confirmation, because it revokes the old one) for everyone else.
3. **Live scope** comes from `event.live_scope`, never built in the browser.
4. **A hold from before a page reload** (`me.held_seat_id`) has no end time in
   the answer, so the page shows that seat with a "Hold this seat" button
   instead of a countdown that would be guessed.
5. **Privacy preview in the browser.** The Settings tab repeats the
   `display_name()` rule from `core/privacy.py` (`previewName` in
   `pages/events/format.ts`) only to preview a mode before saving; what
   attendees see always comes from the server.
6. **"Next to a friend" on the attendee map** is worked out in the browser
   (same table, the two closest seats), because the attendee map has no
   neighbour list. It only decides which seats get the halo and the "Free next
   to someone you know" buttons; it never decides anything on the server.
7. **Erased guests** (kept as "Deleted guest" rows by the backend) are hidden
   from the organiser list. Until the API sends a flag, they are recognised by
   that fixed name plus a missing email.
8. **Requested from the backend, not sent yet** (the screens work without
   them): `assignments` (`{"<guest id>": seat_id}`) in each scenario, so the
   map can draw the preview; without it the preview shows score and counts
   only. `erased: true` in the guest list.

## 2026-11-10: events vertical API

1. **CSV import is the raw request body** (`Content-Type: text/csv`), not a
   multipart form upload. FastAPI needs `python-multipart` for forms, and it is
   not in the allowed dependency list (section 2). Cap: 200 KB and 1000 rows.
   The import is all or nothing: if any row is wrong, nothing is imported and
   the answer (HTTP 200) lists `{line, message}` for every bad row.
2. **Extra endpoint `GET /a/{token}/people?q=`** for the people search. It
   searches only the privacy-filtered name, never the real one.
3. **Scenario ids in URLs are the per-event `seq`** of `plan_snapshots`, not
   the database id. The snapshot kind (`scenario` or `history`) lives inside
   the `assignments` JSON: `{"kind", "seats": {"<guest id>": [seat id, source]}}`.
   The `score` JSON also keeps `unseated`, `moved`, `iterations` and `seed`.
4. **New helper package `backend/app/events_service/`** (with its own
   `READ_ME_FIRST.md`) so that both routers stay short.
5. **"Human choices" means sources `self` and `organiser`.** Auto-fill and
   re-plan pass both as `fixed`. Applying a scenario never overwrites either.
   Undo and redo protect only `self`: they may restore organiser moves, but a
   guest's own choice is never undone or re-created by the organiser's history.
6. **Seat states, small rules.** A reserved seat whose tag the attendee does
   not have is `blocked` for that attendee. The attendee's own hold is shown as
   `held`, with `me.held_seat_id` saying it is theirs. `occupant` is `"You"` on
   the attendee's own seat. One live hold per attendee: a new hold drops the old.
7. **Seat not allowed for this guest** (blocked, other reserved tag, not
   accessible when needed) answers 409 `conflict`; a guest who answered "no"
   must answer "yes" before holding (409 `conflict`).
8. **Deadline:** hold, confirm, release and RSVP are refused after
   `change_deadline` (409 `deadline_passed`); privacy and "knows" stay open.
   The organiser is not bound by the deadline.
9. **Email idempotency keys** are `seat-<kind>:<guest id>:<seat id>:<audit id>`
   (cancellation: same shape). Each seat action writes exactly one audit row, so
   its id names the action. Organiser moves also send a seat email; applying a
   scenario and undo/redo do not, to avoid mailing everyone at once.
10. **Email texts:** `events_service/mailer.py` uses
    `mail.templates.seat_email(kind, guest_name, event_name, seat_text) ->
    (subject, body_text, body_html)` when it exists, else a marked local fallback.
11. **GDPR delete keeps an empty row** ("Deleted guest", no email, no dietary
    note, revoked token, RSVP `no`) so ids in old plan snapshots still resolve.
    Seat, holds and acquaintances are removed; the audit row names only the id.
12. **Organiser map extras:** each seat also carries `guest_id`, `source`,
    `blocked` and `reserved_tag`. The attendee map carries only the section 5
    fields plus `occupant` (privacy-filtered).
13. **Exact-check** works on one or two tables (at most 16 seats), defaulting
    to the table where most guests sit, with a 10 s limit for the exact solver.
14. **Demo links** use frontend routes: `/organiser/{event public id}` and
    `/e/{token}`. Tokens are made with `secrets` (never seeded), everything else
    comes from `random.Random(2026)`.

## 2026-11-10: restaurant screens (frontend)

Section 5 names the restaurant endpoints but not every field. The frontend
codes against the shapes below (all in `frontend/src/api/restaurant.ts`); the
restaurants, bookings and staff routers are asked to return them. Field names
are snake_case. Times are `"HH:MM"` and dates `"YYYY-MM-DD"` in the venue's
time zone; `expires_at` is an ISO date-time in UTC.

1. **Needs travel with the diner's requests.** `GET /r/{vid}/map` also takes
   `accessible` (true/false) and `high_chairs` (number), and
   `POST /r/{vid}/hold` also takes `needs_accessible` and `high_chairs`.
   Without them the optimiser cannot honour accessibility or high chairs on
   "Choose for me", which section 6 lists as a hard rule. Item 10 adds the
   same two fields to the what-if request.
2. **`GET /r/{vid}`** -> `{public_id, name, timezone, max_party, services:
   [{name, weekday, start_time, end_time}], blackout_dates: [{date, reason}]}`.
   Weekday uses Python's numbering (Monday 0). The page tells a diner about a
   closed day before they pick a time.
3. **`GET /r/{vid}/slots`** -> `{date, closed_reason, slots: [{time, service,
   status}]}`. `closed_reason` is non-null on a closed day or a blackout date.
4. **`GET /r/{vid}/map`** -> the shared seat map payload plus `recommended:
   {table_ids, reasons} | null`. Each table adds `min_party`, `max_party`,
   `high_chair_ok` and `fits_party`; `state` is `free`, `held` or `taken`. The
   page shows the diner's own hold as `mine` and an unsuitable table as
   `blocked` ("does not suit").
5. **`POST /r/{vid}/hold`** -> `{hold_id, table: {id, label}, expires_at}`;
   409 `seat_taken` (or `conflict`) when someone was faster.
6. **`POST /r/{vid}/bookings`** `{hold_id, name, email, phone, notes,
   needs_accessible, high_chairs}` -> `{booking, manage_url}` where
   `manage_url` is a path such as `/b/<token>`; 409 `hold_expired` sends the
   diner back to the map with their details kept.
7. **Booking view** (confirmation, `GET|PATCH /b/{token}`): `{public_id,
   venue_public_id, venue_name, date, time, end_time, party_size, name, email,
   table_labels, status, needs_accessible, high_chairs, notes}`. `PATCH` takes
   `{time?, party_size?}`. `DELETE` may answer with any JSON or an empty body.
8. **`POST /r/{vid}/waitlist`** `{date, wanted_time, party_size, name, email}`
   -> `{position, estimated_wait_minutes}`.
9. **Staff floor** `GET /staff/{vid}/floor` -> the seat map payload plus
   `{date, time, services: [{name, start_time, end_time}], bookings: [...]}`;
   each table adds `status`, `min_party`, `max_party`, `high_chair_ok`,
   `combine_group`, `booking_id`. A staff booking is `{id (public_id), name,
   party_size, time, end_time, status, source, table_ids, table_labels,
   needs_accessible, high_chairs, notes}`; `{bid}` in staff URLs is that id.
10. **Walk-ins and what-if.** `POST /staff/{vid}/whatif` takes `{party_size,
    time, needs_accessible, high_chairs}` (needs added, as in 1) and returns
    `{table_ids | null, table_labels, reasons, displaced: [{booking_id, name,
    party_size, from_labels, to_labels}]}`. `POST /staff/{vid}/walkins` takes
    `{party_size, needs_accessible, high_chairs, table_ids, time}` and returns
    the new staff booking. Combining tables is a move with two or more
    `table_ids`.
11. **Dashboard** -> `{date, covers_booked, covers_seated, services: [{name,
    covers, utilisation}], no_show_rate, no_show_sample, overbooking:
    {extra_covers, explanation} | null}`; rates are 0 to 1.
12. **Schedule** (`GET|PUT`) -> `{services: [{id, name, weekday, start_time,
    end_time, slot_minutes, max_covers_per_slot}], turn_times: [{max_party,
    minutes}], blackout_dates: [{date, reason}]}`.
13. **Staff map words.** The shared map speaks seat-state words ("on hold",
    "friend"), so on the staff floor the screen reader hears those words for
    reserved and finishing tables. The table board next to the map carries the
    correct staff words for every table. A `describe` override on `SeatMap` is
    requested from the seat-map owner. (Done later: `SeatMap` takes a
    `describe` prop, and `StaffFloor.tsx` and `StepTable.tsx` pass their own
    words; see the "documentation and verification" section.)

## 2026-11-10: restaurants vertical API

1. **New package `backend/app/restaurant_service/`** (with its own
   `READ_ME_FIRST.md`) holds the database-side logic; the three routers stay
   thin. Section 3 does not list it; it mirrors `events_service/`.
2. **Table holds are one `holds` row per table per 15-minute slot**, with the
   slot index as `slot_key`. One row per booking would let overlapping (but
   not identical) windows hold the same table. `hold_id` is a random token;
   `holder_key` stores `"<chosen|auto>:<sha256 of hold_id>"`, so the booking
   step knows whether the diner picked the table.
3. **`POST /r/{vid}/hold` also accepts `table_ids`** (list, at most 3) next to
   `table_id`, so a diner can take a recommended combination of tables.
   Optional query/body fields `accessible` / `needs_accessible`,
   `high_chairs` and `zone` describe the party.
4. **`POST /r/{vid}/bookings` body** is `{hold_id, party, name, email, phone?,
   notes?, needs_accessible?, high_chairs?}`. The date, time and tables come
   from the hold. The answer includes `manage_token`, `manage_path` and
   `manage_link` (the only time the raw token is returned).
5. **409 answers carry alternatives** inside the usual error object:
   `{"error": {"code": "seat_taken", "message", "alternatives": {"times":
   ["18:45", ...], "tables": [{"table_ids", "labels"}]}}}`.
6. **Covers cap = guests arriving at one seating time** (kitchen pacing), not
   guests present. Breaking it is 409 `conflict`. The cap is checked by the
   application, so two simultaneous bookings could exceed it by one party;
   tables themselves can never be double booked. (Superseded: the check now
   locks the service period row first, so this can no longer happen; see the
   "documentation and verification" section.)
7. **Slots answer** `{date, closed, reason, slots: [{time, service, status,
   reason}]}`; past times are listed as `full` with reason `past`.
8. **Map table states** add `too_small` (not a seat state); in `seats[]` it is
   sent as `blocked`. Tables carry `zone_kind`, `min_party`, `max_party`,
   `accessible`, `high_chair_ok`, `combine_group`; the map also returns
   `slot_status` and `recommended: [{table_ids, labels, waste, reasons}]`.
9. **A stay never crosses midnight**: slots stop at 24:00 local time.
10. **Booking statuses completed, no_show and cancelled delete the booking's
    `table_slots` rows** (the table is free again) and cannot be reopened.
11. **Walk-ins** are bookings with `source="walk_in"`, `status="seated"`, empty
    email and a random manage token hash nobody receives. Body:
    `{party_size, name?, date?, time?, needs_accessible?, high_chairs?,
    table_ids?}`; date and time default to now (current quarter hour).
12. **Waitlist** answers `{date, time, position, estimated_wait_minutes}`
    (null when no table could ever seat the party). A cancellation offers the
    freed tables (status `offered`, email with a booking link); it does not
    book for them.
13. **Email bodies** come from `app.mail.templates.restaurant_email(kind,
    context) -> (subject, text, html)` when that function exists, otherwise
    from a marked local fallback in `restaurant_service/emails.py`. Kinds:
    `booking_confirmed`, `booking_changed`, `booking_cancelled`,
    `booking_reminder`, `waitlist_offer`. A changed or cancelled booking marks
    its queued reminder `skipped`.
14. **Schedule PUT replaces everything** and does not bump a live scope (it
    is not tied to one date). It is audited.

## 2026-11-10: integration (merge of the nine modules)

Checked by running the backend (uvicorn, DEMO_MODE=1, fresh SQLite), seeding it
with `POST /api/demo/reset`, calling every endpoint the frontend uses, and
comparing the real JSON with the TypeScript types.

1. **Emails use the real templates.** The temporary helpers in
   `events_service/mailer.py` and `restaurant_service/emails.py` are gone; both
   call `mail/templates.py`. Confirmation, change and cancellation emails carry
   a calendar invite built by the new `mail/invites.py` (one UID per seat or
   booking; cancellation uses METHOD:CANCEL with the same UID).
2. **Invite SEQUENCE = seconds since 1970.** RFC 5546 only needs it to grow for
   the same UID. Using the clock means no counter column. It fits the 32-bit
   INTEGER of RFC 5545 until 2038.
3. **Links in emails.** We store only token hashes, so a link back to the
   personal page (`/e/<token>`, `/b/<token>`) is included only when the guest
   or diner is the one acting. When an organiser or staff member acts, the link
   is the site home (events) or the restaurant page (restaurants).
4. **Waitlist offer email does not promise a hold.** The table is not held for
   the person (see restaurant entry 12), so `templates.waitlist_offer` now takes
   `expires=None` and then says "the first person to book it gets it".
5. **Restaurant client converts in one place.** `frontend/src/api/restaurant.ts`
   now types what the backend really sends ("Server..." types) and turns it into
   the screen shapes with small `to...` functions. Differences found and fixed:
   hold id is text and the held table is `{table_ids, labels}`; booking body
   needs `party`; booking answers use `id`, `restaurant`, `tables`, and never
   the email; slots use `closed` + `reason`; the map sends a list of
   recommendations and the extra table state `too_small`; waitlist body is
   `{date, time, party, name, email}`; what-if uses `possible`, `tables`,
   `from_tables`, `to_tables`; the dashboard has per-service suggestions and
   `utilisation_percent`; the schedule uses `service_periods` and has no ids.
   The test fixtures now hold real backend shapes, so the tests cover the
   conversions too.
6. **Backend fields added for the screens:** `max_party` on `GET /r/{vid}`;
   `fits_party` on each diner-map table; zones, seats, the day's services and
   `min_party`, `accessible`, `high_chair_ok`, `combine_group`, `party_size`,
   `name` on the staff floor; `assignments` on every events scenario;
   `held_until` in the attendee's `me`.
7. **Erased guests** were already left out of `GET /events/{eid}/guests`, so the
   frontend no longer guesses them by the name "Deleted guest".
8. **Table labels in reasons.** `TableSpec` has an optional `label`; reasons such
   as "Joins tables T5 + T6" now use labels, never database ids.
9. **What-if refusal is a 409.** If the optimiser refuses a fixed booking that
   breaks a rule (ValueError), staff get `409 conflict`, not a 500.
10. **Waitlist offer link prefills the booking form.** `/r/<id>?date=&party=`
    sets the date and party size when they are valid; time is still picked.
11. **A recommended combination of tables** is held through "Choose for me"
    (the optimiser returns the same best choice), because a hold names one table.
12. **Contract updated:** `app` import name and seed command, demo password
    variables, `events_service/` and `restaurant_service/` in the layout,
    `sending` outbox status, raw-CSV import, `GET /a/{token}/people`,
    `held_until`, `max_party`.
13. **The seed command stays `cd backend && python -m app.seed.run`.** The task
    text named `python -m backend.app.seed.run`; that cannot work without loading
    every module under two names (entry "backend foundation" explains why).

## 2026-11-10: fixes after the adversarial review (platform)

1. **Demo reset needs `X-Demo-Key`, nothing else.** The organiser-session path
   is gone: the demo organiser's password is public in the repository, so any
   reader could wipe the graded demo. An empty `DEMO_KEY` rejects everyone.
2. **No public demo passwords on Postgres.** `seed/run.py` uses the documented
   defaults only on local SQLite with `DEMO_MODE=1`; on Postgres (any
   deployment) `DEMO_ORGANISER_PASSWORD` and `DEMO_STAFF_PASSWORD` are required.
3. **`SECRET_KEY` is required whenever the database is Postgres**, demo mode
   or not. Before, demo mode on Postgres fell back to a random key per
   instance, which logged people out at random on Vercel.
4. **New table `demo_links`.** The demo entry links (raw tokens) used to sit
   in `audit_log.detail`, against the rule that tokens are stored only as
   hashes. They now live in their own table, wiped by every reset and read
   only while `DEMO_MODE=1`; the audit row stores only `{"count": n}`.
5. **No table creation at start-up on Postgres.** Several cold starts at once
   raced on `CREATE TABLE` and crashed. Tables now come from
   `python -m app.seed.migrate` (under a Postgres advisory lock); the app
   still creates them on local SQLite. There is still no migration tool: a new
   column or constraint on an existing table needs a hand-written change.
6. **UNIQUE(event_id, seq) on `plan_snapshots`.** Two saves at once could give
   two scenarios the same number; now the second save fails. Retrying it
   once is up to the events code (`events_service/plans.py`).
7. **Pooled Postgres URLs.** Query options libpq does not know (for example
   `supa=`, `pgbouncer=`) are dropped, using libpq's own list of options. On
   Vercel a missing `DATABASE_URL` now stops the app with a clear message
   instead of falling back to SQLite on a read-only disk.
8. **Live stream:** an `async` generator that holds no worker thread while it
   waits, refused (429) past 30 opens a minute per address or 50 open streams
   per instance. Polling stays the dependable path on serverless.
9. **Error codes:** `method_not_allowed` (405) and `internal` (500 and any
   status the API never plans to send) are now in contract section 5; 400 and
   413 map to `validation`. Before, 405 claimed `not_found` and any unmapped
   status claimed `conflict`.
10. **Rate limit window described honestly.** It is a fixed window per
    calendar minute, so a burst across a minute boundary can pass up to twice
    the limit. Kept for simplicity; the login test now freezes the clock, which
    removes the random failure when 11 slow logins crossed a minute boundary.
11. **`tzdata` added to `requirements.txt`**, so `zoneinfo` does not depend on
    the host having a time zone database (contract section 2 updated).
12. **Security headers on the static frontend** (`vercel.json`): framing is
    refused (`X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`), the CSP
    allows only our own origin, `Referrer-Policy: no-referrer` keeps
    `/e/<token>` and `/b/<token>` links from leaking, plus `nosniff`. Checked
    with headless Chrome against a local build: no CSP violation on the home,
    diner, attendee, staff, organiser and login pages.
13. **Event reminders.** `mail/reminders.py` adds `sync_event_reminder()`: one
    reminder per guest per event, a day before (or two hours before, or none),
    rewritten when the seat changes and cancelled when the seat is released or
    the guest erased. The events code calls it after every seat change
   (`events_service/mailer.sync_reminder`, used by seating, plans and the
   GDPR erase, which also wipes the reminder's words and address).
14. **Contract corrections:** no Playwright suite and no `report/` folder
    exist. End to end is `backend/tests/test_e2e_slice.py`; the browser check
    was done by hand. `report/**` was removed from `vercel.json`. (Reversed
    later for Playwright: see the "documentation and verification" section.)
15. **CI now runs `ruff format --check .`**, so the README's "same checks" is
    true.

## 2026-11-10: fixes after the adversarial review (events, restaurants, frontend, verification)

1. **Recommendations (contract section 5):** `GET /a/{token}/recommendations`
   returns `rank` (1 = best), `match` (`strong`, `some`, `none`) and reasons,
   never the raw gain. Ranking uses only the guest's own "knows" list, so the
   order cannot reveal who listed them. `GET /a/{token}` also names the venue.
2. **Exact check (events):** `heuristic_seated`, `exact_seated` and `note`
   added; `gap_percent` is null when the two plans seat a different number of
   guests, because the exact solver seats the most guests first.
3. **Safety cut-offs** are 15 s for both optimisers (were 60 s and 30 s), so a
   best-so-far answer comes back before Vercel's 30 s `maxDuration`, even when
   an exact check runs in the same request. Tests read `vercel.json`.
4. **Lock order and deadlocks:** every write on an event starts with
   `seating.lock_event`. A Postgres deadlock or serialization failure
   (sqlstate 40P01 or 40001) on ANY route is answered 409 `conflict` "please
   try again" by `main.py`, instead of a 500.
5. **Restaurant holds:** at most 3 live holds per client per venue and date,
   and never more than half the tables of a slot; both give 429. A held table
   can be given back with `DELETE /r/{vid}/hold/{hold_id}`.
6. **`max_party` is per venue** (largest table or allowed combination, the
   covers cap, at most 30) on `GET /r/{vid}` and `GET /b/{token}`.
7. **Staff optimiser endpoints:** `POST /staff/{vid}/optimise/service`
   (preview, then apply with the same `plan_id`) and
   `/optimise/exact-check`, so `assign_service` and `assign_exact` are used by
   the app, not only by tests and the gap report. `PartySpec` gained an
   optional `label`, so messages name tables and parties, never ids.
8. **Staff what-if and walk-ins** take an optional `date` (the day on screen).
   The dashboard adds `covers.seated` and a per-service `covers_seated`.
9. **One text rule:** `core/text.py` `PlainText` refuses control characters
   (NUL above all, which Postgres cannot store) in every free-text field of
   events, restaurants and venue layouts, so such input is a 422, not a 500.
10. **One reminder-time rule** for both verticals: `mail/reminders.reminder_time`.
11. **Plan snapshots** have `UNIQUE(event_id, seq)`. `save_snapshot` takes the
    event lock first, so two saves cannot read the same highest number; no
    retry is written, because with the lock it could never run.
12. **Event reminders are wired in.** Every seat change (attendee confirm,
    organiser move, release, applying a plan, undo and redo) keeps the
    guest's one reminder in step through `events_service/mailer.sync_reminder`.
    A plan sends no seat emails, but a guest it seats gets a reminder.
13. **Staff actions are not read back as someone else's.** `SeatMap` takes
    `actedOn`, the tables the staff member just seated or moved: their next
    change moves silently, because the page already announced it.
14. **A tap does not move the map.** Focus that comes from a pointer no
    longer pans the camera to the cursor; on a phone the pan made the tap land
    on empty floor, so diners could not pick a table by tapping it.
15. **Real time wording corrected (contract section 2):** the browser uses the
    stream first and polls only when the stream fails or is refused.
16. **Opt-in Postgres test run:** `SEATPLAN_TEST_POSTGRES` in
    `backend/tests/conftest.py` gives each test its own Postgres database.

## 2026-11-10: documentation and verification (security fixes, browser tests)

1. **Security review fixes** (full table in [`security.md`](security.md)):
   S1, `X-Forwarded-For` is trusted only on Vercel (`config.py`
   `trust_forwarded_for`, true only when `VERCEL` is set; `security.py`
   `client_ip`), because off Vercel any caller could type a new address and
   dodge every rate limit. S2, an unknown venue time zone is refused with 422
   (`routers/venues.py`). S3, `OverflowError` (dates such as 9999-12-31) is a
   422, not a 500 (`main.py`). S4, the console email provider masks
   addresses (`core/privacy.py` `mask_email`). S5, on Postgres a `SECRET_KEY`
   shorter than 32 characters stops the app. S6, `Strict-Transport-Security`
   in `vercel.json`. S7, `rate_limits` stores a keyed hash instead of the raw
   IP address (`security.py` `_stored_key`). Tests: `tests/test_redteam.py`.
   Still open (team decision needed): S8, one client can fill a restaurant
   with bookings; S9, the outbox keeps raw personal links.
2. **Browser test suite (reverses platform item 14).** Playwright
   (`@playwright/test` 1.64.1) and `@axe-core/playwright` 4.14.0 in
   `frontend/e2e/`, run with `npm run e2e` and by a new `e2e` job in
   `ci.yml`. `package.json` pins `playwright-core` to 1.64.1 with
   `overrides`: without it the axe package pulled in 1.65.0 and TypeScript
   refused the two different `Page` types. A small Node server
   (`e2e/servers/frontend.mjs`) serves the build instead of `vite preview`,
   whose `/api` proxy always points at port 8000; it also sends the
   `vercel.json` headers. The tests use fixed ports 8765 (backend) and 4317
   (frontend), changeable with `E2E_API_PORT` and `E2E_WEB_PORT`.
3. **Covers cap under concurrency.** `check_covers_cap` first locks the
   service period row (`restaurant_service/availability.py`, `_lock_period`),
   so two confirms at the same moment are checked one after the other. Test:
   `test_covers_cap_holds_under_concurrent_confirms`. Restaurants vertical API
   item 6 no longer applies.
4. **Staff map words.** `SeatMap` takes a `describe` prop; the staff floor
   and the diner's table step pass their own wording (restaurant screens
   item 13 is done).
5. **Seat map payload** (frontend foundation item 1) is now written in
   contract section 5, because every map endpoint returns it.
6. **Accessibility fixes from `accessibility.md`:** the recommended-seat halo
   breathes twice and stops (WCAG 2.2.2); `html` has `scroll-padding-top` and
   `scroll-padding-bottom` so focus is not hidden under the sticky header and
   hold bars (2.4.11); event dates use `"en-GB"` like the restaurant pages
   (3.1.2). Not done: a visible "live" or "reconnecting" sign.
7. **New documents** in `docs/`: product spec, personas, accessibility,
   usability kit, architecture, data model, API and `openapi.json`, runbook,
   deployment, contributing, FAQ, changelog, risk log, security, test report,
   the project report (`docs/report/`) and the team pack (`docs/team/`).
   README section "Documentation" lists them all.

## 2026-11-10: booking caps and outbox links (security findings S8 and S9)

1. **Booking caps (S8).** New `restaurant_service/booking_caps.py`, called by
   `POST /r/{vid}/bookings` right after `read_hold` (so a dead hold never
   counts) and before `confirm_booking`. One mailbox may have at most 4
   upcoming diner bookings (status confirmed, seated or finishing, end still
   in the future) at one restaurant; one client address may make at most 10
   booking attempts at one restaurant per UTC day (`security.rate_limit`,
   key `r-book-day:<venue>|<address>`, stored as a keyed hash). Both give
   429 `rate_limited` in words the booking form already shows; the hold is
   kept. Staff bookings and walk-ins never count. Chosen over a CAPTCHA or an
   email check because both need a service we do not have. Trade-off the team
   must confirm: more than 10 bookings at one restaurant in one UTC day from
   one Wi-Fi address (a classroom demo, or one presenter rehearsing) get the
   429, and the demo reset does not clear `rate_limits`.
2. **Booking caps, holes closed by the verifier.** `mailbox()` reads capitals
   and a `+tag` as the same inbox (dots are not merged: only some providers
   ignore them). An IPv6 address counts by its /64 network (`network_of()`),
   because one home connection gets a whole /64 and could use a new address
   per request. The email is never checked, so the email cap only stops an
   honest diner; the address cap is the real brake. Tests:
   `tests/test_booking_cap.py` (13).
3. **Personal links leave the outbox (S9).** Contract section 4 said tokens
   are stored only as hashes, but outbox bodies kept the raw link. Now
   `mail/outbox.py` keeps the link only while a row is `queued` (the email and
   its retries must work); on `sent`, `skipped` or `failed` every `/b/`, `/e/`
   and `/a/` link in the words, the invite (unfolded first, since RFC 5545
   folding can split a link) and `last_error` becomes
   `[personal link removed]`. `drop_reminder()` and the event reminder's
   `_cancel()` blank words and invite. `GET /emails/log` passes subject and
   error through `redact_links()`. Contract section 4 now says this.
4. **Outbox retention (S9, part of S23).** `scrub_expired()` runs in every
   `POST /internal/email/process` and empties words and invite of finished
   rows 30 days after `sent_at` (or after `next_attempt_at` when never sent;
   there is no `created_at`). Adding a `created_at` column was left out: it
   needs a migration and is not needed for this fix. Tests:
   `tests/test_outbox_retention.py` (13), including a scan of every table for
   the raw token after a booking, a change and a cancellation.


## 2026-11-10: guest accounts and the shared event link

The product owner asked for "a guest profile for when the link is shared",
with an account needed to get the seat email "with the view of the venue and
their seat". The full design is [`guest-accounts.md`](guest-accounts.md);
these are the decisions that change the contract.

1. **D1. Nothing counts until the emailed code is typed.** The account, its
   guest row and its session are made only by `POST /guest/verify`. Before
   that only a pending row in the new `email_codes` table exists (15
   minutes). This stops fake addresses filling an event and makes linking an
   invited guest safe.
2. **D2. The shared token is derived, not random:** HMAC-SHA256 of
   `SECRET_KEY`, the event's public id and `share_version`; only its SHA-256
   is stored. The organiser can copy the link again at any time; "Make a new
   link" adds 1 to the version. Kept after review (S41, accepted).
3. **D3.** A switched-off link answers 403 `link_closed`, a wrong or replaced
   one 404. Two new error codes: `link_closed` (403) and `event_full` (409).
4. **D4.** Seat emails still wait for the outbox cron; only code emails are
   sent at once (`send_now`, which uses the same claim so a row is never
   sent twice).
5. **D5.** The account holder's seat email (picture, invite, link to
   `/my/<event>`) goes out on their own confirm, on a single organiser move
   and, **changed after review**, on an applied plan, undo or redo. Guests
   with only a personal link keep today's emails and get nothing from a plan.
6. **D6.** Deleting an account erases the rows it made, and unlinks (seat
   freed, emails wiped, no cancellation email) rows the organiser made.
7. **D7.** Code emails follow the same `EMAIL_ALLOWLIST` as every email.
   **Open for the product owner:** with today's list real guests outside it
   never get a code.
8. **Migration.** `app.seed.migrate` now adds the columns and indexes in
   `NEW_COLUMNS` and `NEW_INDEXES` (`ALTER TABLE ... ADD COLUMN`, `IF NOT
   EXISTS` on Postgres, after an inspector check on both) as well as missing
   tables, in one transaction after the advisory lock; on SQLite it now takes
   `BEGIN IMMEDIATE`, because two runs at once both tried `CREATE TABLE`
   (150 of 150 stress runs failed before, 0 after). Model `server_default`
   values match the DDL word for word (`text("FALSE")`, `text("0")`), so a
   fresh and an upgraded database compare equal.
9. **No new dependency.** The seat picture is an indexed PNG drawn with the
   standard library (`zlib`, `struct`, `binascii`) in `mail/png.py`,
   `mail/pixel_font.py` and `mail/seat_picture.py` (21 706 bytes of source).
   Its types have no field for a person, so it cannot show a name.

## 2026-11-10 to 11: guest accounts, fixes after the reviews

A security review and a correctness review attacked the feature the same
night. What changed (each with a test that failed before it; `security.md`
section 9 and `guest-accounts.md` section 2.1):

1. **Demo codes (S30).** `demo_code` only when demo mode and the console
   provider are on, the address ends in `@example.com` and no organiser
   invited it; never for a password reset (this declines the frontend's
   request to show the reset code in the demo). An account made with a shown
   code has `guest_accounts.email_proven = false` and is never linked to an
   invitation. Declined: refusing to start with demo mode, console and
   Postgres together, because the graded deployment runs exactly so.
2. **Sign-up id (S31).** `POST /j/{token}/register` returns a random
   `signup_id`; `/guest/verify` requires it (`email_codes.signup_hash` keeps
   its keyed hash). A new contract field in both directions.
3. **Limits (S32, S33, S38, S39, S40).** scrypt on every register; link and
   deadline checked before any count; per-address code counts split by
   purpose; app-wide count only for queued emails; per-network limits raised
   (60 code emails an hour, 200 a day, 100 code checks per 10 minutes, 600
   visitor views a minute); failed logins counted per address and network
   (20) and per address (100); code tries counted in one guarded `UPDATE`
   before the compare.
4. **Removed guests (S35).** `erase_guest` keeps `account_id` on the erased
   row; `join` answers `removed`, HTTP 403 `forbidden`. This answers the
   spec's open question 3 with "no".
5. **Smaller fixes.** `AUTOINCREMENT` for `guest_accounts` on SQLite (S36);
   `email_codes.share_version` (S37); "Hello," without the typed name in code
   emails (S34); `set_rsvp` checks for room before "no" becomes "yes"
   (409 `event_full`); places left ignores seats reserved for a tag; a full
   event no longer refuses `register`; the picture's `width` is its real
   width; a wrong password on account deletion is 422 `validation`
   ("password: That password is not correct."), not 401, as the frontend
   asked.
6. **New columns on new tables only.** `email_proven`, `signup_hash`,
   `share_version` and `code_shown` live in `guest_accounts` and
   `email_codes`, which no deployed database has yet, so `create_all` makes
   them and `NEW_COLUMNS` did not need to grow. A database that ran the
   pre-review migrate would lack them; none exists outside test machines.


## 2026-11-13 ? restaurant platform foundation decisions

Approved by Martim through the restaurant spec and autonomous overnight implementation instruction. The detailed plan records open issues and the night report records actual completion.

1. Keep the historical NEW_INDEXES collection limited to its existing guest-account migration scope. Add a separately named restaurant index collection, executed by the same migration function, with new tests for the complete schema. The existing migration tests enumerate historical indexes on events/guests and remain intact.
2. Preserve the public three-element ScoreBreakdown.key used by existing callers and exact-oracle tests. A separate comparison method will append preference satisfaction for new restaurant planning. Document this compatibility deviation from specification 8 before implementing the optimiser extension.
3. Keep the existing API error envelope. Publication problems and stale-layout details are additive fields. New clients handle them explicitly.
4. Use the saved-draft server endpoint for editor sunlight preview. No duplicated solar algorithm in TypeScript is required.
5. Preserve the current Casa Lumen demo name. The specification's Casa Linho reference describes that existing demo.
6. Use independent restaurant code-consumption logic where the guest account helper couples to event-only purposes. Reuse public normalization/password/rate-limit helpers where safe. Event code files remain protected, including the known concurrent-code race.
7. Geolocation requires the approved first-party policy in both API and hosting headers. Draft photo preview requires authenticated fetch and an object URL. Private photo responses must use private/no-store caching. Previously public immutable photos cannot be revoked from existing browser caches.
8. A published venue with newly invalid configuration must stop accepting new bookings until repaired. Existing booking-management links remain available. The complete publication policy will be checked during that task.
9. Do not invent view descriptions at night, or solar predictions without required inputs. Omit uncertain claims. Polar daylight/night decisions use solar altitude when rise/set instants are absent.
10. Martim authorized recovery of the last verified green commit using git reset --hard only on martim/restaurantes-impl. Preserve and restore the report around recovery and continue with the next feasible task. The sole known guest-register concurrency failure may be rerun in isolation.

11. Restaurant foundation compatibility: append added columns after existing model columns, in migration order. SQLite uses DATETIME for published_at to match SQLAlchemy; Postgres retains TIMESTAMP. The shared legacy venue serializer omits room_id and is_active so the existing editor can round-trip its strict payload. This preserves the event API behavior while rooms use their own API. Frozen 2026-11-13 fixtures precede all restaurant schema changes.

12. Owner registration returns code_shown as a six-digit string only in the established safe demo conditions, including a dummy value for existing accounts so the response shape does not reveal account existence. Owner email codes use purpose owner and their own consumption path. Existing staff-flow fixtures explicitly mark their restaurant is_demo; new isolation tests prove real restaurants are inaccessible, including through the shared venues router. No existing assertion is removed or weakened.

13. Room wall topology edits preserve openings. Adding a corner through an
opening, or deleting a corner with openings on either adjoining side, asks the
owner to move those openings first. This conservative choice avoids silently
moving or resizing windows. Removing an unoccupied corner joins its neighbours
with a straight side. Splitting a circular side preserves its exact circle.
Room drawing ignores repeated taps at the first or most recent corner and
normalises winding when closed. Midpoint insertion waits 350 ms so a double
tap can straighten the side without also inserting a corner.

14. Geometry browser tests reuse real authenticated owner sessions, avoiding
repeated login UI actions that exhaust the production login limiter. Dedicated
login UI tests and the limiter remain unchanged. The existing staff walk-in
test now waits for the 20:00 API counts before recording its initial count;
the slider label changes earlier than the floor data. Its final increment
assertion is preserved. Both failures were diagnosed and recovered from the
last green commit before taking these conservative test setup corrections.

15. Leaflet 1.9.4 uses a data GIF internally when cancelling tile requests.
Browser tests caught its CSP rejection on map unmount. Allow data: only in
img-src alongside self and the approved OSM host; scripts/styles stay self.
Tile images set strict-origin-when-cross-origin to satisfy OSM's Referer rule
without exposing personal paths. Geolocation is self-only and explicit.
Keep the wizard keyed by the loaded profile id so stale loading data cannot
reset the new restaurant's identity while navigating to its persisted URL.

16. Selection deletion is conservative until saved room metadata is available:
persisted tables need has_bookings=false from the server; true or unknown
offers unavailability instead. Task 17 must expose this read-only metadata and
recheck real booking references on writes, never trust a client flag. While a
chair is selected, Delete asks the owner to use the chair-count controls rather
than unexpectedly deleting its table. Geometry edits use one history step per
gesture. Table bodies take hit priority over expanded chair hit areas inside the
body, avoiding invisible chair targets stealing a phone's hold on the table.

## 2026-11-13: ambience, discovery and emails (branch claude/ambiente)

Decisions taken while finishing tasks 17 to 38 of the restaurant plan (Claude's list; the numbered list right after it is Codex's, on the same subjects from the verification side, so some topics appear twice). More detail, task by task, is in
`docs/claude-ambiente-notas.md`.

17. **Optimiser ranking.** Spec 8.2 asked for a four-part `key()`. An existing test requires `key() == (6, -2, 1)`, and the exact
    check, the service plan and the gap report compare three-part keys, so `key()` stays as it was. A new `ranking_key()` adds the
    wishes met and is used only by the heuristic to break ties. Wishes never change what counts as optimal.
18. **Drafts take no bookings.** `load_restaurant` used to answer for a draft. Diner routes (`/api/r/{vid}...`) now use `load_published`:
    a draft or unpublished restaurant is a 404, while existing bookings keep working through their manage links.
19. **Features on the card** (`venues.features`: sun, view, accessible, terrace) are computed when rooms are saved and on publish. They only
    claim what the rooms support (no north: no sun).
20. **The chair is a wish.** The booking is for the whole table. The chair is stored on the booking, checked to be a usable chair at the
    booking's tables, shown in the emails and to the staff, and dropped when a change moves the booking to other tables. A chair change
    (`PATCH /b/{token} {seat_id}`) is sent on its own; with a time change it is a 422, so a failed table move never half-changes the chair.
21. **Search runs in Python** over published restaurants with a slug (accents and capitals ignored on name and cuisines, haversine distance).
    Only the 20 on the page get their cover and free times, unless "Available" must look at all. `search_text` is not used because old and
    demo rows have it empty.
22. **`/r/:id` forwards to `/restaurants/:slug`** only when the restaurant has a slug, keeping the query. A link with `?date=&time=&party=`
    checks once that the time is still free and goes straight to the tables, or lands on the times with a message.
23. **Emails.** `mail/restaurant_templates.py` (new, pure) builds the confirmed, changed and reminder emails; `restaurant_service/email_facts.py`
    gathers the facts. The cover photo is a remote image, the mini-map the single inline image (`cid:seatmap`), also on the reminder. The old
    templates stay. One old assertion changed from "table T1" to "Table T1".
24. **Demo data.** Four invented restaurants in real Lisbon neighbourhoods plus Casa Lumen with a public profile. The photos are drawn by
    `seed/demo_photos.py`, which is their recorded source (no third-party images). The demo organiser now owns five restaurants.
25. **Choosing a table on the map is two steps** (branch claude/ux-polish): a tap or Enter selects it and shows its card, and "Hold this table"
    reserves it, so a finger never holds a table by accident (spec 9.3). The list buttons still hold in one step. Holds and live updates are
    unchanged. The staff planner (service re-plan and what-if) treats a booking made with wishes as fixed, so it keeps the table it was given with them
    (decision 26, branch claude/staff-polish). Weighing wishes per party in the planner stays a possible later improvement.
## 2026-11-13 — integration of claude/ambiente

Imported from [Claude's implementation notes](claude-ambiente-notas.md).
These initially described the implementation merged at 31cc829. The entries
below include the completed chair-management and email integration brought in
at 7e0f699. Restaurant decisions use continuous numbering across both authors.

26. **Optimiser compatibility (spec 8.2).** `ScoreBreakdown.key()` keeps its
three-part `(covers, -waste, zones)` interface. `ranking_key()` appends
`prefs_met` for heuristic tie-breaking. The exact oracle, service-plan
comparison and gap report retain the existing definition of optimality.
Preferences never override hard constraints or the original objectives.
Recommendation ordering only changes for parties with wishes: avoid wasting
more than two seats, then prefer more wishes met, then retain the old stable
ordering. Combined tables meet a wish only when all their tables meet it.
Staff service planning/what-if still do not evaluate time-specific wishes.

27. **Publication boundary.** Draft restaurants return 404 to diner reads,
holds, booking creation and waitlist entry. Existing `/b/{token}` management
links remain usable after unpublication. Existing venues default to published,
preserving the old demo. Publication rechecks profile, location, service,
active tables, geometric errors and window-room north on the server; photos
remain recommended. Publication 422 includes `problems` both at the top level
and inside the normal error envelope. `features` is derived from saved rooms.

28. **Sunlight rules.** Doors never admit sun. A `between` rule is half-open
`[start,end)`; the engine supports a range across midnight, and missing times
mean no sun. Curved windows use 16 segments with independent orientations.
Outdoor daytime outside awnings is `daylight` when direct sun is absent.
Polar night is determined by solar altitude, not missing sunrise/sunset.
Table-to-window distance uses edges; round tables use a 16-sided approximation.

29. **Ambience wording.** Sunset-from-seat requires a window bearing 200–340°
within 3 m, or an outdoor room; otherwise report when it gets dark. Night uses
`night_view_text` if present, falling back to the owner's daytime text. This
supersedes the earlier provisional omission rule in foundation decision 9:
the fallback is declared text, not a new inferred description. Remove an
initial “The ” when forming “View of the …”. An outdoor shade phrase is “In
the shade”. Seat-facing wording uses a view window, else the nearest window,
within 3 m; otherwise omit it. Nearness includes host stand/main entrance;
quietness ignores fireplaces and host stands.

30. **Preview and API inputs.** A legacy restaurant gets an implicit rectangle
without north/windows. Without coordinates the ambience response says
`located:false`, `sun:null`, no table claims or patches. Stay start/end govern
the phrases and durations; the optional cursor `moment` changes light scenery.
Public ambience is rate-limited and contains no personal data or photo bytes.
Detailed owner/map responses add metrics, features and view-photo metadata.

31. **Optional client features preserve existing journeys.** No `rooms` prop
keeps the old SeatMap rendering; one room needs no tabs. A table tap first
chose the table and later (decision 25, branch claude/ux-polish) became tap-to-inspect as in
the spec: the card shows, and "Hold this table" reserves. The ambience card describes the active,
held or recommended table. The light cursor debounces 250 ms and preserves
the last scenery on network errors. Wishes are omitted from requests when
empty; choosing sun clears shade and conversely. The seat step remains inside
Table, is optional, and skips when usable seats cannot be loaded.

32. **Seat choice.** It is indicative and adds no hold. Unknown, foreign,
wrong-table or blocked seats return the same 422 before consuming the table
hold. A time change keeps the seat; changing assigned tables clears it.
Task 33 adds seat changes on the management page through a separate PATCH
request. The staff-map chair marker remains pending. Staff text shows the
choice and wishes.

33. **Editor persistence.** Preview uses the saved draft and warns about
unsaved work. Local recovery offers only a layout differing from the server;
restoring uses the current server version as the base, while server ownership
and object checks still apply. A stale save retains the local work and offers
explicit reload/overwrite choices. Booking-history protection is conservative
when a legacy booking's released slots no longer identify its old table.

34. **Email picture boundary.** The standalone restaurant PNG renderer accepts
only room/table/seat dataclasses, with no person fields; it draws the booked
room only, curves, fixtures and the optional seat. Unsupported/oversized text
falls back to shorter headings. Task 34 wires the renderer, profile/photo and
ambience into outgoing restaurant mail through email_facts.py and
restaurant_templates.py. The event renderer is reused through imports.

35. **Verification exceptions authorized by Martim.** In addition to the known
concurrent guest-code verification race, only
`test_redteam::test_s1_forged_forwarded_for_cannot_dodge_the_login_limit` may
be rerun alone after a full-suite failure: it can cross a calendar-minute
rate-limit boundary. Neither production limiter nor either test is weakened.

36. **Local latency measurement.** The 60-table HTTP benchmark runs against
the real test database in a fresh API process with normal garbage collection.
It includes the first and two subsequent requests, requires every response
below 300 ms, and checks room, chair and ambience payloads. Full-suite probes
identified 237–296 ms GC pauses scanning prior tests' object graphs; isolating
the API process measures the requested operation without that test-order
artifact. No warmup, retry, GC disabling, response mocking or budget increase.
This is a local response budget, not a production cold-start/network guarantee.

## 2026-11-13 — final integration review corrections

37. Opening clocks are bounded HH:MM; side references, wall spans, overlaps,
glass coverage, main-door flags and view tags are checked before upsert. Bad
requests return 422 and roll back the version. Counterclockwise outlines are
normalized with curve signs and opening side/arc offsets remapped. Both room
validators enforce inclusive 4–5000 m²; invalid geometry remains saveable as
draft but prevents publication.

38. The service adapter namespaces combine-group names with room_id, including
the implicit room. The database/API labels stay unchanged and the reserved
pure optimiser files are untouched. This blocks joining physically separate
rooms in recommendations, maximum-party calculation and explicit holds.

39. After first explicit publication (`published_at` present), an invalid
profile/room/schedule edit atomically saves as draft. Existing bookings and
manage links are preserved; publish must pass the checklist again. The editor
and profile save explain the change. Legacy default-published venues have no
complete new profile and keep compatibility until explicit publication. A slug
stays fixed after first publication even if the venue is later draft. This is
the conservative implementation of foundation decision 8, with no separate
public snapshot or expensive revalidation on every diner read.

40. The old half-of-tables hold cap rounded one table down to zero, making
every hold at a one-table restaurant return 429. The allowance is now at least
one; larger venues retain the original cap rounded down. Existing six-table
cap tests remain unchanged. Actual one-table hold→booking→manage flows verify
the correction. Per-client/rate limits and unique slot constraints remain.

41. Local recovery ignores structurally damaged stored drafts instead of
crashing the editor. The current storage key (`seatplan.room-draft.<venue>`)
and 400 ms debounce are retained for compatibility with Claude's implementation
and existing recovery tests. They differ from the spec's camel-case key/2 s
debounce; the independent 30 s checkpoint remains pending. No failing test was
removed, skipped or relaxed to accept the integration.

42. Browser traces use a separate top-level temporary directory per Playwright
process. A global output directory can be cleaned by another worktree while
tests are still writing traces, producing ENOENT even after successful business
assertions. Final checks also use distinct API/web ports and run backend then
frontend, preserving the strict map-latency assertion. The first failed final
run triggered the user-authorized recovery to 4bb515a; the patch and diagnostics
were retained and the report restored before the next verification.

27. **Two integration findings from the independent review, fixed** (branch claude/staff-polish): (a) the owner's preview of an unpublished
    restaurant showed broken photos, because a draft's photos need the owner's sign-in and a plain image cannot send it; the preview now fetches
    them with the sign-in (`PhotoImg`); (b) the confirmation email's map marked no chair when the chair was at the second table of a joined
    booking; it now draws the room of the chair's table, marks the chair there and highlights every booked table of that room.

28. **A dead control removed.** The room editor's toolbar had a "Preview" button that was always disabled. A button that never works is worse
    than none, and the Light tool already shows the saved room as a diner sees it, so the button is gone (branch claude/staff-polish).
29. **Frontend tests tolerate a busy machine.** `testTimeout` is 20 s and `asyncUtilTimeout` 5 s (vite.config.ts, src/test/setup.ts). On an idle
    machine nothing changes; with a game or Docker running, long interaction tests (events ones too) used to time out at 5 s / 1 s without any
    real fault. A real hang still fails, only later.

30. **Discovery: one command bar and a filters drawer** (branch claude/ux-v2, step 1 of the UX plan). On a wide screen (64 rem) the page has one sticky
    bar: search, a where-and-when capsule (city, date, time, people), Near me, the quick filters Sunny tables / With a view / Terrace, and the
    Filters button. Cuisine, price, wheelchair access and "available at that time" live in a drawer from the right (`Dialog` got an optional
    `placement="side"`; the default is unchanged, events are not touched). On a phone the bar is only the search and the Filters button, a pill
    under it summarises where and when, and the drawer also holds where, when and the quick filters. Picking a date fills the time with 20:00. Cards
    show four things: photo (16:10), name, cuisines, price and distance, one line about the room from the three booleans the restaurant already
    has (nothing is worked out per search), and up to three free times. Wheelchair access is a filter, not card clutter.
