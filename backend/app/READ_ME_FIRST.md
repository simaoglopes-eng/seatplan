# backend/app: read me first

## Purpose

The SeatPlan API. One FastAPI application that serves every `/api/...` URL,
locally through uvicorn and in production as one Vercel Python function.

## How to run it

All commands run from the `backend/` folder, with the shared virtualenv:

```
cd backend
../.venv/bin/python -m app.seed.migrate                   # tables only (Postgres: the only way)
../.venv/bin/python -m app.seed.run                       # tables + demo data
../.venv/bin/uvicorn app.main:create_app --factory --reload
../.venv/bin/python -m pytest                             # tests
```

## Key files

| File | Job |
|---|---|
| `main.py` | `create_app()`: database, error handlers, CORS, security headers, all routers under `/api`. Creates tables only on local SQLite |
| `config.py` | Every environment variable is read here and only here |
| `db.py` | Engine (SQLite locally, Postgres with NullPool in production), `SessionDep`, `insert_ignoring_duplicates` |
| `models.py` | Every table. The UNIQUE constraints are what make double booking impossible |
| `security.py` | scrypt passwords, token hashes, signed sessions, `CurrentUser`, `CurrentOrganiser`, `rate_limit` |
| `core/` | Shared building blocks: holds, live updates, audit, privacy, layout (see its own read-me) |
| `routers/` | One file per area of the API |
| `mail/outbox.py` | `enqueue()`: emails are written to a table first and sent later |
| `seed/run.py` | Demo users plus both verticals' demo data |
| `seed/migrate.py` | Creates missing tables; on Postgres the app never does it itself |

## Data flow of one request

1. Vercel (or uvicorn) hands the request to the app from `create_app()`.
2. FastAPI checks the body against a Pydantic model (unknown fields are refused).
3. The route gets a database session (`session: db.SessionDep`) and, if needed,
   the logged-in user (`user: CurrentUser`).
4. The route reads and writes through SQLAlchemy, then commits once.
5. Any `ApiError` raised on the way becomes `{"error": {"code", "message"}}`.

## Four likely walkthrough questions

**Why is there no global `app = FastAPI()` in main.py?**
So that importing the code never opens the real database. Tests call
`create_app()` with a temporary SQLite file; Vercel's `api/index.py` calls it
with the production settings.

**Why does the app not create its tables on Postgres?**
On Vercel several instances can start at the same moment. Each would run
`CREATE TABLE`, and all but one crash. So tables come from one explicit command,
`python -m app.seed.migrate`, which takes a Postgres lock first. The local
SQLite file has a single user, so there the app still creates them on start.

**Why are dates stored without a time zone?**
SQLite has no time zone type. `UtcDateTime` in `models.py` stores every moment
as UTC and hands back timezone-aware datetimes, so both databases behave the same.

**How do you stop two people booking the same seat at the same moment?**
We never "check, then insert". We insert, and a UNIQUE constraint in the
database refuses the second row. The error is caught and returned as HTTP 409
`seat_taken`. `tests/test_holds.py` fires 30 threads at one seat to prove it.
