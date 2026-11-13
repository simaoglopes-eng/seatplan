# API guide

## Finding restaurants and the public page

`GET /api/restaurants` is public (same read limit as the booking page). Query: `q` (name or cuisine, accents and capitals
ignored), repeatable `cuisine`, `price` (1 to 4) and `features` (`sun`, `view`, `accessible`, `terrace`, all required), `lat` and `lng`
(together; nearest first with `distance_m`), `date`, `time` and `party` (together; each card then has `next_times`, and
`available=true` keeps only restaurants with a free table within an hour), `limit` (1 to 50) and `offset`. The answer is
`{items, total}`. `GET /api/restaurants/{slug}` is the public page; a draft is a 404 for everyone but its own owner, who gets
`preview: true`. `GET /api/r/{id}/map` now also carries `rooms` and, per table, `ambience`; `GET /api/r/{id}/ambience` gives the light
at a moment; `GET /api/r/{id}/seats` lists the chairs of held tables; `PATCH /api/b/{token}` takes `seat_id`. The owner routes
`PUT /api/owner/restaurants/{vid}/rooms`, `.../ambience-preview`, `.../publish-check`, `.../publish` and `.../unpublish` are in
`CONTRACT.md` section 10.

## Restaurant owner accounts

POST /api/owner/register accepts name, email, password and consent=true.
It returns 202 with signup_id, and code_shown only in approved local demo
conditions. Existing accounts receive the same response shape. POST
/api/owner/verify accepts email, six-digit code and signup_id and returns 201
with token and user. Codes expire after 15 minutes, allow five attempts and
can be consumed once. The session works with the existing /api/auth endpoints.
Bodies reject unknown fields. Staff access to restaurant endpoints and
the shared /api/venues endpoints is restricted to is_demo restaurants.

GET /api/owner/restaurants requires an organiser session and lists only that
owner's restaurants, with public_id, slug, name, status, cover_url and
setup containing done, total and missing step codes.

The full, exact list of endpoints and request and answer shapes is
[`openapi.json`](openapi.json). This page is the short version a person can
read. The design agreement is section 5 of [`CONTRACT.md`](CONTRACT.md).

## Where the OpenAPI file comes from

`docs/openapi.json` is exported from the real FastAPI app, not written by
hand. It was last made on 2026-11-13 (after the ambience, discovery and email work) with this command (run from `backend/`; the
temporary SQLite file goes in `$TMPDIR` so nothing is left in the repository):
hand. Last export: 2026-11-13, including the restaurant owner/room/ambience APIs.
Run from the repository root; the script uses and removes a temporary SQLite
database and does not touch the local application database:

```powershell
.\.venv\Scripts\python.exe scripts/export_openapi.py
```

What that run reported: OpenAPI `3.1.0`, title `SeatPlan API`, version
`0.1.0`, **93 paths, 108 operations, 62 schemas**. Run the command again after
changing any router, so the file never drifts from the code.

## Restaurant platform API implemented on this branch

All paths below have the `/api` prefix. Owner routes require an organiser's
Bearer session and return the same 404 for missing and foreign restaurants.

| Path | Behaviour |
|---|---|
| `POST /owner/restaurants` | Owned draft, unique ASCII slug; profile GET/PATCH at `/owner/restaurants/{vid}/profile` |
| `/owner/restaurants/{vid}/photos` | Private gallery metadata/upload, order/cover/alt/delete; draft bytes require owner auth at `/photos/{photo_id}` |
| `GET/PUT /owner/restaurants/{vid}/rooms` | Whole nested layout, optimistic `base_version`, IDs preserved, atomic save; answer adds `version`, `status`, `problems` |
| `GET /owner/restaurants/{vid}/ambience-preview` | Saved-draft preview, date/time/party and optional cursor moment |
| `GET /owner/restaurants/{vid}/publish-check` | Required problems and recommended photo tip, with fix URLs |
| `POST /owner/restaurants/{vid}/publish` and `/unpublish` | Server validation, or draft; existing booking links survive |
| `GET/PUT /staff/{vid}/schedule` | Owner edits opening hours through the existing schedule API; staff limited to demo restaurants |
| `GET /r/{vid}/map` and `/ambience` | Published restaurants only; additive rooms/light/phrases; map/hold accept optional wishes |
| `GET /r/{vid}/seats?table_ids=…` | Usable chairs and facing phrases, at most three tables from this venue |
| `POST /r/{vid}/bookings` | Optional `prefs` and indicative `seat_id`; choice validated before consuming the table hold |

Room writes reject malformed clocks, unknown sides, opening overlap/out-of-wall
spans, partial glass walls and unknown/duplicate view tags with 422. Foreign
object IDs return 404. A stale version returns 409 `stale_layout`; a protected
table deletion returns 409 with `error.tables: [{id,label}]`. Geometric draft
errors remain saveable, including the 4–5000 m² area rule, and prevent publication.
Counterclockwise outlines are reversed with opening side/offset remapping.
Combine groups are scoped by room in the service adapter.

For explicitly published venues, an invalid room/profile/schedule edit saves
atomically as draft and closes new diner requests; existing management links
remain usable. Legacy venues defaulted to published before these fields existed
and retain that compatibility path until first explicit publication. A slug is
fixed after first publication, including after unpublish. A one-table restaurant
can hold its only table; larger venues retain the half-of-tables hold cap.

**Still absent:** discovery `/restaurants`, public profile by slug, management
`Change seat`, and the new restaurant email picture/profile integration. The
publish answer reserves `/restaurants/{slug}`, but the frontend page is not yet
implemented. Use the existing `/r/{public_id}` booking route for the working
journey. See [final review and acceptance matrix](restaurant-final-review.md).

While the backend is running you can also read it live:

- <http://127.0.0.1:8000/api/docs> (Swagger UI, try requests in the browser)
- <http://127.0.0.1:8000/api/openapi.json> (the same JSON)

## Basics

- **Base path:** every endpoint starts with `/api`.
- **Format:** JSON in and out. Two exceptions: the guest CSV import takes the
  raw CSV as the body (`Content-Type: text/csv`), and `export.csv` returns CSV.
  The live stream returns `text/event-stream`.
- **Unknown fields are refused.** Every body is a Pydantic model with length
  limits, so a typo in a field name gives 422 `validation`.
- **Ids in URLs** are random public ids or secret tokens, never the integer
  database id. Scenario ids are the per-event number `seq`.
- **Times:** stored in UTC. Restaurant dates are `YYYY-MM-DD` and times
  `HH:MM` in the venue's own time zone.

## Who may call what

| Kind of caller | How they prove it | Endpoints |
|---|---|---|
| Anyone | Nothing (rate limited) | `/health`, `/r/{vid}/...` (diner), `/live/...`, `/demo/links` (only when `DEMO_MODE=1`) |
| Attendee | Secret token in the URL | `/a/{token}/...` |
| Visitor with the shared link | The event's shared token in the URL (read-only, one token for everyone) | `/j/{token}`, `/j/{token}/register` |
| Guest account holder | `Authorization: Bearer <guest session>` from `/guest/verify`, `/guest/login` or `/guest/password/reset` (5-part token starting `g.`, never accepted as an organiser session) | `/j/{token}/join`, `/guest/logout`, `/guest/me`, `/guest/me/delete`, `/guest/events/{eid}/...` |
| Diner with a booking | Secret manage token in the URL | `/b/{manage_token}` |
| Organiser or staff | `Authorization: Bearer <session>` from `POST /auth/login` | `/venues`, `/events/...`, `/staff/...`, `/emails/log`, `/auth/me` |
| The email cron | Header `X-Cron-Secret` equal to `CRON_SECRET` | `POST /internal/email/process` |
| Whoever resets the demo | Header `X-Demo-Key` equal to `DEMO_KEY` | `POST /demo/reset` |

A wrong token and a revoked token both answer 404, so a guesser learns
nothing. Sessions expire after 12 hours (`SESSION_HOURS` in `security.py`).

## Endpoint groups

Counted from `openapi.json` by tag:

| Tag | Operations | What it is for | Router file |
|---|---|---|---|
| `health` | 1 | Is the app and its database up? | `routers/health.py` |
| `auth` | 2 | Log in, who am I | `routers/auth.py` |
| `venues` | 4 | List, create, read venues; save a floor plan | `routers/venues.py` |
| `demo` | 2 | Demo links and demo reset | `routers/demo.py` |
| `events` | 26 | Organiser: guests, import and export, moves, auto-fill, re-plan, scenarios, what-if, undo and redo, exact check, and the shared link (read, switch and cap, make a new link) | `routers/events.py` |
| `attendee` | 9 | Personal link: page, people search, RSVP, "knows", privacy, recommendations, hold, confirm, release | `routers/attendee.py` |
| `visitor` | 3 | Shared link: the visitor's view, create an account (emails a code), join with an account | `routers/visitor.py` |
| `guest accounts` | 16 | Verify the code, sign in and out, forgotten password, my events, delete my account (`routers/guest_accounts.py`), and the account holder's event routes under `/guest/events/{eid}`, the same 9 as `attendee` (`routers/guest_events.py`) | `routers/guest_accounts.py`, `routers/guest_events.py` |
| `restaurants` | 8 | Diner: restaurant, slots, map, ambience, chairs, hold, give back a hold, book | `routers/restaurants.py` |
| `discovery` | 2 | Search restaurants, the public restaurant page | `routers/discovery.py` |
| `owners` | 10 | Owner sign-up, profile, publish and unpublish | `routers/owners.py` |
| `owner rooms` | 3 | The room layout and the light preview | `routers/owner_rooms.py` |
| `photos` | 6 | Owner gallery and public photo bytes | `routers/photos.py` |
| `bookings` | 4 | Manage or cancel a booking, join the waitlist | `routers/bookings.py` |
| `staff` | 10 | Floor, walk-ins, status, move, what-if, service optimiser, exact check, dashboard, schedule | `routers/staff.py` |
| `emails` | 2 | Process the outbox, read the email log | `routers/emails.py` |
| `live` | 2 | Version number and the live stream | `core/live.py` |
| **Total** | **110** | | |

## Errors

Every error has the same shape:

```json
{"error": {"code": "seat_taken", "message": "Seat B4 was just taken by someone else. ..."}}
```

| Code | HTTP status | Usual cause |
|---|---|---|
| `validation` | 400, 413, 422 | A field is missing, too long, or unknown; a body too large |
| `unauthorised` | 401 | No session, an expired session, a wrong cron secret |
| `forbidden` | 403 | A staff account calling an organiser-only endpoint; a guest account the organiser removed trying to join again with the shared link |
| `link_closed` | 403 | The shared link is valid but the organiser switched it off |
| `event_full` | 409 | No place left for one more guest (join with the shared link, or "yes" again after "no") |
| `not_found` | 404 | Unknown id, a wrong or revoked token, or another organiser's event or venue (missing and not yours look the same on purpose) |
| `method_not_allowed` | 405 | Wrong HTTP method for this path |
| `seat_taken` | 409 | Someone else holds or owns the seat or table (the database said no) |
| `hold_expired` | 409 | The 5-minute hold ran out before confirming |
| `deadline_passed` | 409 | The event's change deadline has passed (also: joining with the shared link after it) |
| `conflict` | 409 | Any other clash, including "please try again" after a Postgres deadlock |
| `rate_limited` | 429 | Too many calls in this minute, too many live streams, too many held tables, or a booking cap (4 upcoming bookings per mailbox, 10 booking attempts per address and day at one restaurant) |
| `internal` | 500 | A bug; the message never shows a stack trace |

The frontend adds two of its own codes that never come from the server:
`network` (no answer) and `unknown` (an answer without this shape).

A restaurant 409 may also carry `alternatives` (other times and tables) inside
the error object (decisions log, "restaurants vertical API", item 5).

## Three worked examples

These run against a local backend after `python -m app.seed.run` (see
[`runbook.md`](runbook.md)). Replace the ids with the ones the seed printed.

Is it up?

```bash
curl http://127.0.0.1:8000/api/health
```

It answers `{"status", "database", "version", "time"}` with HTTP 200, or
`"status": "degraded"` with HTTP 503 when the database cannot be reached.

Log in as the demo organiser (local SQLite only; the default password is in
`backend/app/seed/run.py`):

```bash
curl -X POST http://127.0.0.1:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email": "organiser@example.com", "password": "demo-organiser-2026"}'
```

The answer has a `token`; send it as `Authorization: Bearer <token>` to the
organiser endpoints.

Hold and confirm a seat as an attendee (the seed prints the `/e/<token>`
links; the API path uses the same token after `/a/`):

```bash
curl -X POST http://127.0.0.1:8000/api/a/TOKEN/hold    -H 'Content-Type: application/json' -d '{"seat_id": 12}'
curl -X POST http://127.0.0.1:8000/api/a/TOKEN/confirm -H 'Content-Type: application/json' -d '{"seat_id": 12}'
```

The step-by-step picture of what happens inside is in
[`architecture.md`](architecture.md), section 3.
