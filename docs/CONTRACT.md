# SeatPlan build contract

This file is the single agreement between every module. If code and this file
disagree, fix one of them in the same change and say so in `docs/decisions-log.md`.
It is written for a team of four beginners: every choice below must stay
explainable in a live code walkthrough.

Note, 2026-11-10 to 11: the shared event link and guest accounts (sections 2
to 5, 7 and 9) are **built** as described in `docs/guest-accounts.md`,
including the fixes after the security and correctness reviews (its section
2.1). The detailed shapes, limits and errors live there.

## 1. Product in one paragraph

SeatPlan lets people choose their own seat on a live 2D map. Two verticals share
one core: **restaurants** (a diner picks date, party size, time slot and a table)
and **events** (an attendee opens a personal link, sees who sits where within
privacy rules, and picks a seat near people they know). An optimiser recommends
seats, explains why, auto-fills people who have not chosen, and re-plans with
minimal change. Human choices and hard rules are never violated.

## 2. Stack (fixed)

| Layer | Choice | Why (short) |
|---|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2 (sync), Pydantic 2 | Course language is Python; typed, small, auto OpenAPI |
| Database | Postgres in production, SQLite locally and in tests | Same SQLAlchemy code; unique constraints work on both |
| Frontend | React 18 + TypeScript + Vite, react-router, plain CSS with design tokens | Typed, fast build, no CSS framework to explain |
| Seat map | Hand-written SVG component (pointer events, pan, zoom, keyboard) | Full control of accessibility; no heavy canvas library |
| Real time | Server-sent events that end after about 25 s and reconnect, with polling of a change counter every 2 s when the stream fails or is refused | Works on serverless: no shared memory, no long-lived sockets. Only a version number travels; pages fetch the data again |
| Hosting | One Vercel project: static frontend + `api/index.py` Python function | One URL, one deploy, continuous deployment from `main` |
| Email | Outbox table + provider adapter (Resend over HTTPS with `httpx`; console provider locally) | Idempotent, retried, logged; no vendor SDK |
| Seat picture in emails | Indexed-colour PNG drawn with the standard library (`zlib`, `struct`, `binascii`), sent inline with a content id | No new dependency; mail apps show PNG, not SVG (`docs/guest-accounts.md` section 9) |
| Exact solver | OR-tools CP-SAT when importable, pure-Python branch and bound otherwise | Exact check must also run where OR-tools cannot be installed |
| Tests | pytest, hypothesis, FastAPI TestClient; vitest for frontend units; end to end through the real HTTP API in `backend/tests/test_e2e_slice.py`; browser tests with Playwright and `@axe-core/playwright` in `frontend/e2e/` (headless Chromium) | Standard tools. The browser tests drive the real built app against a real backend on a temporary SQLite database |

Python standard library is preferred over new dependencies (`secrets`, `hmac`,
`hashlib.scrypt`, `csv`, `random.Random(seed)`). Backend runtime dependencies are
limited to: fastapi, sqlalchemy, pydantic, email-validator, psycopg[binary], httpx,
tzdata (time zone data for `zoneinfo`, so the function does not depend on the
host's) and ortools (optional extra). Ask before adding another.

## 3. Repository layout and ownership

```
seatplan/
  api/index.py                 Vercel entry point: imports the FastAPI app
  requirements.txt             Runtime deps for Vercel (root, pinned)
  vercel.json                  Build command, output dir, /api rewrite
  .env.example  .gitignore  README.md
  backend/                     Run pytest and the seed from here: the package is imported as `app`
    requirements-dev.txt
    pyproject.toml             pytest and ruff settings
    app/
      main.py                  App factory, middleware, router registration
      config.py                Settings read from environment variables
      db.py                    Engine, session dependency, create_all
      models.py                All SQLAlchemy tables
      security.py              Password hashing, tokens, signed sessions, rate limit
      core/                    (also errors.py, layout.py, neighbours.py, text.py)
        holds.py               Seat and table holds (5 minutes), expiry
        live.py                Change counter + SSE + polling endpoints
        audit.py               Audit log writer
        privacy.py             Display-name rules for attendees
      routers/
        health.py  auth.py  venues.py  demo.py
        events.py              Organiser endpoints (events vertical), shared-link settings
        attendee.py            Personal-link endpoints
        visitor.py             Shared-link endpoints (/j/{token}) (docs/guest-accounts.md)
        guest_accounts.py      Guest account sign-up code, login, logout, password, me, delete
        guest_events.py        The account holder's event endpoints (/guest/events/{eid})
        restaurants.py         Public diner endpoints
        bookings.py            Manage-or-cancel links, waitlist
        staff.py               Staff floor, walk-ins, dashboard, schedule
        emails.py              Outbox processing endpoint, email log
      optimiser/               PURE PYTHON. No database, no FastAPI imports.
        events_model.py  events_score.py  events_greedy.py  events_anneal.py
        events_recommend.py  events_replan.py  events_exact.py
        restaurant_model.py  restaurant_assign.py  restaurant_exact.py
      events_service/          Helpers behind routers/events.py and attendee.py
      restaurant_service/      Helpers behind routers/restaurants.py, bookings.py, staff.py
      mail/
        outbox.py              enqueue(), process_due(), redact_links(), scrub_expired()
        templates.py           Plain-text and HTML bodies
        ics.py                 Calendar invite builder
        invites.py             The invite every seat and booking email carries (sender, SEQUENCE)
        reminders.py           sync_event_reminder(): the event guest's reminder, kept in step with the seat
        providers.py           Resend adapter, console adapter
        png.py  pixel_font.py  seat_picture.py   The inline seat picture (standard library only)
      seed/
        demo_events.py  demo_restaurant.py  run.py
        migrate.py             Creates missing tables, then adds the listed missing columns
                               and indexes (the only place DDL runs on Postgres)
    tests/                     Mirrors app/ (test_<module>.py)
  frontend/
    src/
      design/tokens.css        EVERY colour, space, radius, font size, duration
      design/components/       Button, Field, Dialog, Toast, Badge, Legend, States
      seatmap/                 SeatMap, usePanZoom, seat state icons and patterns
      api/                     Typed fetch client, live-updates hook
      pages/events/            Attendee flow, organiser view
      pages/restaurant/        Diner booking flow, staff floor
      pages/editor/            Floor-plan editor
      pages/Home.tsx  pages/Login.tsx
    e2e/                       Playwright browser tests and their two test servers
  docs/                        Contract, decisions log, optimiser, email, user guides, UX notes,
                               product spec, personas, accessibility, architecture, data model,
                               API (api.md, openapi.json), runbook, deployment, security,
                               test report, risk log, changelog, FAQ, contributing
    usability/                 Usability test kit (script, consent, SUS, results template)
    report/                    Project report (Markdown and PDF)
    team/                      Team pack: tasks, issues, walkthrough questions, demo script
  .github/workflows/           CI and the email cron
```

Rule for parallel work: **edit only the files your task owns.** Stub files exist
for every router and page so that nobody else needs to touch `main.py` or the
frontend route table.

## 4. Data model

Integer primary keys inside the database. Anything that appears in a URL uses a
random `public_id` (12+ url-safe characters) or a secret token, never the integer,
so records cannot be enumerated. Secret tokens are stored as SHA-256 hashes.
All timestamps are UTC, timezone-aware.

Shared
- `organisers` id, email (unique), name, password_hash (scrypt), role (`organiser` or `staff`)
- `venues` id, public_id, organiser_id, kind (`event` or `restaurant`), name, timezone, width, height
- `zones` id, venue_id, name, kind (`general`, `window`, `terrace`, `bar`, `quiet`, `vip`, `accessible`, `stage`), x, y, w, h
- `tables` id, venue_id, zone_id, label, shape (`round`, `rect`, `row`), x, y, w, h, rotation, min_party, max_party, is_accessible, high_chair_ok, combine_group (nullable text: tables with the same value may be combined)
- `seats` id, venue_id, table_id, label, x, y, is_accessible, is_blocked, reserved_tag (nullable: `vip`, `family`, `speaker`)
- `seat_neighbours` seat_id, neighbour_id (symmetric pairs; "next to" for events; built by the layout save)
- `live_versions` scope (primary key, text), version (integer). Every write bumps the scope it touches.
- `holds` id, scope, resource_kind (`seat` or `table`), resource_id, slot_key, holder_key, expires_at. **UNIQUE(scope, resource_kind, resource_id, slot_key)**
- `guest_accounts` id, public_id, email (**unique**, lower case), name, password_hash (scrypt), email_proven (false only when the code was shown on screen in the demo; such an account is never linked to an invitation), session_version, consent_at, consent_version, created_at, last_login_at. Made only after the emailed code is typed (`docs/guest-accounts.md`). `AUTOINCREMENT` on SQLite, so ids are never reused
- `email_codes` id, email, purpose (`register` or `reset`), code_hash (HMAC with `SECRET_KEY`), attempts, expires_at (15 minutes), created_at, and for `register` only: event_id, name, password_hash, needs_accessible, signup_hash (HMAC of the sign-up id only the registering browser holds), share_version, code_shown. **UNIQUE(email, purpose)**
- `email_outbox` id, idempotency_key (**unique**), to_email, kind, subject, body_text, body_html, ics (nullable), image_png (nullable, Base64 of the inline seat picture; emptied with the words), status (`queued`, `sending`, `sent`, `failed`, `skipped`; `sending` is a 10-minute claim by one processor), attempts, next_attempt_at, sent_at, provider_message_id, last_error. Only a `queued` or `sending` row may hold a raw personal link: once a row is `sent`, `skipped` or `failed`, every `/b/`, `/e/` and `/a/` link in body_text, body_html, ics and last_error is replaced by `[personal link removed]`, and 30 days after `sent_at` (or after `next_attempt_at` when never sent) its body_text, body_html and ics are emptied (`mail/outbox.py`)
- `audit_log` id, at, actor, action, entity, entity_id, detail (JSON). Never tokens or links in `detail`.
- `demo_links` name (primary key), path. The demo entry links, raw tokens included on purpose; wiped by every demo reset and read only while `DEMO_MODE=1`.
- `rate_limits` key, window_start, count (primary key: key + window_start)

Events
- `events` id, public_id, venue_id, organiser_id, name, starts_at, ends_at, privacy_mode (`full_name`, `first_initial`, `anonymous`), change_deadline, share_enabled (default false), share_version (default 0), share_token_hash (nullable, **unique**: the hash of the shared link, which is derived from `SECRET_KEY`, the public id and share_version), share_cap (nullable)
- `guest_groups` id, event_id, name, keep_adjacent (bool)
- `guests` id, event_id, name, email, token_hash (unique), token_revoked_at, group_id, wants_anonymous, needs_accessible, dietary_note, reserved_tag, rsvp (`pending`, `yes`, `no`), account_id (nullable FK `guest_accounts`), source (`invited` or `self_registered`, default `invited`). **UNIQUE(event_id, account_id)**
- `acquaintances` guest_id, knows_guest_id (directed; primary key both)
- `seat_assignments` id, event_id, seat_id, guest_id, source (`self`, `organiser`, `optimiser`), created_at. **UNIQUE(event_id, seat_id)** and **UNIQUE(event_id, guest_id)**
- `plan_snapshots` id, event_id, seq, label, assignments (JSON), score (JSON), is_current. Used for scenarios, undo and redo. **UNIQUE(event_id, seq)**

Restaurants
- `service_periods` id, venue_id, name (`Lunch`, `Dinner`, ...), weekday (0-6), start_time, end_time, slot_minutes, max_covers_per_slot
- `turn_times` id, venue_id, max_party, minutes (party size up to max_party stays this long)
- `blackout_dates` id, venue_id, date, reason
- `bookings` id, public_id, venue_id, date, start_at, end_at, party_size, name, email, phone (nullable), notes, needs_accessible, high_chairs, status (`confirmed`, `seated`, `finishing`, `completed`, `cancelled`, `no_show`), source (`diner`, `walk_in`, `staff`), table_choice (`chosen` or `auto`), manage_token_hash, created_at
- `table_slots` table_id, date, slot_index, booking_id. **PRIMARY KEY(table_id, date, slot_index)**. A day is cut into 15-minute slots; a booking owns one row per table per slot it occupies. This is what makes double booking impossible on both SQLite and Postgres.
- `waitlist_entries` id, venue_id, date, wanted_time, party_size, name, email, status, created_at

### No double booking, ever

The database decides, not the application. Confirming a seat inserts into
`seat_assignments`; confirming a table inserts all its `table_slots` rows; taking a
hold inserts into `holds`. A unique-constraint violation is caught and returned as
HTTP 409 with a friendly message. Expired holds are deleted inside the same
transaction that tries to take the resource. No "check then insert" without the
constraint behind it.

## 5. HTTP API (all under `/api`)

JSON everywhere. Errors use `{"error": {"code": "seat_taken", "message": "..."}}`.
Codes in use: `not_found`, `validation`, `unauthorised`, `forbidden`, `seat_taken`,
`hold_expired`, `deadline_passed`, `rate_limited`, `conflict`, `method_not_allowed`
(HTTP 405), `event_full` (HTTP 409: no place left for one more guest),
`link_closed` (HTTP 403: the event's shared link is switched off; a guest
account the organiser removed gets `forbidden` from the join route) and
`internal` (HTTP 500, or any status the API never plans to send).
HTTP 400 and 413 use `validation`. The frontend adds two codes of its own that
never come from the server: `network` (no answer) and `unknown` (an answer
without this error shape).
Organiser and staff endpoints need `Authorization: Bearer <session>`; the session
is an HMAC-signed, expiring value from `/auth/login`. Guest account endpoints
need `Authorization: Bearer <guest session>`, a different format
(`g.<id>.<session_version>.<expiry>.<signature>`, signed over a message that
starts with `guest-session.`), so neither kind of session is ever accepted
where the other is expected.

Core
- `GET /health` -> `{status, database, version, time}`
- `POST /auth/login` `{email, password}` -> `{token, user}`; `GET /auth/me`
- `GET /venues`, `POST /venues`, `GET /venues/{venue_public_id}`
- `PUT /venues/{venue_public_id}/layout` full layout (zones, tables, seats); upsert by id, rebuilds `seat_neighbours`
- `POST /demo/reset` (needs the `X-Demo-Key` header matching `DEMO_KEY`; no login is accepted, and an empty `DEMO_KEY` rejects everyone) seeds both verticals, returns entry links
- `GET /demo/links` entry points for the demo when `DEMO_MODE=1`
- `GET /live/{scope}/version` -> `{version}`; `GET /live/{scope}/stream` SSE, one `version` event per change, closes after about 25 s; 429 when one address opens too many streams or the instance already serves many (the browser then polls)
- Any route: when Postgres aborts a transaction to break a deadlock or a serialization conflict, the answer is 409 `conflict` "please try again" (nothing was saved)
  Scopes: `event-{event_public_id}`, `venue-{venue_public_id}-{yyyy-mm-dd}`

Events, organiser (`/events`)
- `POST /events`, `GET /events`, `GET /events/{eid}` (full map with real names and who has not chosen), `PATCH /events/{eid}`
- `GET|POST /events/{eid}/guests`, `PATCH|DELETE /events/{eid}/guests/{gid}` (delete erases personal data), `POST .../guests/{gid}/new-link` (revokes the old token)
- `POST /events/{eid}/guests/import` CSV as the raw request body (`Content-Type: text/csv`), all rows or none; `GET /events/{eid}/export.csv`; `GET /events/{eid}/chart` (print data: seating chart, place cards)
- `PUT /events/{eid}/assignments/{gid}` `{seat_id}`, `DELETE` same path (organiser move)
- `POST /events/{eid}/optimise/autofill` `{seed, max_iterations}` -> scenario (not applied); `POST /events/{eid}/optimise/replan` -> scenario
- `POST /events/{eid}/scenarios/{sid}/apply`; `GET /events/{eid}/scenarios`; `GET /events/{eid}/scenarios/compare?a=&b=`
- `POST /events/{eid}/whatif` `{moves:[{guest_id, seat_id}]}` -> score before, after, per-term delta
- `POST /events/{eid}/undo`, `POST /events/{eid}/redo`
- `POST /events/{eid}/optimise/exact-check` `{table_ids?}` -> heuristic score, optimal score, `heuristic_seated`, `exact_seated`, gap % (`gap_percent` is null when the two plans seat a different number of guests), a plain-language `note`, timings

Events, attendee (`/a/{token}`)
- `GET /a/{token}` -> event, venue name, me (with `held_seat_id` and `held_until`), seat map with states, visible people (names per privacy rules)
- `GET /a/{token}/people?q=` search among the visible people (searches only the name this attendee may see)
- `POST /a/{token}/rsvp`, `POST /a/{token}/knows` `{guest_ids}`, `POST /a/{token}/privacy` `{wants_anonymous}`
- `GET /a/{token}/recommendations` -> top seats, each with `rank` (1 = best), `match` (`strong`, `some` or `none`) and plain-language reasons. No raw score: it counts only the guest's own list, so it cannot reveal who listed this guest
- `POST /a/{token}/hold` `{seat_id}` -> `{expires_at}` or 409; `POST /a/{token}/confirm` `{seat_id}`; `DELETE /a/{token}/seat`

Events, shared link and guest accounts (full shapes, errors and limits in `docs/guest-accounts.md` section 6)
- Organiser: `GET|PATCH /events/{eid}/share` `{enabled?, cap?}` -> `{enabled, link, needs_new_link, cap, joined, capacity, guests, places_left}`; `POST /events/{eid}/share/regenerate` (the old link stops at once). Guest rows gain `source` and `has_account`
- Visitor: `GET /j/{token}` -> event, venue name, seat map (states `free`, `held`, `taken`, `blocked`; names per `core/privacy.py`), `join {open, places_left, reason}`. A visitor can never hold or confirm. `POST /j/{token}/register` `{name, email, password, needs_accessible, consent}` -> 202 `{status, sent_to, expires_in_seconds, signup_id, demo_code?}` (the same answer whether or not an account exists; never refused because the event is full). `POST /j/{token}/join` (guest session) -> `{status, event_id}`
- Account: `POST /guest/verify` `{email, code, signup_id}` -> 201 `{token, account, join}`; `POST /guest/login`, `POST /guest/logout`, `POST /guest/password/forgot`, `POST /guest/password/reset`, `GET /guest/me`, `POST /guest/me/delete` `{password}`
- The account holder's event: `/guest/events/{eid}` plus `/people`, `/rsvp`, `/knows`, `/privacy`, `/recommendations`, `/hold`, `/confirm`, `/seat`, with the same bodies and answers as the `/a/{token}` routes
- An existing guest row is linked to an account only when its email equals the account's proven address (ignoring case, `email_proven` true); typing an address alone never links
- `POST /guest/me/delete` with a wrong password is 422 `validation` (`password: That password is not correct.`), never 401

Seat states returned to the map: `free`, `held`, `taken`, `mine`, `friend`, `blocked`, plus the flag `accessible`.

Seat map payload (every map endpoint: `GET /a/{token}`, `GET /events/{eid}`,
`GET /r/{vid}/map`, `GET /staff/{vid}/floor`): `{width, height, zones, tables,
seats}` with `MapTable {id, label, shape, x, y, w, h, rotation, zone_id?,
state?, accessible?}` and `MapSeat {id, table_id, label, x, y, state,
accessible, occupant?}`. `occupant` is a name already filtered by
`core/privacy.py`. Endpoints may add fields of their own (decisions log).
Types: `frontend/src/api/types.ts`.

Restaurants, diner (`/r/{venue_public_id}`)
- `GET /r/{vid}` restaurant, zones, schedule summary, `max_party` (the largest party one table or allowed combination and the covers cap can seat, at most 30; a bigger party gets 422 on slots, map, hold, change and waitlist)
- `GET /r/{vid}/slots?date=&party=` -> time slots with `available`, `limited`, `full`
- `GET /r/{vid}/map?date=&time=&party=` -> tables with state for that slot, recommended table and reasons
- `POST /r/{vid}/hold` `{date, time, party, table_id?}` (no table: optimiser picks) -> `{hold_id, table, expires_at}`. 429 `rate_limited` when one client already holds 3 tables for that date, or when live holds would block more than half the tables of a slot
- `DELETE /r/{vid}/hold/{hold_id}` gives a held table back -> 204, or 404 for an unknown hold
- `POST /r/{vid}/bookings` `{hold_id, name, email, ...}` -> confirmation with manage link. 429 `rate_limited` when this mailbox already has 4 upcoming diner bookings at this restaurant (capitals and a `+tag` count as the same mailbox), or this client address (an IPv6 address by its /64) has made 10 booking attempts here today (UTC); a refused booking keeps its hold (`restaurant_service/booking_caps.py`)
- `POST /r/{vid}/waitlist` -> position and estimated wait
- `GET /b/{manage_token}` (includes the venue's `max_party`), `PATCH /b/{manage_token}`, `DELETE /b/{manage_token}`

Restaurants, staff (`/staff/{venue_public_id}`)
- `GET /staff/{vid}/floor?date=&time=` tables with status `free`, `reserved`, `seated`, `finishing`
- `POST /staff/{vid}/walkins` (optional `date`, default today), `POST /staff/{vid}/bookings/{bid}/status`, `POST /staff/{vid}/bookings/{bid}/move` `{table_ids}`
- `POST /staff/{vid}/whatif` `{party_size, time, date?}` -> best table, what it displaces
- `POST /staff/{vid}/optimise/service` `{date, service, seed?, apply?, plan_id?}` -> preview of who moves where (only `auto` confirmed bookings), covers seated and seats wasted before and after, and a `plan_id`; a second call with `apply: true` and that `plan_id` writes it, or 409 when the floor changed
- `POST /staff/{vid}/optimise/exact-check` `{date, service, max_parties?}` (default 8, at most 12) -> heuristic score, proven optimum, gap, `matches_optimum`, `capped`
- `GET /staff/{vid}/dashboard?date=` covers (booked and `seated`, also per service as `covers_seated`), utilisation, no-show rate, overbooking suggestion
- `GET|PUT /staff/{vid}/schedule`

Email
- `POST /internal/email/process` (header `X-Cron-Secret`) sends due outbox rows; `GET /emails/log` (organiser)

## 6. Optimiser interfaces (pure functions)

Determinism rule: **the iteration budget is the stopping rule.** A wall-clock
limit exists only as a safety cut-off and is set high enough that it never fires
on demo data, because a time limit alone would make results depend on machine
speed. It is 15 s for both optimisers: low enough that, with an exact check
in the same request, the answer comes back before Vercel's 30 s limit. Same problem + same seed = same result. All randomness comes from one
`random.Random(seed)` passed down explicitly.

Events (`optimiser/events_*.py`)

```python
@dataclass(frozen=True)
class SeatSpec:  id: int; table_id: int; x: float; y: float; accessible: bool; blocked: bool; reserved_tag: str | None
@dataclass(frozen=True)
class GuestSpec: id: int; group_id: int | None; keep_adjacent: bool; needs_accessible: bool; reserved_tag: str | None; knows: frozenset[int]
@dataclass(frozen=True)
class Weights:   friend_adjacent: float = 10; friend_same_table: float = 4; group_adjacent: float = 15; group_same_table: float = 6; change_penalty: float = 8
@dataclass(frozen=True)
class EventProblem:
    seats: tuple[SeatSpec, ...]; guests: tuple[GuestSpec, ...]
    neighbours: Mapping[int, frozenset[int]]      # seat id -> adjacent seat ids
    fixed: Mapping[int, int]                      # guest id -> seat id; human choices, never moved
    weights: Weights
Assignment = dict[int, int]                        # guest id -> seat id

def check_hard(problem, assignment) -> list[str]            # empty list = feasible
def score(problem, assignment) -> ScoreBreakdown            # total + one number per term
def greedy(problem, seed) -> Assignment
def anneal(problem, start, seed, max_iterations, time_limit_s) -> Assignment
def solve(problem, seed=0, max_iterations=20000) -> SolveResult   # greedy then anneal
def replan(problem, previous, seed=0, ...) -> SolveResult   # adds change_penalty per moved guest
def recommend(problem, current, guest_id, top=5) -> list[Recommendation]  # seat_id, gain, reasons[str]
def solve_exact(problem, time_limit_s) -> ExactResult       # CP-SAT, else branch and bound; small instances
```

Hard constraints: one guest per seat; blocked seats unused; a reserved seat only
takes a guest with the same tag; a guest who needs accessibility only gets an
accessible seat; `fixed` pairs are kept exactly. Soft terms: as in `Weights`.

Restaurants (`optimiser/restaurant_*.py`)

```python
@dataclass(frozen=True)
class TableSpec: id: int; min_party: int; max_party: int; zone: str; accessible: bool; high_chair_ok: bool; combine_group: str | None
@dataclass(frozen=True)
class PartySpec: id: int; size: int; start_slot: int; end_slot: int; needs_accessible: bool; high_chairs: int; zone_pref: str | None; fixed_tables: tuple[int, ...] | None; label: str = ""  # a name for messages, never a database id

def recommend_table(tables, busy, party, top=3) -> list[TableChoice]      # table_ids, waste, reasons
def assign_service(tables, parties, seed=0, max_iterations=...) -> ServicePlan  # who sits where, who is unseated
def whatif_walkin(tables, parties, plan, walkin) -> WalkinAnswer          # best table, displaced parties
def assign_exact(tables, parties, time_limit_s) -> ExactPlan
```

Hard: a table hosts one party at a time (slot overlap); party size fits the table
or the combined tables; accessibility and high-chair needs are met; `fixed_tables`
(a diner's own choice) are never changed. Objective: seat the most covers, then
waste the fewest seats (protect big tables for big parties), then honour zone
preference.

Routers convert database rows into these dataclasses, call the pure function, and
store the result. The optimiser never imports the database.

## 7. Security rules every module follows

- Secrets come from environment variables via `config.py`. Nothing secret in code, tests or seed data.
- Only SQLAlchemy queries with bound parameters. No string-built SQL.
- Every request body is a Pydantic model with length limits. Unknown fields are rejected.
- Public endpoints are rate limited through `security.rate_limit(key, limit, window_s)` (database-backed, so it works across serverless instances).
- Token lookups compare hashes; a wrong token and a revoked token return the same 404.
- Other attendees never receive email, dietary or accessibility data. Names pass through `core/privacy.py`. Visitors on a shared link get the same filtered names and no people list.
- Secrets in emails: account emails carry no secret link (the seat page needs a sign-in); emailed codes are stored only as keyed hashes and are blanked from outbox rows once those are finished.
- The seat picture is drawn from zones, tables and seats only; its inputs have no field for a person, so it can never show a name.
- CORS allows only the configured frontend origin. React escapes output; never use `dangerouslySetInnerHTML`.
- Fake people only: names are invented, emails end in `@example.com`.

## 8. Code style for the walkthrough

Small modules with one job. Type hints everywhere. Comments explain **why**, not
what. No dead code, no clever one-liners. Functions under about 40 lines. Each
package gets a `READ_ME_FIRST.md`: purpose, key functions, data flow, three
likely walkthrough questions with answers.

## 9. Environment variables

`DATABASE_URL`, `SECRET_KEY`, `FRONTEND_ORIGIN`, `DEMO_MODE`, `DEMO_KEY`,
`CRON_SECRET`, `EMAIL_PROVIDER` (`console` or `resend`), `RESEND_API_KEY`,
`EMAIL_FROM`, `EMAIL_ALLOWLIST` (comma-separated addresses that may receive real
email; everything else is logged as `skipped`), `PUBLIC_BASE_URL`,
`DEMO_ORGANISER_PASSWORD`, `DEMO_STAFF_PASSWORD` (demo accounts; the public
documented defaults apply only on local SQLite with `DEMO_MODE=1`, never on
Postgres). `SECRET_KEY` is required whenever `DATABASE_URL` is Postgres, with
at least 32 characters.

The seed command is `cd backend && python -m app.seed.run` (the backend
package is imported as `app` everywhere: tests, seed and `api/index.py`).
Tables on Postgres come only from `cd backend && python -m app.seed.migrate`;
the app never runs DDL there. Migrate creates missing tables, then adds the
missing columns and indexes named in its own fixed lists (`NEW_COLUMNS`,
`NEW_INDEXES`), checking the database first so it can run again safely on
SQLite and Postgres. No new environment variable is needed for guest
accounts; `EMAIL_ALLOWLIST` still decides who really receives email,
including sign-up codes (`docs/guest-accounts.md`, D7).


## 10. Restaurant platform extension (approved 2026-11-13)

The detailed restaurant specification is docs/superpowers/specs/2026-11-13-restaurantes-plataforma-design.md. Existing event contracts remain the compatibility baseline. New restaurant routes live under /api/owner, /api/restaurants and /api/photos. Owner identity uses organisers with role organiser and the existing signed session. Missing and inaccessible resources use the same 404.

Room coordinates are centimetres, x right and y down. Table x/y remain the unrotated bounding box origin, with rotation around its centre. Each outline has 3-60 points and each point carries the signed sagitta of its outgoing circular side. Clockwise screen winding is canonical. Reverse winding remaps opening side and arc offset as well as curve signs. Geometry polygon approximation uses 16 segments per curved side for validation. Each room holds up to 200 tables, 1000 seats, 60 openings, 100 fixtures and 50 zones. A venue holds at most five rooms.

GET/PUT owner rooms use the nested payload of specification 6.10 with stable ids and temporary keys. PUT uses base_version against venues.layout_version in one conditional write and transaction. Success returns version, rooms and problems. A stale write returns HTTP 409 with error.code stale_layout. Structurally valid drafts may carry geometric problems. Invalid references, cross-owner ids and malformed numeric input are refused. Publication repeats validation. Layout persistence preserves table and seat ids referenced by bookings.

The map retains width, height, zones, tables, seats, recommended and slot_status. Additive restaurant fields include rooms and table room_id/is_active/ambience. Room drawing fields include outline, openings, fixtures, sun, sun_patches and night. Inactive tables are excluded from public availability and new assignment, while historical staff display remains possible. Existing rooms with null room_id are exposed as one implicit rectangular Main room until first save.

Ambience inputs are frozen dataclasses and have no database or network dependencies. Public results follow specification 7.5. Computation samples the half-open stay interval every 15 minutes. Missing location or north never produces an affirmative sunlight claim. Date conversion uses the venue time zone and UTC-aware instants. The editor previews the last saved draft through the server endpoint. Instant browser solar calculation is optional and deferred.

New JSON bodies reject unknown fields and constrain free text with PlainText. Existing error envelope error/code/message remains mandatory. Publication may add problems containing code/message/fix_url to that envelope. Room version conflicts may add problem details without replacing the existing envelope. Public responses carry no diner names, email addresses or notes.

Only leaflet@1.9.4 and @types/leaflet are allowed additions. Shared file edits are serial. The overnight plan and report record task dependencies, verification results and conservative deviations.

Owner profiles: POST /api/owner/restaurants {name} creates an owned draft at
1000x700 cm and returns public_id/slug. GET/PATCH
/api/owner/restaurants/{vid}/profile reads or partially updates identity and
location (the canonical read URL is /api/owner/restaurants/{vid}; /profile is
also accepted for reads). Coordinates are supplied as a pair; known timezones and 1–3 distinct
fixed-list cuisines are required when supplied. Conflicting slugs and attempts
to change a published slug return 409. Missing and inaccessible profiles return
the same 404. Unknown fields return 422. Setup uses these persisted values.
Geolocation permission is self-only; camera/microphone remain disabled. Image
CSP permits self, OSM tiles and data images used internally by Leaflet when
cancelling tiles. No script or style policy relaxation is required.

Owner photos use JSON {kind, opening_key?, content_type, data_base64, alt_text}.
POST /owner/restaurants/{vid}/photos returns metadata including id/public_id,
url, actual content_type, width/height, opening_id, position and is_cover.
GET on the same path lists metadata only. PATCH /{photo_id} changes alt_text;
PUT /order requires the exact gallery photo_ids list and cover_id; DELETE
/{photo_id} removes a photo and preserves a cover if any gallery photos remain.
All routes require the owner, with 404 for foreign restaurants/photos. Uploads
are limited to 60/hour/owner, 10 gallery photos and one view per saved window.
Decoded bytes are at most 800000, dimensions 1–1600 px; the declared media type
does not determine storage. Header checks cover PNG/JPEG/WebP, without a full
pixel decoder. GET /photos/{public_id} serves draft bytes only to the owner,
private/no-store; published bytes use public,max-age=31536000,immutable.
img-src also permits blob: for authenticated previews and local resizing.

Layout validation returns {code, level: error|warning|info, message, room_key,
table_keys, opening_key?, fixture_key?}. Global no_tables uses room_key=null.
Codes follow spec 6.9. no_north and no_tables are publication-only. Geometry
errors remain saveable as drafts; malformed values and invalid references are
handled separately. Join-group penetration tolerance is 2 cm, actual boundary
touch has zero overlap, and passage footprints expand tables by 45 cm. Inactive
tables remain physical for passage/fixture warnings. Browser/server reference
cases cover curves, rotations, true circles, concavity and publication mode.
