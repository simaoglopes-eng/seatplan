# Open follow-ups as GitHub issues

Each block below is ready to paste into a new GitHub issue: the first line is
the title, then labels, the owner (by role and first name, see
`docs/team/tasks.md`), and the body. Every item was checked against the code or
the docs on 2026-11-10; the "Evidence" line says where. Nothing here has been
created on GitHub yet.

Suggested labels to create first: `deploy`, `backend`, `frontend`, `events`,
`restaurants`, `optimiser`, `email`, `security`, `accessibility`, `docs`,
`testing`, `ux`, `presentation`, `good first issue`.

---

## 1. Do the first real Vercel deployment

- **Labels:** `deploy`, `presentation`
- **Owner:** platform (Simao), with Martim for CI

No deployment has been done yet (`README.md`, "Not verified"; decisions log,
"Vercel wiring": "Not verified on a real deployment").

Steps: create the Vercel project and the Postgres database, set the variables
listed in `README.md` ("Environment variables"), run
`python -m app.seed.migrate` against the production URL, seed the demo, push
to `main`.

Done when: `GET /api/health` on the deployed URL answers `"database":"ok"`, and
the home page lists the demo links.

---

## 2. Check whether Vercel buffers the live event stream

- **Labels:** `deploy`, `backend`
- **Owner:** platform (Simao)

`backend/app/core/live.py` (top comment, line 12) says it is not checked
whether Vercel buffers the 25-second stream. If it does, changes arrive late
instead of falling back to polling (`README.md`, "Live updates").

Test: open the same attendee map in two browsers on the deployed site, hold a
seat in one, time how long until the other shows it as held. Write the result
in `README.md`.

---

## 3. Send one real email through Resend

- **Labels:** `email`, `deploy`
- **Owner:** Simao

Real sending has not been done (`docs/product-spec.md` section 6; `README.md`).
Resend only sends from a verified domain (`README.md`, "Environment
variables"). Needs a domain the team owns, `EMAIL_PROVIDER=resend`,
`RESEND_API_KEY`, and the test address in `EMAIL_ALLOWLIST`.

Done when: one confirmation email with its calendar invite arrives in a real
inbox, and `docs/email.md` says which items marked **[not verified]** are now
checked.

---

## 4. Expired holds are never cleaned up in bulk

- **Labels:** `backend`, `good first issue`
- **Owner:** Simao (core), reviewed by Sergio

Expired rows in `holds` are deleted only when someone takes the same resource
and slot again (`backend/app/core/holds.py` line 54) or by an explicit release.
Readers ignore them (`expires_at > now` in `events_service/seatmap.py` line 70
and `restaurant_service/occupancy.py` line 85), so this is not a correctness
bug, but the table grows over time.

Idea: delete `holds` rows with `expires_at` older than one hour inside
`POST /api/internal/email/process`, which the cron already calls every 15
minutes. Add a test.

---

## 5. After falling back to polling, the page never tries the stream again

- **Labels:** `frontend`, `ux`
- **Owner:** Simao

In `frontend/src/api/useLive.ts` (`connect`, lines 86 to 130), once
`fallBack()` starts polling, the `EventSource` is closed and is not reopened
until the page reloads. Polling every 2 seconds works, but a short network
blip turns a page into a poller for good.

Idea: after some minutes of polling, try the stream once more. Add a vitest
case next to `useLive.test.tsx`.

---

## 6. Decisions log has two stale entries

- **Labels:** `docs`, `good first issue`
- **Owner:** Sergio (covers cap), Martim (staff map)

1. "Restaurants vertical API" item 6 says two simultaneous bookings "could
   exceed [the covers cap] by one party". The code now locks the service row
   first (`restaurant_service/availability.py`, `_lock_period`, lines 81 to
   95) and `tests/test_restaurant_booking_flow.py` line 303
   (`test_covers_cap_holds_under_concurrent_confirms`) tests it.
2. "Restaurant screens" item 13 says a `describe` override on `SeatMap` "is
   requested". It exists: `frontend/src/seatmap/SeatMap.tsx` line 55 and
   `pages/restaurant/StaffFloor.tsx` line 113.

Add a dated entry that supersedes both, as the log already does elsewhere.

**Status: done on 2026-11-10.** Both items are marked in the log, and the
section "documentation and verification" explains them (items 3 and 4). Do
not open this issue.

---

## 7. No database migration tool

- **Labels:** `backend`, `deploy`
- **Owner:** Sergio

`app.seed.migrate` only creates missing tables; a new column or constraint on
an existing table is not applied (`README.md`, "Deploying to Vercel";
`backend/app/seed/migrate.py` line 9). Any schema change after the first
deploy needs a hand-written `ALTER TABLE` or a fresh database.

Options: keep it and write a short checklist for schema changes, or propose a
migration tool (needs the team's agreement: contract section 2 limits new
dependencies).

---

## 8. Rate limit window allows a double burst

- **Labels:** `security`, `backend`
- **Owner:** Sergio

`backend/app/security.py` `rate_limit` (lines 149 to 178) uses a fixed window
per calendar minute, so up to twice the limit can pass around a minute
boundary. The docstring and the decisions log ("fixes after the adversarial
review (platform)", item 10) already say so.

Decide: keep and explain in the walkthrough, or switch to two windows
(current plus a weighted share of the previous one). Add a test either way.

---

## 9. Single-tenant shortcuts: staff see every venue, every organiser sees the email log

- **Labels:** `security`, `backend`
- **Owner:** Sergio, with Simao for the email log

Decisions log, "backend foundation" item 10 and "email system" item 3: staff
accounts open every restaurant, and `GET /emails/log` shows every outbox row
(addresses masked) to any organiser. Fine for a one-team demo, wrong for
several businesses on one install.

Needs a venue or organiser column on `email_outbox` and a check in
`restaurant_service/venue_access.py`.

---

## 10. Test with a screen reader

- **Labels:** `accessibility`, `testing`
- **Owner:** Martim (seat map), Simao (design components)

Not done yet (`README.md`, "Not verified"; `docs/product-spec.md` section 6).
Try VoiceOver on macOS and on an iPhone: attendee seat choice, diner booking,
staff floor. Write down what is read out for a free, held and taken seat.

---

## 11. Test on real touch devices

- **Labels:** `accessibility`, `testing`, `frontend`
- **Owner:** Martim

Only headless Chromium at 390x844 was used (`README.md`, test report). Try a
real phone and a tablet: pinch zoom, pan, tapping a seat and a table
(`frontend/src/seatmap/usePanZoom.ts`).

---

## 12. Run the usability sessions

- **Labels:** `ux`, `testing`
- **Owner:** everyone (one session each)

Not done yet. The kit is in `docs/usability/` (`script.md`, `consent.md`). Use
classmates with consent and fake data only. Record results honestly, including
tasks people could not finish.

---

## 13. Extend the browser tests

- **Labels:** `testing`, `frontend`
- **Owner:** Martim

A Playwright suite now exists (`frontend/e2e/`, 12 tests, `npm run e2e`; see
`docs/test-report.md`). It does not yet cover: a live update arriving from
another user, a hold expiring after 5 minutes, the floor-plan editor, the
other staff and organiser tabs, and browsers other than Chromium. Add one
test at a time, starting with the live update (two pages, one change).

---

## 14. Confirm CI is green on GitHub, including gitleaks

- **Labels:** `testing`, `security`
- **Owner:** Martim

The gitleaks secret scan runs only in CI and was not verified
(`README.md`, "Not verified"). Push a branch, open a pull request, and check
that all jobs in `.github/workflows/ci.yml` pass. Paste the run link in the
README test report.

---

## 15. Restaurant optimiser wastes more seats than the optimum on bigger services

- **Labels:** `optimiser`, `restaurants`
- **Owner:** Martim

`python -m scripts.gap_report_restaurant`, run on 2026-11-10: on the
demo-sized services the heuristic matched the optimal covers in 4 of 8 rows,
and matched both covers and waste in only 2 of 8. For example 12 tables, 30 parties, seed 0:
heuristic 87 covers / 13 wasted seats, optimum 87 / 3. On 20 tables, 60 parties,
seed 1 it seated 133 covers against 138.

`_local_search` in `optimiser/restaurant_assign.py` (lines 259 to 283) never
accepts a worse plan. Try accepting worse plans with a small, shrinking
probability (as the events annealing does) and compare the table again.

---

## 16. Events heuristic missed the optimum on one small case

- **Labels:** `optimiser`, `events`
- **Owner:** Federico

`python -m scripts.gap_report_events`, run on 2026-11-10: 20 of 21 instances
had a 0.0 % gap; the instance with 10 guests, 3 tables of 4, seed 0 scored 105
against an optimum of 109 (gap 3.7 %). Find out why (more iterations? a move
type that annealing lacks, such as swapping two seated guests across tables
at once?) and write the finding in `docs/optimiser-events.md`.

---

## 17. Production uses branch and bound, not CP-SAT

- **Labels:** `optimiser`, `deploy`
- **Owner:** Federico and Martim

`ortools` is only in `backend/requirements-dev.txt`, not in the root
`requirements.txt` that Vercel installs. So on Vercel both exact checks fall
back to pure-Python branch and bound (`events_exact.py` lines 51 to 52,
`restaurant_exact.py` lines 240 to 246). Time both exact checks on the deployed
site with the demo data and confirm they answer before the 30 s limit
(`vercel.json`).

---

## 18. Schedule changes do not refresh open diner pages

- **Labels:** `restaurants`, `backend`
- **Owner:** Martim

`PUT /staff/{vid}/schedule` bumps no live scope (`backend/app/routers/staff.py`
line 242; decisions log, restaurants vertical API, item 14). A diner who has
the slots page open keeps seeing the old times until they reload.

Idea: bump the scopes of the dates that have open bookings, or show "the
schedule changed, please reload" on the next request.

---

## 19. A stay cannot cross midnight

- **Labels:** `restaurants`, `backend`
- **Owner:** Sergio

Slots stop at 24:00 local time (decisions log, restaurants vertical API,
item 9; `docs/optimiser-restaurant.md` line 340). A late dinner service cannot
take bookings that end after midnight. Either document it clearly for staff or
renumber slots across two dates.

---

## 20. Attendee "next to a friend" is guessed in the browser

- **Labels:** `events`, `frontend`
- **Owner:** Simao

`frontend/src/pages/events/friendSeats.ts` picks the two closest seats at the
same table, because the attendee map has no neighbour list (decisions log,
events screens, item 6). The backend has the real neighbours in
`seat_neighbours`. Send `neighbour_ids` per seat in `GET /a/{token}` so both
sides use one rule.

---

## 21. Write the seat map payload into the contract

- **Labels:** `docs`
- **Owner:** Martim

Decisions log, "frontend foundation and seat map" item 1, still calls the map
payload `{width, height, zones, tables, seats}` a "proposal, not yet in
section 5". The code uses it everywhere (`frontend/src/api/types.ts`). Add it
to `docs/CONTRACT.md` section 5.

**Status: done on 2026-11-10.** Contract section 5 now has a "Seat map
payload" paragraph. Do not open this issue.

---

## 22. Waitlist offer is first come, first served

- **Labels:** `restaurants`, `ux`
- **Owner:** Sergio

A cancellation emails the first matching person on the waitlist, but the table
is not held for them (`restaurant_service/waitlist.py`, `offer_freed_tables`;
decisions log, integration, item 4). If nobody books, the next person is not
told. Decide whether to offer to the next person after some minutes.

---

## 23. Email cron delay is not measured

- **Labels:** `email`, `deploy`
- **Owner:** Simao

`.github/workflows/email-cron.yml` runs every 15 minutes, so a confirmation
can arrive up to about 15 minutes after booking, plus any delay GitHub adds
to scheduled runs (not measured). Measure on the deployed site and say it in
`docs/user-guide-diner.md`.

---

## 24. Remove the one pytest warning

- **Labels:** `testing`, `good first issue`
- **Owner:** Sergio

Every `pytest` run ends with `443 passed, 1 warning` (2026-11-10, final verification). The warning
is Starlette's test client asking for the `httpx2` package
(`README.md`, test report). Check whether `httpx2` is acceptable under
contract section 2 (it would be a dev dependency only), or filter the warning
in `backend/pyproject.toml` with a comment saying why.

---

## 25. Re-run the full test report before submission

- **Labels:** `testing`, `docs`, `presentation`
- **Owner:** everyone, Martim collects

The README test report is from 2026-11-10 on one laptop (Python 3.12.13,
Node 24.17.0); CI uses Node 22. Re-run every command in `README.md`, "Running
the tests", on the final commit and update the numbers. Never copy old
numbers forward.

---

## 26. Fill in the presentation details

- **Labels:** `presentation`
- **Owner:** everyone

`docs/team/demo-script.md` has blanks: presentation date, deployed URL,
`DEMO_KEY` holder, and who brings the backup laptop. Fill them in when known.

---

## 27. Each member does the "own it" tasks

- **Labels:** `presentation`, `docs`
- **Owner:** each member, one issue per person

See `docs/team/ai-use.md`, "What each member must do". Close this issue only
after you have explained your file list out loud to another team member and
made one small change in it yourself, with a test.
