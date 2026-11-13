# Risk log

Things that could go wrong, how likely and how bad we think they are, what we
already do about them, and which role watches each one. Likelihood and impact
are the team's judgement (Low, Medium, High), not measurements. The mitigation
column names only things that exist in the code or docs on 2026-11-10; what is
still to do is marked "to do".

Owner roles:

- **Events owner:** the events team (Simao, Federico).
- **Restaurants owner:** the restaurants team (Sergio, Martim).
- **Platform owner:** whoever looks after `backend/app/` core, `main.py`,
  `config.py`, `db.py` and CI that week.
- **Deploy owner:** the one person who runs the deployment in
  [`deployment.md`](deployment.md).

Review this log before the demo and after any deploy.

| # | Risk | Likelihood | Impact | Mitigation | Owner role |
|---|---|---|---|---|---|
| R1 | The app has never run on Vercel, so something in the real platform behaves differently from the local tests | High | High | `vercel.json`, `api/index.py` and the Python runtime were checked against the Vercel docs (decisions log, "Vercel wiring"). To do: deploy early following `deployment.md` and record the result | Deploy owner |
| R2 | Vercel buffers the live stream, so updates arrive late | Medium | Medium | Not checked yet. Pages also reconnect every 25 s and fall back to polling every 2 s when the stream fails. To do: test in step 5 of `deployment.md` | Platform owner |
| R3 | Two people take the same seat or table at the same moment | Medium | High | UNIQUE constraints on `holds`, `seat_assignments` and the primary key of `table_slots`; the loser gets 409 (`data-model.md`). Tested on SQLite and on a local Postgres 16.2, including a two-guest race (README test report) | Platform owner |
| R4 | Two restaurant bookings at the same moment pass the covers cap by one party | Low | Low | The cap check first locks the service period's row (`restaurant_service/availability.py`, `_lock_period`), so simultaneous bookings are checked one at a time; `test_covers_cap_holds_under_concurrent_confirms` covers it on SQLite. Not checked on Postgres in the final verification. Tables cannot be double booked in any case | Restaurants owner |
| R5 | Postgres deadlocks under load turn into errors | Low | Medium | Every event write takes the event lock first; sqlstate `40P01` or `40001` answers 409 "please try again" with nothing saved (`main.py`) | Events owner |
| R6 | A schema change is not applied to an existing Postgres database (no general migration tool) | Medium | High | `app.seed.migrate` adds missing tables and the columns and indexes listed in `NEW_COLUMNS` and `NEW_INDEXES` (since guest accounts), and a test upgrades the frozen old schema on SQLite and Postgres. To do: every later new column goes into those lists, with a test, in the same pull request | Platform owner |
| R7 | A secret (`SECRET_KEY`, `DEMO_KEY`, `CRON_SECRET`, `RESEND_API_KEY`, database URL) leaks into the repository | Low | High | Secrets only from environment variables; `.env` ignored by git; gitleaks scan in CI on the whole history | Platform owner |
| R8 | Someone wipes the graded demo with `POST /api/demo/reset` | Low | High | Needs the `X-Demo-Key` header; an empty `DEMO_KEY` rejects everyone; rate limited to 5 calls a minute per address | Deploy owner |
| R9 | Demo emails reach strangers | Low | High | `EMAIL_ALLOWLIST` applies to every provider; all seed emails end in `@example.com` | Platform owner |
| R10 | Real email cannot be sent because we own no verified domain | High | Low | The demo runs on the console provider and every email is still stored in the outbox (`email.md`). Real email is optional for the demo | Deploy owner |
| R11 | Email cron stops (GitHub disables or delays scheduled workflows, wrong secret) | Medium | Medium | `email-cron.yml` fails red on a 401 or 500; "Run workflow" by hand before a demo; the outbox keeps rows until they are sent | Deploy owner |
| R12 | An optimiser request runs past Vercel's 30 s limit | Low | Medium | The iteration budget stops the search; a 15 s safety cut-off returns the best answer so far; tests read `vercel.json` (decisions log, events and restaurants fixes, item 3) | Events owner |
| R13 | The free database or email plan runs out during the demo | Low | Medium | Resend's free limits are written in `email.md`. To do: check the Neon plan limits when the database is created (not done yet) | Deploy owner |
| R14 | Personal links (`/e/<token>`, `/b/<token>`) leak | Low | Medium | Tokens stored as hashes; `Referrer-Policy: no-referrer`; organisers can issue a new link, which revokes the old one | Events owner |
| R15 | A team member cannot explain a part of the code in the live walkthrough | Medium | High | Contract section 8 style rules; a `READ_ME_FIRST.md` with likely questions in every package. To do: each member reads the ones for their area aloud before the presentation | All four |
| R16 | Parallel work breaks someone else's module | Medium | Medium | Ownership rule in contract section 3; CI on every pull request; one reviewer per pull request (`CONTRIBUTING.md`) | Platform owner |
| R17 | Accessibility problems that our checks cannot see (screen readers, real touch devices) | Medium | Medium | Colour contrast check in CI (`npm run contrast`); keyboard support in the seat map; Playwright browser tests at phone and desktop sizes, with an axe-core scan of six pages (`frontend/e2e/`). Screen readers and real devices: not tested yet | Events owner and Restaurants owner |
| R18 | A known vulnerability appears in a dependency | Medium | Medium | Exact pins in `requirements.txt` and `package-lock.json`; `pip-audit` and `npm audit --audit-level=high` in CI | Platform owner |
| R19 | No database backup before the demo | Medium | Medium | The demo can be re-seeded with `POST /api/demo/reset`. To do: check what backups the Neon plan offers (not done yet) | Deploy owner |

## Restaurant platform rehearsal (2026-11-13, desktop 1280 px and phone 390 px)

Looked at the discovery page, a public restaurant page and the booking table step in both sizes. Risks left, none blocking:

- **Map tiles.** The maps load tiles from tile.openstreetmap.org (CSP and referrer policy are set, see decisions 15 and the spec). Not checked on the
  real deployment; with no network the lists still work and the map says tiles are unavailable.
- **Demo photos are drawings** (`seed/demo_photos.py`), 400 x 225, so they look soft in the large cover. Replace them with licensed photos before showing real venues.
- ~~Discovery filters were tall on desktop~~ Fixed: eight cuisines show first, the rest sit behind "More cuisines" (a chosen one always stays visible).
- ~~Tap on a table held it at once~~ Fixed: a tap or Enter on the map now chooses the table and shows its card; "Hold this table" there reserves it (announced to screen readers). Service plan and what-if ignore ambience wishes. ~~The staff map had no marked chair~~ Fixed: the chair a guest asked for is drawn with the "mine" mark on the staff map and explained in its key.
- **Concurrency of two owner tabs** is covered (`room-editor.spec.ts`); two staff changing a booking's chair at once is not (last write wins, it is only a wish).
- **Flaky tests not from this work:** see `docs/test-report.md`.
