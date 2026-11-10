# SeatPlan

SeatPlan lets people choose their own seat on a live 2D map. Two verticals share
one core:

- **Events:** an attendee opens a personal link, says who they know, sees who
  sits where (names follow the event's privacy rules) and picks a seat. The
  organiser sees the full map, auto-fills the people who did not choose, and
  re-plans with as few moves as possible.
- **Restaurants:** a diner picks a date, party size, time and table. Staff see a
  live floor, seat walk-ins, ask "what if" questions and read a dashboard.

An optimiser recommends seats and tables and explains why. Human choices and
hard rules (one person per seat, accessibility, reserved seats, table sizes)
are never broken. The database itself makes double booking impossible: every
seat, table slot and hold is protected by a UNIQUE constraint.

It is a university project (Introduction to Programming, Nova SBE). The design
agreement between all modules is [`docs/CONTRACT.md`](docs/CONTRACT.md); every
deviation from it is explained in [`docs/decisions-log.md`](docs/decisions-log.md).

## Quick start

You need Python 3.12 and Node 22 (CI uses 22; development used 24).
Run every command from the repository root unless it says `cd`.

### 1. Backend

```bash
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt -r backend/requirements-dev.txt
cd backend
export DEMO_MODE=1
../.venv/bin/python -m app.seed.run
../.venv/bin/uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000
```

The seed command creates `backend/seatplan.db` (SQLite), two demo accounts and
both demo verticals, and prints the entry links (for example `/e/<token>` for an
attendee or `/r/<id>` for the restaurant). Run it from `backend/`: the backend
package is imported as `app` everywhere (tests, seed, `api/index.py`).

Check it works: `curl http://127.0.0.1:8000/api/health` answers
`{"status":"ok","database":"ok",...}`.

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open <http://localhost:5173>. The home page lists the demo links. The dev
server forwards `/api` to the backend on port 8000, so the browser only ever
talks to one address (as on Vercel).

### 3. Demo accounts

Locally (SQLite) with `DEMO_MODE=1` and no password variables set, the seed
uses the public demo passwords in `backend/app/seed/run.py`. On Postgres, that
is on any deployment, those defaults never apply: `DEMO_ORGANISER_PASSWORD` and
`DEMO_STAFF_PASSWORD` must be set to private values, shared only with the
people who need them.

| Account | Email | Opens |
|---|---|---|
| Organiser | `organiser@example.com` | `/organiser/<event id>` |
| Staff | `staff@example.com` | `/staff/<venue id>` |

`POST /api/demo/reset` wipes the demo data and seeds it again; it returns
fresh links for both verticals. Only the header `X-Demo-Key` matching
`DEMO_KEY` may call it (no login is accepted), and an empty `DEMO_KEY` means
nobody can.

## Running the tests

| What | Command |
|---|---|
| Backend lint | `cd backend && ../.venv/bin/ruff check .` |
| Backend formatting | `cd backend && ../.venv/bin/ruff format --check .` |
| Backend tests (all) | `cd backend && ../.venv/bin/python -m pytest` |
| End-to-end smoke test only | `cd backend && ../.venv/bin/python -m pytest tests/test_e2e_slice.py` |
| Backend tests on Postgres (opt-in) | `cd backend && SEATPLAN_TEST_POSTGRES='postgresql://user@127.0.0.1:5432/postgres' ../.venv/bin/python -m pytest` |
| Frontend types | `cd frontend && npm run typecheck` |
| Frontend unit tests | `cd frontend && npm test` |
| Frontend build | `cd frontend && npm run build` |
| Colour contrast | `cd frontend && npm run contrast` |
| Python dependency audit | `.venv/bin/pip-audit -r requirements.txt` |
| npm dependency audit | `cd frontend && npm audit --audit-level=high` |

Every backend test uses its own SQLite file inside pytest's temporary folder,
so tests never share data. With `SEATPLAN_TEST_POSTGRES` set to a Postgres
server URL, each test instead gets its own new database on that server,
dropped afterwards (`backend/tests/conftest.py`); the user in the URL must be
allowed to create databases. One test, about table creation on local SQLite,
is skipped there. `tests/test_e2e_slice.py` walks both verticals
through the real HTTP API, starting from `POST /api/demo/reset`.

The same checks (all rows above), plus a gitleaks secret scan, run in GitHub
Actions on every pull request and every push to `main`
(`.github/workflows/ci.yml`). There is no browser test suite: the browser check
in the test report below was done by hand.

## Environment variables

Copy `.env.example` to `.env` for your own reference, or set these in the
Vercel project settings. The backend reads the process environment only, so
locally `export` the ones you need before starting it.

| Variable | Meaning | Local default |
|---|---|---|
| `DATABASE_URL` | Postgres URL in production; empty means `backend/seatplan.db` | empty |
| `SECRET_KEY` | Signs login sessions. Required whenever `DATABASE_URL` is Postgres (the app refuses to start without it, demo mode or not) | random per process |
| `FRONTEND_ORIGIN` | The only browser origin allowed by CORS | `http://localhost:5173` |
| `PUBLIC_BASE_URL` | Base of the links written in emails | `http://localhost:5173` |
| `DEMO_MODE` | `1` turns on `/api/demo/*` (demo links and reset) | off |
| `DEMO_KEY` | The only way to call `POST /api/demo/reset` (header `X-Demo-Key`); empty means nobody can | empty |
| `DEMO_ORGANISER_PASSWORD`, `DEMO_STAFF_PASSWORD` | Demo account passwords; required on Postgres and whenever `DEMO_MODE` is off | public demo values (local SQLite only) |
| `CRON_SECRET` | Header `X-Cron-Secret` for `POST /api/internal/email/process`; empty rejects every call | empty |
| `EMAIL_PROVIDER` | `console` (prints emails) or `resend` | `console` |
| `RESEND_API_KEY` | Only for `EMAIL_PROVIDER=resend` | empty |
| `EMAIL_FROM` | Sender, for example `SeatPlan <noreply@example.com>` | as shown |
| `EMAIL_ALLOWLIST` | Comma-separated addresses that may receive email; everyone else is logged as `skipped`. Empty means nobody | empty |

Emails are never sent from a request. They are queued in the `email_outbox`
table and sent by `POST /api/internal/email/process`, which
`.github/workflows/email-cron.yml` calls every 15 minutes. That workflow needs
two repository secrets: `SEATPLAN_URL` (the deployed site) and `CRON_SECRET`.
Resend only sends from a domain you own and have verified; without one the demo
stays on the console provider. Details: [`docs/email.md`](docs/email.md).

## Deploying to Vercel

1. Create the Postgres database and set the environment variables above in the
   Vercel project (`DATABASE_URL`, `SECRET_KEY`, `FRONTEND_ORIGIN`,
   `PUBLIC_BASE_URL`, and the demo and email ones you need). A pooled URL from a
   hosting integration works: query options that libpq does not know (such as
   `supa=` or `pgbouncer=`) are dropped by `config.py`.
2. Create the tables once, from your machine, with the production URL:

   ```bash
   cd backend
   DATABASE_URL='<the Postgres URL>' SECRET_KEY='<the same key as on Vercel>' ../.venv/bin/python -m app.seed.migrate
   ```

   The app never creates tables on Postgres: several serverless instances
   starting at the same moment would race on `CREATE TABLE`. The command is
   safe to run twice or in parallel (it takes a Postgres advisory lock). It
   only adds missing tables; a new column or constraint on an existing table
   is not applied, because there is no migration tool. Such a change needs a
   hand-written `ALTER TABLE` or a fresh database.
3. Optionally seed the demo with `python -m app.seed.run` (same variables,
   plus `DEMO_MODE=1` and the two demo passwords).
4. Push to `main`; Vercel builds the frontend and serves `api/index.py`.

`vercel.json` adds security headers to every page, including the static
frontend: `X-Frame-Options: DENY` and a Content-Security-Policy with
`frame-ancestors 'none'` (no framing), `Referrer-Policy: no-referrer` (the
personal `/e/<token>` and `/b/<token>` links never leak to other sites) and
`X-Content-Type-Options: nosniff`. The API sets its own headers too.

Live updates: pages open the 25-second event stream
(`GET /api/live/{scope}/stream`) and reconnect when it ends. When the stream
fails or is refused, they poll `GET /api/live/{scope}/version` every 2 seconds
instead. The stream is refused (429) when one address opens more than 30
streams a minute or the instance already serves 50. Not checked on Vercel: if
the platform buffers the stream, changes arrive late instead of falling back to
polling.

## Repository map

| Folder | What lives there |
|---|---|
| `api/` | Vercel entry point: `index.py` exposes the FastAPI app |
| `backend/` | Python backend; run pytest, ruff and the seed from here |
| `backend/app/` | App factory, settings, database, models, security |
| `backend/app/core/` | Shared building blocks: holds, live updates, audit log, privacy, layout |
| `backend/app/routers/` | One file per group of HTTP endpoints (contract section 5) |
| `backend/app/events_service/` | The logic behind the events and attendee endpoints |
| `backend/app/restaurant_service/` | The logic behind the diner, manage-link and staff endpoints |
| `backend/app/optimiser/` | Pure-Python optimisers (no database): events and restaurants, heuristics and exact checks |
| `backend/app/mail/` | Outbox, email templates, calendar invites, email providers |
| `backend/app/seed/` | Demo data for both verticals and the seed command |
| `backend/tests/` | pytest tests, one file per module, plus the end-to-end smoke test |
| `backend/scripts/` | Gap reports that compare the heuristics with proven optima |
| `frontend/` | React + TypeScript + Vite app |
| `frontend/src/design/` | Design tokens and shared components (Button, Dialog, Toast, ...) |
| `frontend/src/seatmap/` | The hand-written SVG seat map (pan, zoom, keyboard) |
| `frontend/src/api/` | Typed API client and the live-updates hook |
| `frontend/src/pages/events/` | Attendee flow and organiser workspace |
| `frontend/src/pages/restaurant/` | Diner booking, manage-or-cancel page, staff floor |
| `frontend/src/pages/editor/` | Floor-plan editor for both kinds of venue |
| `frontend/scripts/` | Colour contrast checker |
| `docs/` | Contract, decisions log, optimiser notes, email design, user guides, UX notes |
| `.github/workflows/` | CI (`ci.yml`) and the email cron (`email-cron.yml`) |

Each backend package (`backend/app` and every folder in it) has a
`READ_ME_FIRST.md` with the key functions, the data flow and likely walkthrough
questions. On the frontend there is one in `frontend/` and one in each of
`src/api/`, `src/seatmap/`, `src/design/`, `src/pages/events/`,
`src/pages/restaurant/` and `src/pages/editor/`.

## Test report

Real output observed on 2026-11-10 (macOS, Python 3.12.13, Node 24.17.0).

| Check | Result |
|---|---|
| `ruff check .` (backend) | `All checks passed!` |
| `ruff format --check .` (backend) | `134 files already formatted` |
| `pytest` (backend, 40 `test_*.py` files, SQLite) | `431 passed, 1 warning` |
| `pytest` with `SEATPLAN_TEST_POSTGRES` (local Postgres 16.2) | `430 passed, 1 skipped, 1 warning` (the skipped test is the SQLite-only one) |
| `pytest tests/test_e2e_slice.py` | `2 passed, 1 warning` (run 3 times, passed each time) |
| `npm run typecheck` | no errors |
| `npm test` (frontend) | `Test Files 15 passed (15)`, `Tests 132 passed (132)` |
| `npm run build` | `✓ built in 146ms` |
| `npm run contrast` | `86 checks, 0 failures.` |
| `npm audit --audit-level=high` | `found 0 vulnerabilities` |
| `pip-audit -r requirements.txt --no-deps --disable-pip` | `No known vulnerabilities found` (direct dependencies only; the full run with transitive dependencies happens in CI) |
| Headless Chromium, by hand (no script in the repository), at 390x844 and 1440x900, against the built app served with the `vercel.json` headers and a seeded SQLite backend | attendee to a confirmed seat (on the phone by tapping the map), organiser auto-fill preview, apply, undo and exact check, diner booking to the confirmation page, cancel through the manage link, staff walk-in: all finished, with no console errors, no failed requests, no Content-Security-Policy violation and no sideways scrolling |

The one pytest warning is Starlette asking for the `httpx2` package in its test
client; it does not come from SeatPlan code.

Also checked on that local Postgres 16.2 (not in CI): `app.seed.migrate` and
`app.seed.run` on an empty database; eight `app.seed.migrate` runs started
together on an empty database, three rounds, all succeeded, with a
pooled-style URL carrying `supa=` and `pgbouncer=` options; two guests racing
for one seat (one confirming, one holding) give 200 and a clean 409, where the
old lock order gave a deadlock and a 500; four auto-fills at once save
scenarios 1 to 4, never a duplicate number.

Not verified: a real Vercel deployment (including whether it buffers the live
stream), real email delivery through Resend, the gitleaks scan (it runs only
in CI), screen readers and real touch devices.
