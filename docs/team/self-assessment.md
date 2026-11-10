# Self-assessment

Written on 2026-11-10. This is our honest view of where the project stands. We
do not claim a grade: the examiners decide that, and some parts below have
never been tried outside a laptop.

## Important: where the requirements come from

The official course brief is **not stored in this repository**, so we could
not check it word by word. The requirements in the first table come from what
the project itself promises: `docs/CONTRACT.md` section 1 (the product in one
paragraph), `README.md` and `docs/product-spec.md`. Before submission, paste
the brief's own criteria into the empty table at the end and fill in the
evidence for each one.

Status words: **Met** (in the code and tested), **Partly** (in the code, but
something is missing or untested), **Not yet**.

## Against what the project promises

| Requirement | Status | Evidence | Gap |
|---|---|---|---|
| People choose their own seat on a live 2D map | Met | `frontend/src/seatmap/SeatMap.tsx`; `frontend/src/pages/events/SeatStep.tsx`; `frontend/src/pages/restaurant/StepTable.tsx` | Not tested on real touch devices or with a screen reader |
| Two verticals share one core | Met | `backend/app/core/`, `backend/app/models.py`, one seat map component used by both | |
| Events: personal link, RSVP, "who I know", pick a seat near them | Met | `backend/app/routers/attendee.py`, `events_service/seating.py`, `events_service/recommend.py`; `tests/test_attendee_flow.py` | |
| Events: privacy rules on names | Met | `backend/app/core/privacy.py`; `tests/test_privacy.py`, `tests/test_attendee_privacy.py` | |
| Restaurants: date, party size, time slot, table | Met | `backend/app/restaurant_service/diner_flow.py`; `tests/test_restaurant_booking_flow.py`, `tests/test_restaurant_slots.py` | A stay cannot cross midnight (issue 19) |
| Restaurants: manage or cancel link, waitlist | Met | `backend/app/routers/bookings.py`, `restaurant_service/manage_flow.py`, `waitlist.py`; `tests/test_bookings_manage.py` | Waitlist offer is first come, first served (issue 22) |
| Staff: live floor, walk-ins, what-if, dashboard, schedule | Met | `backend/app/routers/staff.py`, `restaurant_service/staff_floor.py`, `whatif.py`, `dashboard.py`; `tests/test_staff_endpoints.py` | |
| No double booking, ever | Met | UNIQUE rules in `models.py` (lines 161 to 180, 290 to 304, 378 to 388); race tests with 30 and 20 threads (`tests/test_holds.py` line 209, `tests/test_restaurant_booking_flow.py` line 188) | |
| Five-minute holds | Met | `backend/app/core/holds.py`; `tests/test_holds.py` | Expired rows are not swept in bulk (issue 4) |
| Optimiser recommends and explains | Met | `optimiser/events_recommend.py`, `restaurant_assign.py` `recommend_table`; reasons in plain words | |
| Optimiser auto-fills and re-plans with few moves | Met | `optimiser/events_greedy.py`, `events_anneal.py`, `events_replan.py`; `restaurant_assign.py` `assign_service`; `tests/test_optimiser_*` | |
| Human choices and hard rules never broken | Met | `events_service/problem.py` `human_fixed`; `events_service/plans.py` `apply_plan`; `restaurant_model.py` `place_fixed`; rule tests in `tests/test_optimiser_events_rules.py`, `tests/test_optimiser_restaurant_rules.py` | |
| Results are repeatable | Met | One `random.Random(seed)`; iteration budget as stopping rule; same-seed tests (`tests/test_optimiser_events_search.py` line 174, `tests/test_optimiser_restaurant_assign.py` line 112) | |
| Quality of the optimiser is measured | Partly | `backend/scripts/gap_report_events.py` and `gap_report_restaurant.py`, run on 2026-11-10 | Restaurant heuristic matched the optimal covers in 4 of 8 demo-sized services (issue 15); events: 20 of 21 small cases at 0 % gap |
| Live updates between users | Partly | `backend/app/core/live.py`, `frontend/src/api/useLive.ts`; `tests/test_demo_live.py` | Never checked on Vercel; the stream may be buffered there (issue 2) |
| Email confirmations and reminders | Partly | `backend/app/mail/`; `tests/test_mail_*.py`, `tests/test_outbox.py` | Only the console provider was used; no real email sent (issue 3) |
| Deployed web app | Not yet | `vercel.json`, `api/index.py`, `README.md` "Deploying to Vercel" | No deployment done yet (issue 1) |
| Security basics | Met for a demo | `backend/app/security.py` (scrypt, hashed tokens, signed sessions, database rate limit); `vercel.json` headers; `tests/test_security.py` | Single-tenant shortcuts (issue 9); fixed-window rate limit (issue 8) |
| Accessibility | Partly | Keyboard map (`seatmap/mapKeyboard.ts`), states shown by shape not only colour, `npm run contrast`, axe-core scan of six pages (`frontend/e2e/accessibility.spec.ts`) | No screen reader or real-device test (issues 10, 11) |
| Usability evidence | Not yet | Kit in `docs/usability/` | No sessions run (issue 12) |
| Tests | Met | See the numbers below; Playwright browser tests in `frontend/e2e/` | Browser tests do not cover live updates, hold expiry or the editor (issue 13) |
| Documentation a beginner can follow | Met | `README.md` (with a documentation index), `docs/`, a `READ_ME_FIRST.md` in each backend package and main frontend folder | The two stale decisions-log entries (issue 6) were fixed on 2026-11-10 |
| Every team member can explain the code | Not yet proven | `docs/team/tasks.md`, `docs/team/walkthrough-qa.md` | Depends on each of us doing the work in `docs/team/ai-use.md` |

## Test numbers we saw today

Commands run on 2026-11-10 on one Mac with macOS (Python 3.12.13, Node 24.17.0):

| Command | Output |
|---|---|
| `cd backend && ../.venv/bin/python -m pytest` | `443 passed, 1 warning in 30.52s` |
| `cd backend && ../.venv/bin/ruff check .` | `All checks passed!` |
| `cd frontend && npm test` | `Test Files  15 passed (15)`, `Tests  133 passed (133)` |
| `cd frontend && npm run e2e` | `12 passed (10.4s)` (and twice more, `12 passed` each time) |
| `cd backend && ../.venv/bin/python -m scripts.gap_report_events` | 21 instances; gap 0.0 % on 20, 3.7 % on one |
| `cd backend && ../.venv/bin/python -m scripts.gap_report_restaurant` | Small services: heuristic optimal on 19 of 20. Demo-sized: optimal covers on 4 of 8 |

The test numbers above are from the final verification on 2026-11-10, the
same as `README.md` and `docs/test-report.md`. The gap report rows are from
the team-pack work earlier that day and were confirmed in the final
verification. The Postgres run in the README was not repeated.

## Gaps, in one list

1. No real deployment (issue 1), so the live stream on Vercel (issue 2) and
   the exact checks within Vercel's 30 s limit (issue 17) are unchecked.
2. No real email sent (issue 3).
3. No usability sessions (issue 12), no screen reader or real-device tests
   (issues 10, 11); the browser tests leave some flows uncovered (issue 13).
4. The gitleaks secret scan has never been seen running (issue 14).
5. The restaurant heuristic is often not optimal on larger services (issue 15).
6. No migration tool (issue 7); single-tenant shortcuts (issue 9).
7. Ownership of the code by each member is still to be shown (issue 27). The
   code was written with an AI coding assistant; see `docs/team/ai-use.md`.

## Where we think we are strong (with evidence, not a grade)

- The "no double booking" design: the database decides, and tests with many
  threads prove one winner.
- Explainable optimisers with a measured gap against proven optima.
- Clear docs and a decisions log that records every change to the plan.

## Official brief criteria (to fill in)

| Criterion from the brief (paste the exact words) | Status | Evidence (file path) | Gap |
|---|---|---|---|
| | | | |
| | | | |
| | | | |
| | | | |
| | | | |
