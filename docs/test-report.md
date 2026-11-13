# Test report

What each layer of tests checks, how to run it, and what we saw when we ran
it. The historical sections below describe runs on 2026-11-10 on macOS
(Python 3.12.13, Node 24.17.0, Playwright 1.64.1 with Chrome Headless Shell
156.0.8078.4). CI uses Node 22 and Ubuntu.

Run every command from the repository root unless it starts with `cd`.

## Restaurant integration — Windows, 2026-11-13

Branch `martim/restaurantes-impl`, Claude integration `31cc829`; no push/PR or
deployment. The merge baseline passed Ruff, 821 pytest, 350 Vitest, typecheck,
build, 86 contrast checks and 54 Playwright tests. Task 37 added a strict
60-table/120-chair/two-room HTTP benchmark and room/light/chair/concurrent-hold
journeys. Task 38 added owner publication boundaries; its discovery portion
remains blocked because discovery/public-slug pages are not implemented.

Latest fully green pre-review point `4bb515a`: 822 pytest (3 warnings,
144.58 s), 350 Vitest in 48 files, typecheck, build 333 ms, contrast 86/0,
59 Playwright in 1.2 min. Cold/warm map response samples were
229.75/218.65/141.83 ms, all below 300 ms.

The final review adds HTTP regressions for opening clocks/references/spans,
clockwise normalization with curved windows, cross-room groups, invalid
published edits and preserved manage links. Browser/server area boundaries
match. Frontend tests cover damaged local storage and the explanation of an
automatic return to draft. Full mobile editor actions now use real taps.
Six directed owner/editor checks passed in 15.7 s; 52 directed backend checks
passed in 11.68 s. Final suite results are recorded in the
[night report](superpowers/plans/relatorio-noite.md).

Final sequential run after recovery: **837 pytest passed**, 3 warnings in
176.92 s; Ruff check/format (203 files), typecheck, **355 Vitest / 48 files**,
build 364 ms, **86 contrast checks / 0 failures**, **60 Playwright passed
(1.2m)** on ports 18765/14317 with per-process traces. Map response samples:
236.17/222.07/158.32 ms, each below 300 ms. No isolated rerun was needed.
Protected-path guard and diff check passed. OpenAPI export is stable across
two runs: 93 paths, 108 operations, 62 schemas.

A first full review run was **not accepted**: 836 pytest passed but the map
budget failed under load (670/473/323 ms); Playwright had 53 passed and seven
trace-file ENOENT failures in its globally shared output folder. The patch was
preserved, branch verified, `git reset --hard 4bb515a` performed as authorized,
and the report restored. Output is now per Playwright process; the next full
verification runs backend and frontend sequentially with separate browser
ports. No assertions, tests or the 300 ms budget were relaxed.

The benchmark uses a fresh API process against the real fixture database,
with normal GC and no warmup/retry; its three responses must all fit the budget
and contain all 60 tables, 120 chairs, two rooms and ambience. Earlier probes
identified 237–296 ms GC pauses scanning prior pytest object graphs, which
motivated process isolation. This local result does not measure deployment
cold starts, network latency or discovery.

Actual Windows variants:

```powershell
cd backend
..\.venv\Scripts\ruff.exe check .
..\.venv\Scripts\ruff.exe format --check .
$seatplanTestTemp=Join-Path $env:TEMP ('seatplan-check-'+[guid]::NewGuid().ToString('N'))
..\.venv\Scripts\python.exe -m pytest -q -o addopts= -p no:cacheprovider --basetemp $seatplanTestTemp
cd ..\frontend
npm run typecheck
npm test
npm run build
npm run contrast
$env:E2E_PYTHON=(Resolve-Path '..\.venv\Scripts\python.exe').Path
$env:E2E_API_PORT='18765'
$env:E2E_WEB_PORT='14317'
npm run e2e
cd ..
.\.venv\Scripts\python.exe scripts/check_forbidden_paths.py --base main
.\.venv\Scripts\python.exe scripts/export_openapi.py
```

Only the two tests explicitly authorized by Martim may be retried alone to
accept a full-suite result: concurrent guest verification and the redteam S1
calendar-minute login limit. PostgreSQL, physical phone sensors, real tile
delivery under production headers and actual new restaurant email delivery
were not verified. See the [acceptance matrix](restaurant-final-review.md)
for missing functionality; a green suite does not mean the whole spec is done.

## The layers

### 1. Unit tests

Small, fast checks of one module at a time.

- **Backend** (`backend/tests/`, pytest): the optimisers' hard rules and
  scores, holds, privacy rules, password hashing and tokens, settings, models,
  seed data, and each router. Every test gets its own SQLite file in pytest's
  temporary folder, so tests never share data.
- **Frontend** (`frontend/src/**/*.test.ts(x)`, vitest with jsdom): the seat
  map (keyboard, labels, states), the design components, and the rules behind
  the attendee, organiser, diner and staff screens.

```bash
cd backend && ../.venv/bin/python -m pytest
cd frontend && npm test
```

### 2. Property-based tests

Instead of a few hand-picked examples, Hypothesis invents many random inputs
and checks that a rule always holds, for example "the optimiser never puts
two guests on one seat" or "a guest who needs an accessible seat only gets
one". There are 12 such tests in 5 files (`test_optimiser_events_properties.py`,
`test_optimiser_restaurant_properties.py`, `test_optimiser_restaurant_exact.py`,
`test_privacy.py`, `test_security.py`).

```bash
cd backend && ../.venv/bin/python -m pytest -m hypothesis
```

### 3. Concurrency tests

Many threads try to take the same thing at the same moment, and exactly one
may win. They prove that the database (UNIQUE constraints), not the Python
code, stops double booking:

- `test_holds.py::test_thirty_threads_race_for_one_hold`
- `test_attendee_flow.py::test_two_attendees_race_for_one_seat`
- `test_restaurant_booking_flow.py::test_twenty_threads_book_the_same_table_exactly_one_wins`
- `test_restaurant_booking_flow.py::test_covers_cap_holds_under_concurrent_confirms`

```bash
cd backend && ../.venv/bin/python -m pytest -k "race or threads or concurrent"
```

### 4. API tests (end to end through HTTP, no browser)

`backend/tests/test_e2e_slice.py` starts from `POST /api/demo/reset` and walks
both verticals through the real HTTP API in one process: an attendee holds and
confirms a seat, a second attendee gets 409, the organiser auto-fills and
applies; a diner holds a table, books and cancels, and staff ask a walk-in
"what if". Many other backend files
also call the API through FastAPI's TestClient.

```bash
cd backend && ../.venv/bin/python -m pytest tests/test_e2e_slice.py
```

### 5. Browser tests (end to end, Playwright)

`frontend/e2e/` drives the built app in headless Chromium. Each run starts the
real backend on a brand new SQLite database in a temporary folder, seeded with
the demo data, and serves the freshly built frontend with the `vercel.json`
security headers (details in `frontend/e2e/READ_ME_FIRST.md`). A test also
fails if the page throws an uncaught error or breaks the
Content-Security-Policy.

| Test | What it checks |
|---|---|
| attendee picks, holds and confirms | Reply, pick the first recommended seat, hold it (countdown shows), confirm, and the server stores that seat |
| a second attendee cannot take it | Another guest sees that seat as taken and cannot pick it; a direct hold request gets 409 `seat_taken` |
| organiser auto-fill | Preview changes nothing; apply seats more guests; Undo goes back to the earlier count |
| diner books and cancels | Date and party, a free time, "Choose for me", details, confirmation, the manage link, cancel, and the server says `cancelled` |
| staff walk-in | Sign in, move the floor to 20:00, find a table for 2, seat them, and the "Seated" count goes up by one |
| phone (390 x 844, touch) | The attendee flow by tapping the map; no sideways scrolling |
| accessibility (9 pages) | axe-core finds no WCAG 2.1 A or AA problem on the home, sign-in, attendee, booking, organiser and staff pages, and (since guest accounts) the visitor page of a shared link, its create-account form and the guest sign-in page |
| shared link: visitor (`guest-account.spec.ts`) | The visitor sees the map and places left; picking a free seat opens the join panel; no hold or confirm request is ever sent, and the API has no hold route for visitors |
| shared link: create an account | Form, demo code, "Create my account", lands on `/my/<event>` signed in |
| shared link: choose a seat | Sign in, hold, confirm; the Done step promises the email with the picture |
| shared link: the email | The organiser's email log has exactly one `seat_confirmed` row for the visitor, with `has_picture: true`; the guest list shows `source: self_registered` |
| shared link: sign out and in | "Sign out", then `/my/<event>` sends to sign-in with `next`, and signing in brings the confirmed seat back |
| shared link: second visitor | The seat shows as taken and cannot be picked; a second account's hold through the API gets 409 `seat_taken` |
| shared link: switched off | The organiser unticks "Allow people to join with the shared link"; the visitor page says "This link is closed for now" and shows no map (switched on again afterwards) |
| phone: shared link sign-up (390 x 844, touch) | The visitor page and the form have no sideways scrolling; the account is made and the seat page opens |

```bash
cd frontend
npx playwright install chromium   # once, downloads the browser
npm run e2e
```

On a Mac inside a sandboxed tool, Chromium may refuse to start
(`MachPortRendezvousServer ... Permission denied`); run it from a normal
terminal.

### 6. Email tests

The outbox (idempotency key, retries, the 10-minute `sending` claim), the
templates, the calendar invites (`.ics`, `SEQUENCE`), the reminder that
follows the seat, the providers (Resend is faked, nothing is sent; the console
provider prints), the `/internal/email/process` endpoint with its secret, and
(since security finding S9) that no finished row keeps a personal link and old
rows are emptied after 30 days.

```bash
cd backend && ../.venv/bin/python -m pytest tests/test_mail_ics.py tests/test_mail_invites.py tests/test_mail_outbox.py tests/test_mail_providers.py tests/test_mail_reminders.py tests/test_mail_router.py tests/test_mail_templates.py tests/test_outbox.py tests/test_outbox_retention.py
```

### 7. Other checks

Lint and formatting (ruff), TypeScript types, the production build, colour
contrast of the design tokens, and dependency audits. CI also runs a gitleaks
secret scan over the whole git history.

## Results on 2026-11-10

From the final verification run, after the last code change of the day (the
fixes for security findings S8 and S9 and their second review).

| Check | Command | Result line |
|---|---|---|
| Backend lint | `cd backend && ../.venv/bin/ruff check .` | `All checks passed!` |
| Backend formatting | `cd backend && ../.venv/bin/ruff format --check .` | `138 files already formatted` |
| Backend, all tests (43 files) | `cd backend && ../.venv/bin/python -m pytest` | `469 passed, 1 warning in 31.52s` |
| Backend, all tests on Postgres 16.2 | the same with `SEATPLAN_TEST_POSTGRES` set to a throwaway local cluster (deleted afterwards) | `468 passed, 1 skipped, 1 warning in 62.08s (0:01:02)` |
| Property-based only | `... -m hypothesis` | `12 passed, 457 deselected, 1 warning in 1.76s` |
| Concurrency only | `... -k "race or threads or concurrent"` | `4 passed, 465 deselected, 1 warning in 2.14s` |
| Email only | the nine email files above | `61 passed, 1 warning in 2.15s` |
| API end to end | `... tests/test_e2e_slice.py` | `2 passed, 1 warning in 1.45s` |
| Security tests | `... tests/test_redteam.py` | `12 passed, 1 warning in 1.29s` |
| Booking caps (S8) | `... tests/test_booking_cap.py` | `13 passed, 1 warning in 2.65s` |
| Outbox links and retention (S9) | `... tests/test_outbox_retention.py` | `13 passed, 1 warning in 1.07s` |
| Frontend types | `cd frontend && npm run typecheck` | no errors (exit code 0) |
| Frontend unit tests | `cd frontend && npm test` | `Test Files  15 passed (15)`, `Tests  134 passed (134)` |
| Frontend build | `npm run build` with the output sent to a temporary folder | `✓ built in 133ms` |
| Colour contrast | `cd frontend && npm run contrast` | `86 checks, 0 failures.` |
| npm audit | `cd frontend && npm audit --audit-level=high` | `found 0 vulnerabilities` |
| Python audit | `.venv/bin/pip-audit -r requirements.txt --no-deps --disable-pip` | `No known vulnerabilities found` (direct dependencies only; CI checks the transitive ones too) |
| Browser tests | `cd frontend && npm run e2e`, run 3 times | `12 passed (10.8s)`, `12 passed (10.4s)`, `12 passed (9.5s)` |

Earlier the same day, before the final accessibility fixes, the e2e work ran
the browser tests six times (`12 passed` each time) and the frontend unit
tests gave `Tests  132 passed (132)`. The final verification added one unit
test (dates in British English), which made the count 133. It was
shown to fail on the old code first: `Expected: "Saturday, 14 March 2026 at
19:30"`, `Received: "Saturday, March 14, 2026 at 19:30"`. The S8 work added
one more (the booking form shows the server's words for a 429), so the count
is now 134; it passed at once, because the form already showed any error's
message.

The new S8 and S9 tests were shown to fail on the code before each fix: the
first two S8 tests gave `2 failed, 5 passed` on the old code, the S9 file gave
`9 failed` with the new behaviour switched off (fixers' runs). The second
review then added attack tests that failed on the first fixes:
`2 failed, 11 passed` for `test_booking_cap.py` (a `+tag` email and a new IPv6
address in the same /64 both got 201), and for `test_outbox_retention.py` one
failure (a link folded across two invite lines kept the rest of its token);
with the `last_error` part of the fix taken out again, that test failed with
the token still in `last_error` (`1 failed`).

The one pytest warning is Starlette asking for the `httpx2` package in its
test client; it does not come from SeatPlan code.

To check that the browser tests can really fail, we changed the expected
answer of the second attendee's hold from 409 to 200 once: the test failed
with `Expected: 200, Received: 409`, and we changed it back.

## Results for guest accounts and the shared link (2026-11-10 to 11)

After the feature was built and reviewed (security and correctness), the
review fixes were made and everything was run again. The runs straddled
midnight; each line says which day.

| Check | Command | Result line |
|---|---|---|
| Backend, before the review fixes (10 Nov) | `cd backend && ../.venv/bin/python -m pytest -p no:cacheprovider` | `571 passed in 38.28s` |
| Backend, all tests (11 Nov, 00:01) | the same | `598 passed, 3 warnings in 66.38s (0:01:06)` |
| Backend on Postgres 16.2 (10 Nov) | the same with `SEATPLAN_TEST_POSTGRES` on a throwaway cluster, stopped and deleted afterwards | `597 passed, 1 skipped in 144.30s (0:02:24)` |
| Review-fix tests | `... pytest tests/test_guest_review_fixes.py` | `27 passed in 4.44s` |
| Migration from the old schema, Postgres | `python -m app.seed.migrate` twice on a database loaded from `tests/fixtures/schema_2026_11_10.postgres.sql` | first run: 7 `Added column ...` lines, 3 `Index ... is ready`, `Tables are ready.`; second run: no `Added` line, `Tables are ready.` |
| Backend lint and format (11 Nov) | `ruff check .`; `ruff format --check .` | `All checks passed!`; `159 files already formatted` |
| Frontend types | `cd frontend && npm run typecheck` | no errors (exit code 0) |
| Frontend unit tests | `cd frontend && npx vitest run` | `Test Files  23 passed (23)`, `Tests  209 passed (209)` |
| Colour contrast | `npm run contrast` | `86 checks, 0 failures.` |
| Build | `npx vite build --outDir "$TMPDIR/seatplan-dist"` | `✓ built in 100ms` |
| Browser tests, 3 runs | `PLAYWRIGHT_BROWSERS_PATH=... npx playwright test` | `23 passed (13.6s)`, `23 passed (13.6s)`, `23 passed (13.8s)` |
| npm audit | `npm audit` | `found 0 vulnerabilities` |
| Python audit | `.venv/bin/pip-audit -r requirements.txt` | `No known vulnerabilities found` |

**Can the new tests fail?** Each review fix was undone on its own, the
matching tests were run, and the fix was put back (a throwaway script outside
the repository). All 22 backend runs were caught, for example:

| Fix undone | Result |
|---|---|
| S30: code shown for any address | `tests/test_guest_review_fixes.py:49: AssertionError` |
| S31: no sign-up id check | `tests/test_guest_review_fixes.py:111: AssertionError` |
| S33: limits counted before the link check | `tests/test_guest_review_fixes.py:150: AssertionError` |
| S35: removed guest may rejoin | `IntegrityError` (the unique index refused the row; the test needs a clean 403) |
| S36: no `AUTOINCREMENT` | `tests/test_guest_review_fixes.py:240: AssertionError` |
| S40: compare before counting | `tests/test_guest_review_fixes.py:308: AssertionError` |
| R3: no room check on "yes" again | `tests/test_guest_review_fixes.py:363: AssertionError` |
| R6: plan sends no account email | `tests/test_account_emails.py:119: AssertionError` |
| delete with a wrong password answers 401 | `tests/test_guest_delete.py:69: AssertionError` |

The first version of the S34 test was **not** caught: it read the outbox,
whose code emails are blanked once sent. It was rewritten to read what the
(fake) provider received, and then failed as it should
(`tests/test_guest_review_fixes.py:210: AssertionError`). Five frontend
changes were undone the same way (sign-up id not sent, no "I was invited"
link, `forbidden` not read as `removed`, "1 places left", the raw delete
message): each made at least one vitest test fail.

The first Postgres run found one test bug: `test_upgraded_database_enforces_one_row_per_account_and_event`
inserted guests without an id after the fixture had written id 1 by hand, and
Postgres does not move its id counter past such rows (`duplicate key value
violates unique constraint "guests_pkey"`). The test now gives explicit ids.

## What CI runs

`.github/workflows/ci.yml`, on every pull request and every push to `main`:

| Job | Steps |
|---|---|
| `backend` | ruff check, ruff format check, pytest, pip-audit |
| `frontend` | npm ci, typecheck, vitest, build, contrast, npm audit |
| `e2e` | install both sides, install headless Chromium, `npm run e2e` |
| `secrets` | gitleaks over the whole history |

The `e2e` job and the gitleaks scan have not run on GitHub yet: not done yet.

## What is not tested

- **A real Vercel deployment:** not done yet. Nothing here runs against the
  serverless function, its 30-second limit, or real Postgres on Vercel; we
  also do not know whether Vercel buffers the live stream.
- **Postgres in CI:** CI uses SQLite. The full backend suite ran once on a
  local Postgres 16.2 in the final verification (table above); it is not
  repeated automatically.
- **Real email delivery through Resend:** not done yet. Tests fake the provider,
  so the inline seat picture (`content_id`) has not been seen in Gmail,
  Outlook or Apple Mail.
- **Live updates in the browser:** no browser test waits for a change made by
  someone else to appear through the event stream or the polling fallback.
- **Hold expiry in the browser:** the 5-minute timeout is tested in the
  backend, not by waiting in a browser.
- **The floor-plan editor, the organiser's guest import, print view and
  what-if, and the staff dashboard, optimiser and schedule tabs:** covered by
  unit and API tests only, not by browser tests.
- **Browsers other than Chromium,** real phones and real touch screens.
- **Screen readers and keyboard-only use by a person:** axe finds only the
  problems that can be read from the page code.
- **Usability sessions with real people:** not done yet.

| Usability session | Date | Who (role) | Task | What went wrong | Change made |
|---|---|---|---|---|---|
| | | | | | |

## Restaurant platform (2026-11-13, branch claude/ambiente, Windows, Python 3.13)

Run after the last commit of the plan's tasks 17 to 38:

- Backend: `pytest -q` 857 passed before the performance tests, 4 more after (the whole suite is green); `ruff check` and
  `ruff format --check` clean.
- Frontend: `npm run typecheck` clean, `npm test` 392 passed, `npm run build` ok, `npm run contrast` 86 checks, 0 failures.
- Playwright: 64 passed (desktop and phone), including the new `restaurant-ambience`, `discovery` and `owner` specs and axe scans of the
  discovery page (with real cards), the public restaurant page, the editor and the owner pages.
- Performance (local, best of five): the diner map with ambience for 60 tables under 300 ms; the discovery search over 100 restaurants
  under 500 ms, also with free times for the 20 on the page (`test_restaurant_performance.py`, `test_discovery_performance.py`).
- `scripts/check_forbidden_paths.py --base main`: "Protected event paths unchanged."

Known flaky tests that are not from this work: `test_guest_register::test_two_verifies_at_once_make_one_account` (concurrency) and
`test_redteam::test_s1_forged_forwarded_for_cannot_dodge_the_login_limit` (the limiter counts per calendar minute). Both pass alone.
