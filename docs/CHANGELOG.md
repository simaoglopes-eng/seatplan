# Changelog

What changed in SeatPlan, newest first. Each line comes from an entry in
[`decisions-log.md`](decisions-log.md) (named in brackets), where the reasons
are written out in full. Two short names: "platform fixes" means the section
"fixes after the adversarial review (platform)", and "events and restaurants
fixes" means "fixes after the adversarial review (events, restaurants,
frontend, verification)". The version number is `APP_VERSION` in
`backend/app/config.py`.

Format: one section per version, with the groups Added, Changed, Fixed and
Security. "Not released" means it has not been deployed anywhere.

## [Unreleased]

Nothing yet. Things planned but not done yet: the first Vercel deployment,
real email through Resend, usability sessions with real users.

## [0.1.0] - 2026-11-10 (not released: no deployment has been done)

### Added

- Shared core: FastAPI app factory, settings from environment variables,
  SQLAlchemy models for both verticals, scrypt passwords, signed sessions,
  database-backed rate limits ("backend foundation").
- Five-minute seat and table holds guarded by a UNIQUE constraint;
  `commit_or_seat_taken` turns a clash on the final insert into 409
  `seat_taken` ("backend foundation", item 8).
- Privacy mode `first_initial` shows first name plus last initial
  ("backend foundation", item 9).
- Events optimiser: greedy, simulated annealing, re-plan with a change
  penalty, recommendations and an exact solver (CP-SAT or branch and bound)
  ("events optimiser").
- Events API: guests, raw-CSV import (all rows or none, 200 KB and 1000
  rows), export, organiser moves, auto-fill, re-plan, scenarios, what-if, undo
  and redo, exact check, and the attendee endpoints including
  `GET /a/{token}/people` ("events vertical API").
- Restaurants API in the new `restaurant_service/` package: slots, map, holds
  (one row per table per 15-minute slot), bookings, manage-or-cancel links,
  waitlist with offers, staff floor, walk-ins, what-if, dashboard, schedule
  ("restaurants vertical API").
- Frontend: React and Vite app, hand-drawn SVG seat map with pan, zoom and
  keyboard, attendee and organiser screens, diner and staff screens, a
  floor-plan editor ("frontend foundation and seat map", "events screens",
  "restaurant screens").
- Email outbox with an idempotency key per email, a `sending` claim with a
  10-minute lease, retries, an allowlist, console and Resend providers, and a
  GitHub Actions cron every 15 minutes ("email system").
- Calendar invites on confirmation, change and cancellation emails, built by
  `mail/invites.py` ("integration", item 1).
- Event reminders, one per guest per event, kept in step with the seat
  (platform fixes, item 13; events fixes, item 12).
- Staff optimiser endpoints `POST /staff/{vid}/optimise/service` and
  `/optimise/exact-check` (events and restaurants fixes, item 7).
- `DELETE /r/{vid}/hold/{hold_id}` to give a held table back (events and
  restaurants fixes, item 5).
- Table `demo_links` for the demo entry links (platform fixes, item 4).
- Command `python -m app.seed.migrate` to create tables on Postgres
  (platform fixes, item 5).
- Opt-in Postgres test run with `SEATPLAN_TEST_POSTGRES` (events and
  restaurants fixes, item 16).
- CI runs `ruff format --check .` (platform fixes, item 15).

### Changed

- The backend is imported as `app` and run from `backend/`; the seed command
  is `cd backend && python -m app.seed.run` ("backend foundation", item 1;
  "integration", item 13).
- Recommendations return `rank` and `match`, never a raw score, and rank with
  the guest's own "knows" list only (events optimiser item 5, superseded by
  the events and restaurants fixes, item 1).
- Events exact check also returns `heuristic_seated`, `exact_seated` and a
  `note`; `gap_percent` is null when the two plans seat a different number of
  guests (events and restaurants fixes, item 2).
- Safety cut-off for both optimisers lowered to 15 s, under Vercel's 30 s
  `maxDuration` (events and restaurants fixes, item 3).
- Emails use the real templates in `mail/templates.py`; the temporary helpers
  are gone ("integration", item 1).
- The waitlist offer email no longer promises a hold ("integration", item 4).
- `max_party` is per venue and returned on `GET /r/{vid}` and `GET /b/{token}`
  (events and restaurants fixes, item 6).
- Staff what-if and walk-ins take an optional `date`; the dashboard adds
  covers seated (events and restaurants fixes, item 8).
- Error codes `method_not_allowed` (405) and `internal` (500) added to the
  contract; 400 and 413 map to `validation` (platform fixes, item 9).
- Contract wording on real time: the browser uses the stream first and polls
  only when it fails (events and restaurants fixes, item 15).
- Contract corrected: there is no Playwright suite and no `report/` folder
  (platform fixes, item 14). Reversed later the same day: see the next line.
- Browser tests with Playwright and axe-core in `frontend/e2e/`, run by
  `npm run e2e` and a new `e2e` job in CI ("documentation and verification",
  item 2).
- The documentation set in `docs/` and a documentation index in the README
  ("documentation and verification", item 7).

### Fixed

- Two cold starts on Postgres raced on `CREATE TABLE`; the app no longer
  creates tables there (platform fixes, item 5).
- Two scenario saves at once could get the same number: UNIQUE(event_id, seq)
  on `plan_snapshots`, and saves take the event lock first (platform fixes,
  item 6; events and restaurants fixes, item 11).
- A Postgres deadlock or serialization failure on any route now answers 409
  `conflict` "please try again" instead of 500; every write on an event takes
  the event lock first (events and restaurants fixes, item 4).
- Pooled Postgres URLs with options such as `pgbouncer=` failed to connect;
  unknown options are now dropped (platform fixes, item 7).
- Control characters (such as NUL) in free text gave a 500 on Postgres; they
  are now a 422 (events and restaurants fixes, item 9).
- A random test failure when slow logins crossed a minute boundary; the test
  now freezes the clock (platform fixes, item 10).
- On a phone, tapping a table panned the map so the tap missed (events and
  restaurants fixes, item 14).
- Staff heard their own actions read back as someone else's (events and
  restaurants fixes, item 13).
- What-if refusal is a 409, not a 500 ("integration", item 9).
- Frontend and backend restaurant shapes did not match; all conversions now
  live in `frontend/src/api/restaurant.ts` ("integration", item 5).
- An unknown venue time zone or a date such as 9999-12-31 gave a 500; both
  are now a 422 ("documentation and verification", item 1).
- Accessibility: the recommended-seat halo stops after two breaths, focus is
  kept clear of the sticky header and hold bars, and event dates are in
  British English ("documentation and verification", item 6).

### Security

- Demo reset needs the `X-Demo-Key` header; the organiser-session path was
  removed, because the demo password is public (platform fixes, item 1).
- No public demo passwords on Postgres (platform fixes, item 2).
- `SECRET_KEY` is required on Postgres, demo mode or not (platform fixes,
  item 3).
- Raw demo tokens moved out of the audit log (platform fixes, item 4).
- On Vercel a missing `DATABASE_URL` stops the app instead of falling back to
  SQLite (platform fixes, item 7).
- Live stream refused past 30 opens a minute per address or 50 open streams
  per instance (platform fixes, item 8).
- Restaurant holds capped at 3 per client per venue and date, and never more
  than half the tables of a slot (events and restaurants fixes, item 5).
- Security headers on the static frontend in `vercel.json`: CSP, no framing,
  `no-referrer`, `nosniff` (platform fixes, item 12).
- `tzdata` added so time zones do not depend on the host (platform fixes,
  item 11).
- The email processing endpoint is rate limited before the secret check, and
  an empty `CRON_SECRET` rejects every call ("email system", item 4).
- `X-Forwarded-For` is trusted only on Vercel; on Postgres a `SECRET_KEY`
  shorter than 32 characters stops the app; `rate_limits` stores a keyed hash
  instead of the IP address; the console email provider masks addresses;
  `Strict-Transport-Security` in `vercel.json` ("documentation and
  verification", item 1; details in [`security.md`](security.md)).
- Booking caps (S8): at most 4 upcoming diner bookings per mailbox and
  restaurant, and 10 booking attempts per client address (IPv6: per /64) and
  restaurant per UTC day; both answer 429 `rate_limited` ("booking caps and
  outbox links", items 1 and 2).
- Personal links leave the email outbox (S9): a finished row has every
  `/b/`, `/e/` and `/a/` link replaced, cancelled reminders are blanked, and
  finished rows are emptied after 30 days ("booking caps and outbox links",
  items 3 and 4).
