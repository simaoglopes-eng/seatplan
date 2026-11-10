# backend/app/seed: read me first

## Purpose

Two commands, run from `backend/`:

- `python -m app.seed.migrate` creates any missing tables. On Postgres it is
  the only place tables are created; the app never does it itself.
- `python -m app.seed.run` creates the tables too, then the two demo accounts
  and the demo data for both verticals, and prints the links to open.

`POST /api/demo/reset` (in `routers/demo.py`) wipes the data and calls the
same `seed_all()`.

## Key functions

| File | Function | Job |
|---|---|---|
| `migrate.py` | `main()` | `db.create_all()`: missing tables only, under a Postgres advisory lock |
| `run.py` | `demo_password(env_name, settings)` | The password from the environment; the public default only on local SQLite with `DEMO_MODE=1` |
| `run.py` | `ensure_demo_users(session, settings)` | Creates or updates `organiser@example.com` and `staff@example.com` |
| `run.py` | `seed_all(session, settings, actor)` | Users plus both verticals; saves the links in `demo_links`; commits |
| `demo_events.py` | `seed(session)` | A wedding and a conference: venues, tables, guests, groups, who knows whom |
| `demo_restaurant.py` | `seed(session)` | "Casa Lumen": 18 tables in four zones, opening hours, bookings for today and the next three days, two weeks of past dinners |

## Data flow

```
seed_all()
  ensure_demo_users()            organisers table (passwords hashed with scrypt)
  demo_events.seed()      -> {"wedding_guest_choosing": "/e/<token>", ...}
  demo_restaurant.seed()  -> {"restaurant_booking": "/r/<id>", ...}
  demo_links rows          <- those links, for GET /demo/links
  audit_log row            <- {"count": n}, never the links themselves
  commit
```

Each vertical seed makes its own `random.Random(SEED)` with `SEED = 2026`, so
every run builds the same people and the same seating for the same date. Only
the secret tokens are truly random: a predictable token would open anyone's
page.

## Three likely walkthrough questions

**Is any of this data real?**
No. Every name is invented and every email ends in `@example.com`
(contract section 7).

**Why are the demo links not kept in the audit log?**
A link like `/e/<token>` holds a raw secret token, and the rule is that tokens
are stored only as SHA-256 hashes and never written into the audit log. The
demo is the one place that must hand links out, so they live in their own
small table, `demo_links`, which every reset wipes and which the API reads
only while `DEMO_MODE=1`.

**What stops a deployment from using the public demo passwords?**
`demo_password()` returns the defaults written in `run.py` only on a local
SQLite database with `DEMO_MODE=1`. On Postgres, which means any deployment,
the seed stops with an error unless `DEMO_ORGANISER_PASSWORD` and
`DEMO_STAFF_PASSWORD` are set.
