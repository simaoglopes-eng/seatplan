# Runbook

How to run SeatPlan on your own computer, keep the database in shape, and fix
the problems we have actually seen. Commands start from the repository root
unless they begin with `cd`. For the deployed version see
[`deployment.md`](deployment.md); nothing has been deployed yet.

## 1. Local setup

You need Python 3.12 and Node 22 (CI uses 22; development also used 24).

```bash
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt -r backend/requirements-dev.txt
```

If you use `uv`, keep its cache out of the repository:

```bash
UV_CACHE_DIR="$TMPDIR/uv-cache" uv pip install -r requirements.txt -r backend/requirements-dev.txt
```

Frontend packages:

```bash
cd frontend
npm ci
```

(Optional: `npm_config_cache="$TMPDIR/npm-cache" npm ci` keeps the npm cache
in a temporary folder.)

## 2. Seed the demo data

```bash
cd backend
export DEMO_MODE=1
../.venv/bin/python -m app.seed.run
```

What you should see (real output from 2026-11-10 on a fresh SQLite file; the
tokens and ids are random every time, so yours differ):

```text
Demo data ready.
  conference_guest_choosing: /e/<token>
  conference_guest_seated: /e/<token>
  conference_organiser: /organiser/<event id>
  conference_speaker: /e/<token>
  restaurant_booking: /r/<venue id>
  restaurant_staff: /staff/<venue id>
  wedding_guest_accessible: /e/<token>
  wedding_guest_choosing: /e/<token>
  wedding_guest_seated: /e/<token>
  wedding_organiser: /organiser/<event id>
```

Without `DATABASE_URL` the data goes into `backend/seatplan.db`. That file is
ignored by git (`*.db` in `.gitignore`); delete it to start again from zero.

Demo accounts: `organiser@example.com` and `staff@example.com`. Locally, with
SQLite, `DEMO_MODE=1` and no password variables, the passwords are the public
defaults in `backend/app/seed/run.py`. On Postgres those defaults never apply.

To reset the demo while the app runs, set `DEMO_KEY` before starting the
backend and call:

```bash
curl -X POST http://127.0.0.1:8000/api/demo/reset -H "X-Demo-Key: $DEMO_KEY"
```

## 3. Start the app

Terminal 1, backend:

```bash
cd backend
export DEMO_MODE=1
../.venv/bin/uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000
```

Terminal 2, frontend:

```bash
cd frontend
npm run dev
```

Open <http://localhost:5173>. The Vite dev server forwards `/api` to port 8000.
Check the backend alone with `curl http://127.0.0.1:8000/api/health`.

## 4. Create or update tables (migrate)

| Database | Who creates tables |
|---|---|
| SQLite (local, tests) | The app itself, when it starts (`create_app` calls `db.create_all()`) |
| Postgres | Only you, with the migrate command below. The app never runs `CREATE TABLE` there |

```bash
cd backend
DATABASE_URL='postgresql://USER:PASSWORD@HOST/DB' SECRET_KEY='same key as the app' ../.venv/bin/python -m app.seed.migrate
```

It prints `Tables are ready.` It is safe to run twice or at the same time
(it takes Postgres advisory lock `73102026`). **It only adds missing tables.**
A new column or constraint on an existing table needs a hand-written
`ALTER TABLE` or a fresh database, because there is no migration tool.

## 5. Environment variables

All are read in `backend/app/config.py` (and the two demo passwords in
`backend/app/seed/run.py`). The backend reads the process environment only; it
does not load `.env` by itself, so `export` what you need. `.env.example` lists
them all with safe values.

| Variable | Needed when | Local default | Notes |
|---|---|---|---|
| `DATABASE_URL` | Always on a deployment | empty = `backend/seatplan.db` | `postgres://` and `postgresql://` both work; unknown query options such as `pgbouncer=` are dropped. On Vercel an empty value stops the app |
| `SECRET_KEY` | Always with Postgres | random per process | Signs login sessions. At least 32 characters on Postgres. Make one with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `FRONTEND_ORIGIN` | Deployment | `http://localhost:5173` | The only origin CORS allows |
| `PUBLIC_BASE_URL` | Deployment | `http://localhost:5173` | Start of the links inside emails |
| `DEMO_MODE` | Demo | off | `1`, `true` or `yes` turns on `/api/demo/*` |
| `DEMO_KEY` | To reset the demo | empty | Header `X-Demo-Key`; empty means nobody can reset |
| `DEMO_ORGANISER_PASSWORD`, `DEMO_STAFF_PASSWORD` | Seeding on Postgres, or with demo mode off | public defaults (SQLite only) | Keep private on any deployment |
| `CRON_SECRET` | Email processing | empty | Header `X-Cron-Secret`; empty rejects every call |
| `EMAIL_PROVIDER` | Email | `console` | `console` or `resend` |
| `RESEND_API_KEY` | `EMAIL_PROVIDER=resend` | empty | Never logged |
| `EMAIL_FROM` | Email | `SeatPlan <noreply@example.com>` | Must be on a domain verified in Resend before real sending |
| `EMAIL_ALLOWLIST` | Email | empty | Comma-separated addresses that may receive email; everyone else is `skipped`. Applies to the console provider too |

## 6. The email cron

Emails wait in the `email_outbox` table until something calls
`POST /api/internal/email/process`. Deployed, `.github/workflows/email-cron.yml`
does that every 15 minutes (it needs the repository secrets `SEATPLAN_URL` and
`CRON_SECRET`; until they are set it prints a message and does nothing).
Locally, call it by hand:

```bash
export CRON_SECRET='any-local-value'
# start the backend in the same shell, then in another shell with the same value:
curl -X POST http://127.0.0.1:8000/api/internal/email/process -H "X-Cron-Secret: $CRON_SECRET"
```

It answers `{"sent": n, "skipped": n, "retrying": n, "failed": n}`. To see
emails reach the console log locally, put the demo addresses in
`EMAIL_ALLOWLIST`. Organisers can read the outbox at `GET /api/emails/log`
(addresses are masked).

## 7. Checks before you push

| What | Command |
|---|---|
| Lint | `cd backend && ../.venv/bin/ruff check .` |
| Formatting | `cd backend && ../.venv/bin/ruff format --check .` |
| Backend tests | `cd backend && ../.venv/bin/python -m pytest` |
| Frontend types | `cd frontend && npm run typecheck` |
| Frontend tests | `cd frontend && npm test` |
| Frontend build | `cd frontend && npm run build` |
| Colour contrast | `cd frontend && npm run contrast` |

CI runs the same list plus the dependency audits and a gitleaks scan.

## 8. Common failures and fixes

These messages come straight from the code. The two start-up errors were
reproduced on 2026-11-10.

| What you see | Why | Fix |
|---|---|---|
| `ModuleNotFoundError: No module named 'app'` | The command ran from the repository root, not `backend/` | `cd backend` first. The package is imported as `app` everywhere |
| `RuntimeError: SECRET_KEY is missing or shorter than 32 characters. Set a long random one before running against Postgres.` | `DATABASE_URL` points at Postgres and `SECRET_KEY` is empty or shorter than 32 characters | Set a `SECRET_KEY` of at least 32 characters (the same value everywhere the app runs) |
| `RuntimeError: DATABASE_URL is missing. Set it to the Postgres URL on Vercel.` | `VERCEL=1` is set and `DATABASE_URL` is empty | Connect the database or add the variable in the Vercel project |
| `RuntimeError: DEMO_ORGANISER_PASSWORD must be set on Postgres or when DEMO_MODE is off.` | Seeding Postgres, or seeding with demo mode off, without the demo passwords | Set both demo password variables |
| Errors about a missing table on Postgres (`relation ... does not exist`) | Tables are never created by the app on Postgres | Run `python -m app.seed.migrate` with the production URL |
| A new column is missing after migrate | Migrate only adds whole tables | Write the `ALTER TABLE` by hand, or use a fresh database |
| `/demo/links` gives 404 and the home page says the demo is off | `DEMO_MODE` is not `1` | `export DEMO_MODE=1` and restart the backend |
| `POST /api/demo/reset` gives 404 | `DEMO_MODE` is off | Turn demo mode on (only on a demo deployment) |
| `POST /api/demo/reset` gives 401 | `DEMO_KEY` empty, or the header differs | Set `DEMO_KEY` before starting, send the same value in `X-Demo-Key` |
| `POST /api/internal/email/process` gives 401 | `CRON_SECRET` empty or different | Same value on the app and in the caller |
| Emails show status `skipped` | Address not in `EMAIL_ALLOWLIST` | Add it (comma-separated) and queue the email again |
| Browser shows CORS errors | The page origin is not `FRONTEND_ORIGIN` | Set `FRONTEND_ORIGIN` to the exact origin, including the port |
| 409 `conflict` "Many people are changing things right now" | Postgres broke a deadlock or serialization conflict; nothing was saved | Try again; it is expected under heavy load |
| 429 `rate_limited` | Too many calls from one address this minute (fixed window per calendar minute) | Wait for the next minute |
| Changes on one screen appear late on another | Live stream refused or buffered; the page polls every 2 seconds instead | Usually nothing; check `GET /api/live/{scope}/version` grows after a change |
| A guest's link stopped working | The organiser pressed "New link", which revokes the old token | Send the new link |

## 9. Leave the repository clean

Temporary databases, logs and screenshots go under `$TMPDIR`, never inside the
repository. For a throw-away database:

```bash
cd backend
DATABASE_URL="sqlite:///$TMPDIR/seatplan-try.db" DEMO_MODE=1 ../.venv/bin/python -m app.seed.run
```
