# Test report

What each layer of tests checks, how to run it, and what we saw when we ran
it. Every result line below was copied from a run on 2026-11-10 on macOS
(Python 3.12.13, Node 24.17.0, Playwright 1.64.1 with Chrome Headless Shell
156.0.8078.4). CI uses Node 22 and Ubuntu.

Run every command from the repository root unless it starts with `cd`.

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
| accessibility (6 pages) | axe-core finds no WCAG 2.1 A or AA problem on the home, sign-in, attendee, booking, organiser and staff pages |

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
- **Real email delivery through Resend:** not done yet. Tests fake the provider.
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
