# Architecture

This page explains how the parts of SeatPlan fit together. Every fact here
comes from the code as it was on 2026-11-10; the file names are given so you
can check. The agreement behind it is [`CONTRACT.md`](CONTRACT.md), and the
reasons for each change are in [`decisions-log.md`](decisions-log.md).

## 1. The big picture in four sentences

1. The browser loads a React app (built by Vite) and talks to one Python
   function through `/api/...` on the same address.
2. The Python function is a FastAPI app (`backend/app/main.py`) that reads and
   writes one database: SQLite on a laptop, Postgres when deployed.
3. The database, not the Python code, decides who gets a seat or a table: every
   seat, table slot and hold is protected by a UNIQUE constraint
   (see [`data-model.md`](data-model.md)).
4. Two things happen outside a browser request: live updates (the browser asks
   "has anything changed?") and emails (a scheduled job asks the API to send
   what is waiting in the outbox).

## 2. Components

```mermaid
flowchart LR
    subgraph Browser
        UI["React app<br/>frontend/src/pages"]
        MAP["SVG seat map<br/>frontend/src/seatmap"]
        CLIENT["Typed API client and live hook<br/>frontend/src/api"]
        UI --> MAP
        UI --> CLIENT
    end

    subgraph Vercel["One Vercel project (planned, not deployed yet)"]
        STATIC["Static files<br/>frontend/dist"]
        FN["Python function<br/>api/index.py"]
    end

    subgraph Backend["FastAPI app (backend/app)"]
        MAIN["main.py<br/>errors, CORS, security headers"]
        ROUTERS["routers/<br/>one file per endpoint group"]
        EVS["events_service/"]
        RES["restaurant_service/"]
        CORE["core/<br/>holds, live, audit, privacy, layout"]
        OPT["optimiser/<br/>pure Python, no database"]
        MAIL["mail/<br/>outbox, templates, invites, providers"]
        SEC["security.py<br/>passwords, sessions, rate limit"]
    end

    DB[("Database<br/>SQLite locally, Postgres deployed")]
    CRON["GitHub Actions<br/>email-cron.yml, every 15 min"]
    RESEND["Resend HTTP API<br/>(or console log locally)"]

    CLIENT -- "GET static pages" --> STATIC
    CLIENT -- "/api/... JSON, SSE" --> FN
    FN --> MAIN --> ROUTERS
    ROUTERS --> EVS
    ROUTERS --> RES
    ROUTERS --> SEC
    EVS --> CORE
    RES --> CORE
    EVS --> OPT
    RES --> OPT
    EVS --> MAIL
    RES --> MAIL
    CORE --> DB
    MAIL --> DB
    SEC --> DB
    CRON -- "POST /api/internal/email/process<br/>header X-Cron-Secret" --> FN
    MAIL -- "HTTPS with httpx" --> RESEND
```

What each part does, in one line each:

| Part | Job | Where |
|---|---|---|
| Vercel entry point | Puts `backend/` on the import path and builds the app once | `api/index.py` |
| App factory | Registers routers under `/api`, error shape, CORS, security headers | `backend/app/main.py` |
| Settings | Reads every environment variable, refuses unsafe start-ups | `backend/app/config.py` |
| Database helpers | Engine (NullPool on Postgres), session per request, `create_all` | `backend/app/db.py` |
| Routers | Thin HTTP layer: check input, call a service, return JSON | `backend/app/routers/` |
| Services | The real work for each vertical | `backend/app/events_service/`, `backend/app/restaurant_service/` |
| Core | Holds, live counter, audit log, privacy names, layout save | `backend/app/core/` |
| Optimiser | Pure functions; routers turn rows into dataclasses and call them | `backend/app/optimiser/` |
| Mail | Outbox table, templates, calendar invites, providers | `backend/app/mail/` |
| Seed | Demo data and the `migrate` command that creates tables on Postgres | `backend/app/seed/` |

Two rules keep this picture simple:

- **The optimiser never imports the database.** It receives frozen
  dataclasses and returns plain results, so it can be tested on its own.
- **No shared memory between requests.** On Vercel each request may run on a
  different instance, so everything that must be shared (holds, live version
  numbers, rate-limit counters, the email queue) lives in the database.

## 3. Request flow: an attendee holds and confirms a seat

The attendee opens `/e/<token>` in the browser; the frontend calls the API
under `/api/a/<token>/...`. The code is `routers/attendee.py`,
`events_service/seating.py` (`hold_seat`, `confirm_seat`) and `core/holds.py`.
A hold lasts 5 minutes (`HOLD_MINUTES = 5`).

```mermaid
sequenceDiagram
    autonumber
    actor A as Attendee (browser)
    participant API as FastAPI (routers/attendee.py)
    participant S as events_service/seating.py
    participant H as core/holds.py
    participant DB as Database

    A->>API: POST /api/a/{token}/hold {seat_id}
    API->>DB: rate_limit, key "attendee" plus the address, 120 per minute
    API->>S: hold_seat(event, guest, seat_id)
    S->>S: before deadline? RSVP not "no"? seat allowed for this guest?
    S->>DB: lock_event: bump the live_versions row of this event
    S->>DB: seat already confirmed by someone else? then 409 seat_taken
    S->>DB: DELETE this guest's other holds in the event
    S->>H: take_hold(scope, "seat", seat_id, holder_key)
    H->>DB: DELETE expired hold on this seat
    H->>DB: INSERT INTO holds (...) and COMMIT
    alt UNIQUE uq_holds_resource broken (someone else holds it)
        DB-->>H: IntegrityError
        H-->>API: SeatTaken
        API-->>A: 409 with error code seat_taken
    else insert worked
        API-->>A: 200 {expires_at} (5 minutes from now)
    end

    Note over A: The attendee reads the details and presses Confirm

    A->>API: POST /api/a/{token}/confirm {seat_id}
    API->>S: confirm_seat(event, guest, seat_id)
    S->>DB: lock_event (same row first, so the lock order is always the same)
    S->>H: confirm_hold: is my hold still live? then delete it
    alt hold missing or expired
        H-->>API: HoldExpired
        API-->>A: 409 hold_expired
    else hold is live
        S->>DB: INSERT or UPDATE seat_assignments (source "self")
        S->>DB: flush: UNIQUE(event_id, seat_id) and UNIQUE(event_id, guest_id) checked here
        S->>DB: INSERT audit_log row, INSERT email_outbox row, sync reminder
        S->>DB: COMMIT (all of it together, or nothing)
        API-->>A: 200 confirmed seat
    end
```

Why it is safe even when two people press at the same moment on two different
servers: both servers try an `INSERT`, and the database accepts only one. The
loser gets a clean 409, never a 500 and never a double booking. On Postgres, if
the database breaks a deadlock or a serialization conflict (sqlstate `40P01`
or `40001`), `main.py` answers 409 `conflict` "please try again", and nothing
was saved.

The restaurant flow has the same shape. `POST /api/r/{vid}/hold` takes one
`holds` row per table per 15-minute slot (scope `venue-<id>-<yyyy-mm-dd>`,
`slot_key` = slot number), and `POST /api/r/{vid}/bookings` turns the hold into
`table_slots` rows, whose primary key `(table_id, date, slot_index)` refuses a
second booking of the same table in the same slot.

## 4. Live updates

Code: `backend/app/core/live.py` (server) and the live hook in
`frontend/src/api/` (browser). Only a version number travels; the page then
fetches its data again with the normal endpoints.

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser page
    participant API as FastAPI (core/live.py)
    participant DB as live_versions table

    Note over API,DB: Every write calls live.bump(scope) in the same transaction
    B->>API: GET /api/live/{scope}/stream
    alt 50 streams already open on this instance, or more than 30 opens per minute from this address
        API-->>B: 429 rate_limited
        loop every 2 seconds
            B->>API: GET /api/live/{scope}/version
            API->>DB: SELECT version
            API-->>B: {"version": n}
        end
    else stream accepted
        API-->>B: retry: 1000
        loop about once a second, for about 25 seconds
            API->>DB: SELECT version (fresh short session)
            API-->>B: event: version, data: n (only when it changed)
        end
        API-->>B: stream ends
        B->>API: EventSource reconnects by itself
    end
    B->>B: version changed? fetch the map again
```

Numbers from the code: `STREAM_SECONDS = 25.0`, `CHECK_EVERY_SECONDS = 1.0`,
`STREAMS_PER_IP_PER_MINUTE = 30`, `MAX_OPEN_STREAMS = 50`. Scopes are
`event-<event public id>` and `venue-<venue public id>-<yyyy-mm-dd>`.

Why this design: a serverless function cannot keep a socket open for long and
does not share memory with other instances. A short stream that ends by itself
and a counter in the database work under both limits. Not checked yet: whether
Vercel buffers the stream. If it does, changes arrive late instead of falling
back to polling (see [`risk-log.md`](risk-log.md)).

## 5. Email outbox

Code: `backend/app/mail/outbox.py`, `backend/app/routers/emails.py`,
`backend/app/mail/providers.py`, `.github/workflows/email-cron.yml`. More
detail in [`email.md`](email.md).

Emails are never sent during a booking request. The request only writes a row
into `email_outbox` in the same transaction as the booking, so a rolled-back
booking leaves no email behind, and a slow email provider can never make a
booking fail.

```mermaid
flowchart LR
    REQ["A request that changes a seat or booking"] -- "enqueue(), same transaction<br/>ON CONFLICT DO NOTHING on idempotency_key" --> OUT[("email_outbox")]
    GH["GitHub Actions cron<br/>every 15 minutes"] -- "POST /api/internal/email/process<br/>X-Cron-Secret" --> P["process_due()<br/>up to 20 rows"]
    P -- "claim with one conditional UPDATE" --> OUT
    P -- "address on EMAIL_ALLOWLIST?" --> PROV{"Provider"}
    PROV -- "EMAIL_PROVIDER=console" --> LOG["Server log, one line, no body"]
    PROV -- "EMAIL_PROVIDER=resend" --> RS["Resend HTTPS API<br/>Idempotency-Key header"]
```

Life of one row (the `status` column):

```mermaid
stateDiagram-v2
    [*] --> queued: enqueue()
    queued --> sending: claimed (lease 10 minutes)
    sending --> sent: provider accepted it
    sending --> skipped: address not on EMAIL_ALLOWLIST
    sending --> queued: error, tries left (wait 5, 10, 20, 40 minutes)
    sending --> failed: error on the 5th try
    sending --> sending: lease ran out, another processor claims it again
    sent --> [*]
    skipped --> [*]
    failed --> [*]
```

Numbers from the code: `MAX_ATTEMPTS = 5`, `FIRST_RETRY_DELAY = 5 minutes`
(doubling), `CLAIM_LEASE = 10 minutes`, batch of 20 per call, and the
processing endpoint is rate limited to 30 calls per minute per address before
the secret is checked.

## 6. Security in the request path

- **Sessions:** organiser and staff send `Authorization: Bearer <session>`,
  an HMAC-signed value that expires after 12 hours (`SESSION_HOURS = 12` in
  `security.py`). Passwords are hashed with `hashlib.scrypt`.
- **Personal links:** attendee (`/a/<token>`) and booking (`/b/<token>`) tokens
  are stored only as SHA-256 hashes. A wrong and a revoked token both give 404.
- **Rate limits** live in the `rate_limits` table, so they work across
  serverless instances. Fixed window per calendar minute: login 10 per minute
  per address, attendee routes 120, demo reset 5, email processing 30, live
  stream opens 30.
- **Headers:** `main.py` adds `nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, HSTS, a Permissions-Policy and
  `Cache-Control: no-store`. `vercel.json` adds a Content-Security-Policy and
  the same framing rules to the static frontend.
- **CORS** allows only `FRONTEND_ORIGIN`.

## 7. Where things run

| Piece | Locally | Deployed (planned, not done yet) |
|---|---|---|
| Frontend | `npm run dev` on port 5173, forwards `/api` to port 8000 | Static files from `frontend/dist` on Vercel |
| Backend | `uvicorn app.main:create_app --factory` on port 8000 | `api/index.py` as one Vercel Python function, `maxDuration` 30 s |
| Database | `backend/seatplan.db` (SQLite), tables made at start-up | Hosted Postgres (Neon through the Vercel Marketplace); tables made by `python -m app.seed.migrate` |
| Email | Console provider (prints one line) | Resend, only once a sending domain is verified |
| Cron | Call the endpoint by hand with `curl` | `.github/workflows/email-cron.yml` every 15 minutes |

The deployment steps are in [`deployment.md`](deployment.md). Day-to-day
commands and fixes are in [`runbook.md`](runbook.md).
