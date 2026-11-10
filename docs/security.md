# Security review

A red-team audit of the whole SeatPlan backend, its Vercel configuration and
its dependencies, done on 2026-11-10. We played the attacker against every
route, then fixed what we could and wrote a test for each fix.

**Verdict.** We found no Critical and no High problem. We found 23 issues:
7 are fixed (1 Medium, 6 Low), 16 stay open (2 Medium, 12 Low, 2 for
information). The open Medium ones are booking abuse by one person
(S8) and personal links kept in the email outbox (S9). The app has not
been deployed yet, so nothing here was tested on a real Vercel deployment.

## 1. How we tested

- Read every router in `backend/app/routers/` (65 API operations, listed from
  the app's own OpenAPI schema) and the service code behind them.
- Attacked a running copy of the app in-process (FastAPI `TestClient`, fresh
  SQLite, demo data from `POST /api/demo/reset`), with a second organiser
  account playing the attacker. The probe script stayed outside the repository.
- Asked the Vercel documentation (request headers page) how Vercel treats
  `X-Forwarded-For`.
- Ran the dependency audits and the whole backend test suite (section 7).

Every number in this file comes from the code or from those runs.

## 2. Threat model

**What we protect**

| Asset | Where it lives |
|---|---|
| Guests' and diners' personal data: names, emails, phone, dietary notes, accessibility needs | `guests`, `bookings`, `waitlist_entries`, `email_outbox` |
| Personal links (attendee `/e/<token>`, manage `/b/<token>`) | Only SHA-256 hashes in `guests.token_hash` and `bookings.manage_token_hash` (but see S9) |
| Organiser and staff sessions | HMAC-signed tokens, `backend/app/security.py` |
| Seats and tables: nobody may lose a seat they own | UNIQUE constraints on `seat_assignments`, `table_slots`, `holds` |
| Server secrets: `SECRET_KEY`, `DEMO_KEY`, `CRON_SECRET`, `RESEND_API_KEY`, `DATABASE_URL` | Environment variables, read only in `backend/app/config.py` |
| The bill and the email reputation | Vercel function time, the database, Resend |

**Who might attack**

1. Anyone on the internet: can call every public route (diner, live, health,
   login, demo links when demo mode is on).
2. An attendee with a valid personal link who wants to see more of other
   guests or reach another event.
3. A diner with a manage link who wants to reach other bookings.
4. A logged-in organiser who wants another organiser's venue, event or guests.
5. A staff member (by design they see every restaurant, see S12).
6. Someone who gets a copy of the database or of the server logs.

**Trust boundaries**: the browser and the API (`/api/*`), the API and the
database, the API and Resend, the GitHub Actions cron and
`/api/internal/email/process`.

## 3. Findings

Severity: Critical (anyone can take over accounts or data), High (serious data
leak or takeover with some effort), Medium (real harm, limited), Low (small
harm or needs unusual access), Info (worth knowing, no harm found).

Line numbers are those of 2026-11-10, after the fixes.

| ID | Severity | Where | Attack | Fix | Status |
|---|---|---|---|---|---|
| S1 | Medium | `backend/app/security.py:140` (`client_ip`) | Every per-address rate limit used the first value of `X-Forwarded-For`, which the caller can type. Measured before the fix: 15 wrong logins with 15 made-up addresses all got 401, never 429. On Vercel this was safe, because Vercel overwrites the header (Vercel docs, "Request headers"), but on any other host or a laptop open to a network, login guessing, link guessing and hold limits had no limit at all. | Trust `X-Forwarded-For` only when `VERCEL` is set (`Settings.trust_forwarded_for`, `config.py:145`); everywhere else use the socket address. | Fixed. Tests `test_s1_*` |
| S2 | Low | `backend/app/routers/venues.py:26` | An organiser could save a venue with time zone `Not/AZone`. Every public page of that restaurant then answered 500 (`GET /api/r/{id}` returned 500 in our probe), and seat emails for that venue would fail. | `known_time_zone` refuses names `ZoneInfo` does not know, including folder names such as `Europe` and paths. | Fixed. Tests `test_s2_*` |
| S3 | Low | `backend/app/main.py:102` | A diner could hold a table on 9999-12-31 at 22:45; booking it crashed with 500, because the stay ends at midnight of year 10000. The staff dashboard for 0001-01-01 crashed the same way. | `OverflowError` is answered 422 `validation` ("This date is too far in the past or the future.") instead of 500. | Fixed. Tests `test_s3_*` |
| S4 | Low | `backend/app/mail/providers.py:60` | The console email provider wrote every full recipient address into the server log, which more people can read than the outbox. | The log line shows a masked address (`an***@example.com`). `mask_email` moved to `backend/app/core/privacy.py:32` so the email log and the provider share it. | Fixed. Test `test_s4_*` (and `test_mail_providers.py` updated) |
| S5 | Low | `backend/app/config.py:97` | `SECRET_KEY=secret` was accepted on Postgres. Anyone holding one session token could then guess the key offline and sign a session for any user id. | On Postgres a key shorter than 32 characters stops the app at start-up with a clear message. Local SQLite still makes a random 64-character key. | Fixed. Test `test_s5_*` |
| S6 | Low | `vercel.json` (headers) | The API sent `Strict-Transport-Security`, but the static pages (where the personal links open) did not, so a first visit over plain HTTP could be downgraded. | Added `Strict-Transport-Security: max-age=31536000; includeSubDomains` to every path. | Fixed. Test `test_s6_*` |
| S7 | Low | `backend/app/security.py:156` (`_stored_key`) | The `rate_limits` table stored raw IP addresses (`login:203.0.113.5`), which are personal data, kept with no end date. `holding.client_key` already hashed addresses; the rate limit did not. | The part after the first `:` is stored as an HMAC-SHA256 keyed with `SECRET_KEY` (32 hex characters). | Fixed. Test `test_s7_*` |
| S8 | Medium | `backend/app/routers/restaurants.py:197` (book), `backend/app/restaurant_service/holding.py:80` | One person can fill a restaurant with fake bookings: hold, book, repeat. The hold caps only count live holds, and a booking ends the hold, so the only brake is 20 holds a minute per address. In our probe one client turned every hold it had left that minute into a booking (13 bookings for one date, its other 7 holds were earlier probes), then got 429; a minute later it can go on. No email check is needed to book. | Options: a daily cap of bookings per client and venue; confirm by email before the table is kept; a CAPTCHA. A cap per address would also hit a whole classroom on one Wi-Fi during the demo, so the team must choose. | Open |
| S9 | Medium | `backend/app/restaurant_service/emails.py:29`, `backend/app/mail/outbox.py:35` | Contract section 4 says secret tokens are stored only as hashes, but every email body in `email_outbox` keeps the raw link. Checked: after a diner booking, both the confirmation (status `skipped`) and the queued reminder contain the raw manage token in `body_text` and `body_html`. Anyone with a copy of the database or a backup can view, change or cancel those bookings, and open attendee pages. Rows are never deleted. | Blank `body_text`, `body_html` and `ics` once a row is `sent`, `skipped` or `failed`, and delete old rows after a set time. Not done here because the local demo reads emails from the outbox (the console provider prints no body on purpose). | Open |
| S10 | Low | `backend/app/routers/bookings.py:117` | The waitlist accepts 10 entries a minute per address, with no check for duplicates. An attacker can push real diners down the queue and receive the table offers first. | Refuse a second waiting entry for the same email, venue and date; daily cap per client. | Open |
| S11 | Low | `backend/app/routers/emails.py:85` | `GET /api/emails/log` shows every outbox row to any organiser, with no owner filter. Checked: after a wedding guest confirmed a seat, our second organiser (who owns nothing) saw 2 rows, the first with subject "Reminder: Ana and Bruno's wedding, Sat 12 Jun 2027, 16:00" and address `ze***@example.com`. | Add a venue column to `email_outbox` and filter by owner. Accepted for now: single-tenant demo (decisions log, email entry 3), and there is no sign-up route, so the seed makes the only accounts. | Open, accepted |
| S12 | Low | `backend/app/routers/venues.py:135`, `backend/app/restaurant_service/venue_access.py:21` | A staff account sees every venue (including event venues in `GET /api/venues`) and can change bookings and schedules of every restaurant. | Link staff to venues. Accepted for now: decisions log, foundation entry 10. | Open, accepted |
| S13 | Low | `backend/app/security.py:27`, `:95` | A stolen session token works for up to 12 hours. There is no server-side logout, and a password reset does not end old sessions. | Store a session version per user and put it in the signed token; raise it on logout or password change. | Open |
| S14 | Low | `backend/app/routers/auth.py:50` | Login is limited to 10 tries a minute per address only. Many addresses together can keep guessing one account; scrypt (`n=2**14`) makes each guess slower but does not stop it. | A per-account limit, chosen with care, because it also lets an attacker lock the real organiser out. | Open |
| S15 | Low | `/api/a/{token}`, `/api/b/{token}` | Personal tokens travel in the URL path, so the platform's request logs record them. `Referrer-Policy: no-referrer` stops them leaking to other websites. | Accepted: link-in-email is the product. Keep logs private and short-lived. | Open, accepted |
| S16 | Low | `backend/app/core/live.py:110`, `:115` | Anyone who knows an event's public id can read its change counter (how busy it is) without a login. `GET /live/{scope}/version` has no rate limit, and each SSE stream keeps a function running for 25 s (30 opens a minute per address, 50 per instance), which costs money if many addresses open streams. | Rate-limit the version route; consider an unguessable live scope per event. | Open |
| S17 | Low | `backend/app/routers/attendee.py:92` | The people list gives every guest a stable numeric id. If a guest turns on "anonymous" after another attendee has seen their name, that attendee can still follow the same id and its seat. | Per-viewer ids, or a new id when a guest becomes anonymous. | Open |
| S18 | Low | `backend/app/mail/providers.py:116`, `backend/app/mail/outbox.py:136` | Up to 300 characters of Resend's error text are stored in `last_error` and shown in the organiser's email log; such text may quote the recipient. | Store only the status code and a fixed message. | Open |
| S19 | Low | `backend/app/restaurant_service/schedule.py:94` | `check_bookable` refuses past times only, so bookings and waitlist entries can be made for any date up to 9999-12-30 (a probe booking on 9999-12-30 got 201). Junk data; after S3 it no longer crashes. | A booking horizon, for example one year ahead. | Open |
| S20 | Info | `backend/app/main.py:156` | `GET /api/openapi.json` and `/api/docs` are public, so an attacker gets the full route list. The code is public anyway. | Turn the docs off on Postgres if the team wants. | Open, accepted |
| S21 | Info | `backend/app/events_service/schemas.py:72`, `backend/app/events_service/plans.py:47` | A logged-in organiser can run auto-fill (up to 100 000 iterations, 15 s safety cut-off) as often as they like, and each run stores a new scenario with no limit. Only their own events are affected. | A per-organiser rate limit and a cap on stored scenarios. | Open |
| S22 | Low | `backend/app/routers/demo.py:67`, `:53` | With `DEMO_MODE=1`, `GET /api/demo/links` gives anyone the raw demo attendee links, and the reset (with `X-Demo-Key`) wipes every table except accounts and rate limits. Safe for a demo; dangerous if real data ever lives in the same database. | Never run demo mode on a database with real data (README already says the key is the only way in). | Open, accepted |
| S23 | Low | whole schema | No retention: bookings, waitlist entries, outbox rows and the audit log are kept for ever, and a diner can cancel but cannot ask for erasure in the app (guests can, through the organiser). See section 6. | A scheduled clean-up and a diner erasure route. | Open |

### Checked and not vulnerable

| Area | What we tried | Result |
|---|---|---|
| Tenant isolation | Second organiser on the first organiser's event, guests, CSV export, restaurant floor and schedule | 404 every time (`events_service/access.py:33`, `restaurant_service/venue_access.py:21`) |
| Attendee reaching another event | Wedding guest holds a conference seat; marks conference guests as known | 404 "Seat not found." and 422 (`events_service/seating.py:48`, `routers/attendee.py:171`) |
| Organiser IDOR | Seat from another venue in an assignment and in what-if; guest of another event through this event's URL | 404, 422, 404 |
| Layout ids from another venue | Existing test `test_layout_rejects_ids_from_another_venue` | 422 (`core/layout.py:38`) |
| Staff on organiser routes | Staff token on `GET /api/events/{id}` | 403 (`security.py`, `require_organiser`) |
| Token handling | Wrong, revoked and too long tokens | Same 404; tokens over 128 characters refused before hashing (`events_service/access.py:56`); hashes compared, never tokens |
| SQL injection | Searched for string-built SQL | Only bound parameters; the two `text()` calls are fixed strings (`db.py:80`, `routers/health.py:22`) |
| Email header injection | Event and guest names containing `\r\nBcc: victim@example.com` | Subject came out on one line; the `.ics` had no injected line (`SUMMARY:Gala\nBcc: ...` escaped); HTML escaped (`mail/templates.py:46`, `mail/ics.py:28`) |
| CSV formula injection | Imported `=HYPERLINK("http://evil.example.com")` and `+1`; exported | Exported as `'=HYPERLINK(...)` and `'+1` (`events_service/csv_io.py:140`); a 5 MB upload got 422 "larger than 200 KB" |
| Cron endpoint | Missing, wrong and empty `CRON_SECRET` | 401; empty secret rejects all; 30 calls a minute per address; constant-time compare (`routers/emails.py:46`) |
| Demo reset | No key, empty `DEMO_KEY`, login session | 401 (existing tests in `test_demo_live.py`) |
| Error messages | Unexpected errors | `{"error": {"code": "internal", "message": "Something went wrong."}}`, no stack trace (`main.py`) |
| CORS and headers | Existing tests | Only `FRONTEND_ORIGIN`; `nosniff`, `DENY`, `no-referrer`, HSTS, `Cache-Control: no-store` on the API; CSP and framing rules on static pages |
| Secrets in the repository | Searched sources for keys and passwords | Only placeholders (`.env.example`, `docs/runbook.md`); `.env` is ignored |

## 4. Authorisation on every route

| Routes | Who may call | Guard |
|---|---|---|
| `GET /health`, `POST /auth/login` | Anyone | Login: 10 a minute per address |
| `GET /auth/me`, `GET /venues`, `GET /venues/{id}` | Organiser or staff | Session; organisers see only their own venues |
| `POST /venues`, `PUT /venues/{id}/layout`, all 23 `/events...` routes, `GET /emails/log` | Organiser | Session plus `require_organiser`; events checked by `load_event` (owner) |
| 10 `/staff/{vid}/...` routes | Staff (all restaurants) or the owning organiser | Session plus `load_for_staff` |
| 9 `/a/{token}...` routes | Holder of the attendee link | 120 a minute per address, then token hash |
| 7 `/r/{vid}...` routes (waitlist included) | Anyone | 120 reads, 20 holds, 30 bookings, 10 waitlist joins a minute per address; hold caps |
| 3 `/b/{token}` routes | Holder of the manage link | 30 a minute per address, then token hash |
| `POST /demo/reset` | Holder of `DEMO_KEY`, demo mode only | 5 a minute per address, then key |
| `GET /demo/links` | Anyone, demo mode only | None (S22) |
| `POST /internal/email/process` | Holder of `CRON_SECRET` | 30 a minute per address, then secret |
| `GET /live/{scope}/version`, `/stream` | Anyone | Scope pattern; stream: 30 a minute per address, 50 per instance (S16) |

## 5. OWASP Top 10 (2021)

| Category | SeatPlan |
|---|---|
| A01 Broken access control | Owner checks in `events_service/access.py:33` and `restaurant_service/venue_access.py:21`; missing and forbidden both give 404. Open: S11, S12 (accepted single-tenant choices). |
| A02 Cryptographic failures | scrypt passwords, SHA-256 token hashes, HMAC-SHA256 sessions (`security.py`). Fixed S5 (weak key), S6 (HSTS). Open: S9 (raw links in the outbox). |
| A03 Injection | Bound SQL parameters only; CSV export prefixes formula characters; email subject, HTML and `.ics` escaped; `PlainText` refuses control characters (`core/text.py`). Nothing open. |
| A04 Insecure design | Database constraints stop double booking. Open: S8 and S10 (booking and waitlist abuse), S19 (no horizon). |
| A05 Security misconfiguration | Security headers on API and static pages; CORS to one origin; demo reset needs a key. Fixed S1, S2. Open: S20, S22. |
| A06 Vulnerable and outdated components | `pip-audit` and `npm audit`: no known vulnerabilities (section 7). |
| A07 Identification and authentication failures | Login rate limit, same message for wrong email and wrong password, dummy hash for unknown emails (`routers/auth.py:23`). Open: S13, S14. |
| A08 Software and data integrity failures | Pinned dependencies; CI runs gitleaks and pip-audit (README). No hashes on requirements (pip-audit warns). |
| A09 Security logging and monitoring failures | `audit_log` on every write, without tokens or emails (`core/audit.py`). Fixed S4. Open: S18; no alerting exists. |
| A10 Server-side request forgery | The only outgoing call is to the fixed Resend URL (`mail/providers.py:23`); no user-given URL is fetched. |

## 6. GDPR

| Principle | How the code meets it | Gaps |
|---|---|---|
| Lawful basis | Our reading, not legal advice: diners give name, email and optional phone to make a booking, so the basis is performance of a contract (Art. 6(1)(b)). Guests are added by the organiser, who decides why their data is used (controller); SeatPlan stores it for them (processor). Emails are only about the booking or seat; the footer says "We never send marketing" (`mail/templates.py`). | We did not check whether the frontend shows a privacy notice. |
| Data minimisation | Other attendees see only privacy-filtered names (`core/privacy.py`), never email, dietary note or accessibility need; the people search only searches the visible name (`routers/attendee.py:76`); the email log masks addresses (`core/privacy.py:32`); IP addresses are stored only as keyed hashes (fixed S7, and `restaurant_service/holding.py:55`); audit rows hold ids, not names (`events_service/guests.py:156`); the console log masks addresses (fixed S4). | Raw links in outbox bodies (S9); stable guest ids (S17). |
| Right to erasure | `DELETE /api/events/{eid}/guests/{gid}` overwrites name, email, dietary note and needs, deletes acquaintances, frees the seat, revokes the link (`events_service/guests.py:129`) and blanks that guest's outbox rows (`events_service/mailer.py:143`). | Diners and waitlist entries have no erasure route (S23); staff would have to delete rows by hand. |
| Retention | Rate-limit rows of past windows are deleted when the same key comes back (`security.py`); demo reset wipes demo data. | No time limit on bookings, waitlist, outbox or audit log (S23). A suggested rule: delete or anonymise diner data some months after the visit, and outbox bodies once sent. The team has not decided a period. |
| Security of processing (Art. 32) | Sections 3 and 5. | Not tested on a real deployment. |

## 7. Commands run on 2026-11-10

From `backend/`:

| Command | Real output |
|---|---|
| `../.venv/bin/python -m pytest -p no:cacheprovider` before any change | `431 passed, 1 warning` |
| `../.venv/bin/python -m pytest -p no:cacheprovider tests/test_redteam.py` before the fixes S1 to S6 | `8 failed, 1 passed, 1 warning` (the one pass is the on-Vercel case, which already worked); the S7 test, added later, also failed first (`1 failed`) |
| same file, after all fixes (with more time zone cases) | `12 passed, 1 warning` |
| `../.venv/bin/python -m pytest -p no:cacheprovider` after all fixes | `443 passed, 1 warning` |
| `../.venv/bin/ruff check .` | `All checks passed!` |
| `../.venv/bin/ruff format --check .` | `135 files already formatted` |

From the repository root and `frontend/`:

| Command | Real output |
|---|---|
| `.venv/bin/pip-audit -r requirements.txt --no-deps --disable-pip` | `No known vulnerabilities found` |
| `.venv/bin/pip-audit` (every package in the virtual environment, dev tools included) | `No known vulnerabilities found` |
| `npm audit` (all frontend packages) | `found 0 vulnerabilities` |
| `npm audit --omit=dev` | `found 0 vulnerabilities` |

## 8. Not tested

- A real Vercel deployment: not done yet. We rely on Vercel's documentation
  for `X-Forwarded-For`; whether Vercel adds HSTS by itself, its request size
  limit and whether it buffers the live stream were not checked.
- Postgres: this audit ran on SQLite only (the opt-in Postgres test run was
  not repeated today).
- Real email through Resend: not done yet, so SPF, DKIM and DMARC of a
  sending domain were not checked.
- The frontend code was not audited line by line. We only searched it for
  `dangerouslySetInnerHTML`, `innerHTML`, `eval` and `localStorage` (none in
  app code; the session token is in `sessionStorage`).
- Denial of service with real traffic, load or many addresses.
- GitHub Actions settings and repository secrets (only the workflow files
  were read).
- The gitleaks scan (it runs only in CI).
