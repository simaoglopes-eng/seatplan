# SeatPlan

SeatPlan lets people choose their own seat on a live 2D map. Two verticals share
one core:

- **Events:** an attendee opens a personal link, says who they know, sees who
  sits where (names follow the event's privacy rules) and picks a seat. The
  organiser sees the full map, auto-fills the people who did not choose, and
  re-plans with as few moves as possible. The organiser can also switch on
  one **shared link** per event: anyone who opens it sees the live map as a
  visitor, and makes a **guest account** (checked by an emailed code) to
  choose a seat and get it by email with a picture of the room
  ([`docs/guest-accounts.md`](docs/guest-accounts.md)).
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
| Browser tests (Playwright, axe) | `cd frontend && npx playwright install chromium` once, then `npm run e2e` |
| Python dependency audit | `.venv/bin/pip-audit -r requirements.txt` |
| npm dependency audit | `cd frontend && npm audit --audit-level=high` |

Every backend test uses its own SQLite file inside pytest's temporary folder,
so tests never share data. With `SEATPLAN_TEST_POSTGRES` set to a Postgres
server URL, each test instead gets its own new database on that server,
dropped afterwards (`backend/tests/conftest.py`); the user in the URL must be
allowed to create databases. One test, about table creation on local SQLite,
is skipped there. `tests/test_e2e_slice.py` walks both verticals
through the real HTTP API, starting from `POST /api/demo/reset`.

`npm run e2e` starts its own backend on a new temporary SQLite database with
the demo data (port 8765) and serves a fresh build with the `vercel.json`
headers (port 4317), then drives headless Chromium through the attendee,
organiser, diner and staff flows and runs an axe-core accessibility scan on
six pages (`frontend/e2e/READ_ME_FIRST.md`). Inside a sandboxed tool on a Mac,
Chromium may refuse to start; run it from a normal terminal.

The same checks (all rows above, the Postgres run excepted), plus a gitleaks
secret scan, run in GitHub Actions on every pull request and every push to
`main` (`.github/workflows/ci.yml`). Full details: [`docs/test-report.md`](docs/test-report.md).

## Environment variables

Copy `.env.example` to `.env` for your own reference, or set these in the
Vercel project settings. The backend reads the process environment only, so
locally `export` the ones you need before starting it.

| Variable | Meaning | Local default |
|---|---|---|
| `DATABASE_URL` | Postgres URL in production; empty means `backend/seatplan.db` | empty |
| `SECRET_KEY` | Signs login sessions. Required whenever `DATABASE_URL` is Postgres, with at least 32 characters (the app refuses to start otherwise, demo mode or not) | random per process |
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

**Not done yet:** SeatPlan has never been deployed. The step-by-step plan,
with a status line per step, is [`docs/deployment.md`](docs/deployment.md).

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
   creates missing tables, then adds the columns and indexes listed in
   `NEW_COLUMNS` and `NEW_INDEXES` in `backend/app/seed/migrate.py` (today:
   the shared link and guest account columns), and nothing else: any other
   change to an existing table needs a hand-written `ALTER TABLE` or a fresh
   database. **A database made before guest accounts must run it once before
   the new code goes live** (`docs/deployment.md`, "Upgrading an existing
   database").
3. Optionally seed the demo with `python -m app.seed.run` (same variables,
   plus `DEMO_MODE=1` and the two demo passwords).
4. Push to `main`; Vercel builds the frontend and serves `api/index.py`.

`vercel.json` adds security headers to every page, including the static
frontend: `X-Frame-Options: DENY` and a Content-Security-Policy with
`frame-ancestors 'none'` (no framing), `Referrer-Policy: no-referrer` (the
personal `/e/<token>` and `/b/<token>` links never leak to other sites),
`Strict-Transport-Security` and `X-Content-Type-Options: nosniff`. The API
sets its own headers too.

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
| `frontend/e2e/` | Playwright browser tests and the two small servers they start |
| `docs/` | Contract, decisions log and every other document (see "Documentation" below) |
| `docs/usability/` | Usability test kit: script, consent form, observer sheet, SUS, empty results template |
| `docs/report/` | Project report (Markdown and PDF) |
| `docs/team/` | Team pack: tasks, issues, walkthrough questions, demo script, self-assessment, AI use |
| `.github/workflows/` | CI (`ci.yml`) and the email cron (`email-cron.yml`) |

Each backend package (`backend/app` and every folder in it) has a
`READ_ME_FIRST.md` with the key functions, the data flow and likely walkthrough
questions. On the frontend there is one in `frontend/` and one in each of
`src/api/`, `src/seatmap/`, `src/design/`, `src/pages/events/`,
`src/pages/restaurant/`, `src/pages/editor/` and `e2e/`.

## Documentation

| Document | What it answers |
|---|---|
| [`docs/CONTRACT.md`](docs/CONTRACT.md) | The design agreement: stack, layout, data model, HTTP API, optimiser interfaces, security rules |
| [`docs/decisions-log.md`](docs/decisions-log.md) | Every change to the contract, with its date and reason |
| [`docs/product-spec.md`](docs/product-spec.md) | The problem, the users, scope and user stories with acceptance criteria |
| [`docs/personas.md`](docs/personas.md) | Four assumption personas (not research) tied to real screens |
| [`docs/architecture.md`](docs/architecture.md) | Diagrams: components, hold and confirm, live updates, email outbox |
| [`docs/data-model.md`](docs/data-model.md) | The 26 tables and the constraints that stop double booking |
| [`docs/api.md`](docs/api.md), [`docs/openapi.json`](docs/openapi.json) | The HTTP API, short and in full (exported from the app) |
| [`docs/optimiser-events.md`](docs/optimiser-events.md), [`docs/optimiser-restaurant.md`](docs/optimiser-restaurant.md) | How the optimisers work and how close they get to the proven optimum |
| [`docs/email.md`](docs/email.md) | The email outbox, templates, invites and providers |
| [`docs/design-system.md`](docs/design-system.md), [`docs/ux-events.md`](docs/ux-events.md), [`docs/ux-restaurant.md`](docs/ux-restaurant.md) | Design tokens, seat states and the screen-by-screen UX notes |
| [`docs/accessibility.md`](docs/accessibility.md) | Accessibility statement (no conformance claim), WCAG 2.2 A and AA review, heuristic review |
| [`docs/usability/`](docs/usability/README.md) | Usability test kit; no session has been run yet |
| User guides: [attendee](docs/user-guide-attendee.md), [organiser](docs/user-guide-organiser.md), [diner](docs/user-guide-diner.md), [staff](docs/user-guide-staff.md) | How to use each screen |
| [`docs/guest-accounts.md`](docs/guest-accounts.md) | The shared event link and guest accounts: decisions, API, emails with the seat picture, GDPR, review fixes |
| [`docs/security.md`](docs/security.md) | Threat model, findings (fixed and open), who may call each route |
| [`docs/test-report.md`](docs/test-report.md) | Every test layer, how to run it and today's results |
| [`docs/runbook.md`](docs/runbook.md) | Running locally, environment variables, common failures |
| [`docs/deployment.md`](docs/deployment.md) | The Vercel, Neon and Resend plan (not done yet) |
| [`docs/risk-log.md`](docs/risk-log.md) | What could go wrong and what we do about it |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md), [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md), [`docs/FAQ.md`](docs/FAQ.md) | Versions, how to contribute, short answers |
| [`docs/report/PROJECT_REPORT.md`](docs/report/PROJECT_REPORT.md) ([PDF](docs/report/PROJECT_REPORT.pdf)) | The project report |
| [`docs/team/`](docs/team/tasks.md) | Who owns what, issues to open, walkthrough questions, demo script, revision plan, self-assessment, AI use |

## Test report

**Guest accounts and the shared link** (run 2026-11-10 to 11, after the
review fixes; details in [`docs/test-report.md`](docs/test-report.md)):

| Check | Result |
|---|---|
| `pytest` (backend, SQLite) | `598 passed, 3 warnings in 66.38s (0:01:06)` |
| `pytest` with `SEATPLAN_TEST_POSTGRES` (throwaway Postgres 16.2, deleted afterwards) | `597 passed, 1 skipped in 144.30s (0:02:24)` |
| `ruff check .`; `ruff format --check .` | `All checks passed!`; `159 files already formatted` |
| `npm run typecheck`; `npx vitest run` | no errors; `Test Files  23 passed (23)`, `Tests  209 passed (209)` |
| `npm run contrast`; build to a temporary folder | `86 checks, 0 failures.`; `✓ built in 100ms` |
| Playwright, three runs | `23 passed (13.6s)`, `23 passed (13.6s)`, `23 passed (13.8s)` |
| `npm audit`; `pip-audit -r requirements.txt` | `found 0 vulnerabilities`; `No known vulnerabilities found` |
| `python -m app.seed.migrate` twice on a Postgres database with the old schema | 7 columns and 3 indexes added, then nothing more the second time |

The earlier final verification, before guest accounts:

Real output observed on 2026-11-10 in the final verification (macOS, Python
3.12.13, Node 24.17.0). More detail in [`docs/test-report.md`](docs/test-report.md).

| Check | Result |
|---|---|
| `ruff check .` (backend) | `All checks passed!` |
| `ruff format --check .` (backend) | `138 files already formatted` |
| `pytest` (backend, 43 `test_*.py` files, SQLite) | `469 passed, 1 warning in 31.52s` |
| `pytest tests/test_e2e_slice.py` | `2 passed, 1 warning in 1.45s` |
| `npm run typecheck` | no errors (exit code 0) |
| `npm test` (frontend) | `Test Files 15 passed (15)`, `Tests 134 passed (134)` |
| `npm run build` (output sent to a temporary folder) | `✓ built in 133ms` |
| `npm run contrast` | `86 checks, 0 failures.` |
| `npm run e2e` (Playwright, headless Chromium, 1440x900 and 390x844 with touch), three runs | `12 passed (10.8s)`, `12 passed (10.4s)`, `12 passed (9.5s)` |
| `npm audit --audit-level=high` | `found 0 vulnerabilities` |
| `pip-audit -r requirements.txt --no-deps --disable-pip` | `No known vulnerabilities found` (direct dependencies only; the full run with transitive dependencies happens in CI) |
| `pytest` with `SEATPLAN_TEST_POSTGRES` (throwaway local Postgres 16.2 cluster, deleted afterwards) | `468 passed, 1 skipped, 1 warning in 62.08s (0:01:02)` (the skipped test is about table creation on local SQLite) |

The one pytest warning is Starlette asking for the `httpx2` package in its test
client; it does not come from SeatPlan code.

Also checked earlier on 2026-11-10 on that local Postgres 16.2 (not in CI, not
repeated in the final verification): `app.seed.migrate` and `app.seed.run` on
an empty database; eight `app.seed.migrate` runs started together on an empty
database, three rounds, all succeeded, with a pooled-style URL carrying
`supa=` and `pgbouncer=` options; two guests racing for one seat (one
confirming, one holding) give 200 and a clean 409, where the old lock order
gave a deadlock and a 500; four auto-fills at once save scenarios 1 to 4,
never a duplicate number.

Not verified: a real Vercel deployment (not done yet, including whether it
buffers the live stream), real email delivery through Resend (not done yet),
usability sessions with real people (not done yet), the gitleaks scan and the
new `e2e` CI job (they run only on GitHub and have not run yet), screen readers
and real touch devices.
