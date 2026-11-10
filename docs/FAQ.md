# Frequently asked questions

Short answers, with the file to open if you want the long one.

## About the product

**What is SeatPlan?**
A web app where people choose their own seat on a live 2D map. It has two
verticals on one shared core: events (attendees pick seats near people they
know) and restaurants (diners book a table for a date, time and party size).
See the [README](../README.md).

**Who is on the team?**
Sergio and Martim (restaurants), Simao and Federico (events).

**Is it live on the internet?**
Not yet. No deployment has been done. The plan is in
[`deployment.md`](deployment.md); every step there says "not done yet".

**Does it send real emails?**
Not yet. Emails are queued and, with the console provider, written to the log
as one line each. Real sending through Resend needs a verified domain we own,
which we do not have yet ([`email.md`](email.md)).

## About double booking

**Can two people end up in the same seat?**
No. The database refuses it, not the Python code. `seat_assignments` has
UNIQUE(event_id, seat_id) and UNIQUE(event_id, guest_id); restaurant tables
are protected by the primary key of `table_slots` (table, date, 15-minute
slot); holds by UNIQUE(scope, resource_kind, resource_id, slot_key). The loser
of a race gets HTTP 409. See [`data-model.md`](data-model.md).

**Then why have holds at all?**
So nobody loses a seat while reading the confirmation screen. A hold lasts 5
minutes (`HOLD_MINUTES` in `core/holds.py`). Expired holds are removed in the
same transaction that tries to take the seat.

**Is there anything the database does not guard?**
Yes, one thing has no UNIQUE rule: the restaurant's covers cap per seating
time. The application checks it, but first locks the service period's row
(`_lock_period` in `restaurant_service/availability.py`), so two bookings at
the very same moment are checked one after the other and cannot pass the cap
together. Test: `test_covers_cap_holds_under_concurrent_confirms`. Tables
themselves can never be double booked.

## About the optimiser

**Will the optimiser ever move a guest who chose their own seat?**
No. Seats chosen by the guest (`self`) or by the organiser (`organiser`) are
passed to the optimiser as `fixed` and are never moved by auto-fill, re-plan
or applying a scenario.

**Why does the same button always give the same plan?**
All randomness comes from one `random.Random(seed)`, and the stopping rule is
the number of iterations, not the clock. A 15-second safety limit exists but
is set so it does not fire on the demo data. Same problem and same seed, same
result (contract section 6).

**How do we know the heuristic is any good?**
The exact check compares it with a proven optimum (OR-tools CP-SAT when
installed, otherwise a pure-Python branch and bound) on a small part of the
problem, and reports the gap. See [`optimiser-events.md`](optimiser-events.md)
and [`optimiser-restaurant.md`](optimiser-restaurant.md).

## About privacy

**Can an attendee see other guests' emails or dietary notes?**
No. The attendee answers never include email, dietary or accessibility data,
and names pass through `core/privacy.py` with the event's privacy mode
(`full_name`, `first_initial` or `anonymous`). A guest can also ask to be
anonymous.

**What happens when a guest is deleted?**
Their personal data is erased: the row stays as "Deleted guest" with no email,
so old plans still make sense, and their seat, holds and "knows" lists are
removed.

**Are real people's details in the repository?**
No. All names are invented and all emails end in `@example.com`.

## About running it

**Why must I run commands from `backend/`?**
The backend package is imported as `app` everywhere (tests, seed, Vercel).
Running from the repository root gives `No module named 'app'`.

**Why does the app not create tables on Postgres?**
Several serverless instances could start at the same moment and race on
`CREATE TABLE`. Tables come from `python -m app.seed.migrate`, which takes a
Postgres lock. See [`runbook.md`](runbook.md).

**How do live updates work without WebSockets?**
Every write adds one to a counter in the database. Pages open a short stream
(about 25 seconds) that sends the counter when it changes, then reconnect. If
the stream is refused or fails, they ask for the counter every 2 seconds. See
[`architecture.md`](architecture.md), section 4.

**Where is the list of API endpoints?**
[`openapi.json`](openapi.json) (exported from the real app) and the short
guide [`api.md`](api.md). With the backend running, also
<http://127.0.0.1:8000/api/docs>.

**How do I reset the demo?**
`POST /api/demo/reset` with the header `X-Demo-Key` equal to `DEMO_KEY`.
Only works while `DEMO_MODE=1`. An empty `DEMO_KEY` means nobody can reset.

## About testing

**Is there a browser test suite?**
Yes. `frontend/e2e/` has 12 Playwright tests in headless Chromium: the main
attendee, organiser, diner and staff flows on desktop and phone sizes, and an
axe-core accessibility scan of six pages. Run them with
`cd frontend && npm run e2e`. The backend also has an end-to-end test through
the real HTTP API (`backend/tests/test_e2e_slice.py`). Numbers are in
[`test-report.md`](test-report.md).

**Were there usability sessions with real users?**
Not done yet.

**When is the presentation?**
The date is not written in this repository yet.
