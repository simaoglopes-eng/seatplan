# Security review

A red-team audit of the whole SeatPlan backend, its Vercel configuration and
its dependencies, done on 2026-11-10. We played the attacker against every
route, then fixed what we could and wrote a test for each fix.

**Verdict.** We found no Critical and no High problem. We found 23 issues:
9 are fixed (3 Medium, 6 Low), 14 stay open (12 Low, 2 for information).
No Medium issue is open: booking abuse by one person (S8) and personal links
kept in the email outbox (S9) were fixed later the same day, then attacked
again by a second reviewer, who found and closed two more holes in S8 and two
in S9 (section 3). The app has not been deployed yet, so nothing here was
tested on a real Vercel deployment.

**Guest accounts and the shared link (added 2026-11-10, reviewed the same
night).** Two reviews of the new feature found 1 High, 6 Medium and 5 Low
security problems (S30 to S41) and one High capacity bug. 11 are fixed, each
with a test that failed before its fix; 1 (S41) is open and accepted. One
product question (the email allowlist, D7) still stops real guests from
getting their code outside the demo. Section 9 has the details.

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
| Personal links (attendee `/e/<token>`, manage `/b/<token>`) | Only SHA-256 hashes in `guests.token_hash` and `bookings.manage_token_hash`; the raw link only in outbox rows still waiting to be sent (S9) |
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

Line numbers are those of 2026-11-10, after the fixes (S8 and S9: after the second review).

| ID | Severity | Where | Attack | Fix | Status |
|---|---|---|---|---|---|
| S1 | Medium | `backend/app/security.py:140` (`client_ip`) | Every per-address rate limit used the first value of `X-Forwarded-For`, which the caller can type. Measured before the fix: 15 wrong logins with 15 made-up addresses all got 401, never 429. On Vercel this was safe, because Vercel overwrites the header (Vercel docs, "Request headers"), but on any other host or a laptop open to a network, login guessing, link guessing and hold limits had no limit at all. | Trust `X-Forwarded-For` only when `VERCEL` is set (`Settings.trust_forwarded_for`, `config.py:145`); everywhere else use the socket address. | Fixed. Tests `test_s1_*` |
| S2 | Low | `backend/app/routers/venues.py:26` | An organiser could save a venue with time zone `Not/AZone`. Every public page of that restaurant then answered 500 (`GET /api/r/{id}` returned 500 in our probe), and seat emails for that venue would fail. | `known_time_zone` refuses names `ZoneInfo` does not know, including folder names such as `Europe` and paths. | Fixed. Tests `test_s2_*` |
| S3 | Low | `backend/app/main.py:102` | A diner could hold a table on 9999-12-31 at 22:45; booking it crashed with 500, because the stay ends at midnight of year 10000. The staff dashboard for 0001-01-01 crashed the same way. | `OverflowError` is answered 422 `validation` ("This date is too far in the past or the future.") instead of 500. | Fixed. Tests `test_s3_*` |
| S4 | Low | `backend/app/mail/providers.py:60` | The console email provider wrote every full recipient address into the server log, which more people can read than the outbox. | The log line shows a masked address (`an***@example.com`). `mask_email` moved to `backend/app/core/privacy.py:32` so the email log and the provider share it. | Fixed. Test `test_s4_*` (and `test_mail_providers.py` updated) |
| S5 | Low | `backend/app/config.py:97` | `SECRET_KEY=secret` was accepted on Postgres. Anyone holding one session token could then guess the key offline and sign a session for any user id. | On Postgres a key shorter than 32 characters stops the app at start-up with a clear message. Local SQLite still makes a random 64-character key. | Fixed. Test `test_s5_*` |
| S6 | Low | `vercel.json` (headers) | The API sent `Strict-Transport-Security`, but the static pages (where the personal links open) did not, so a first visit over plain HTTP could be downgraded. | Added `Strict-Transport-Security: max-age=31536000; includeSubDomains` to every path. | Fixed. Test `test_s6_*` |
| S7 | Low | `backend/app/security.py:156` (`_stored_key`) | The `rate_limits` table stored raw IP addresses (`login:203.0.113.5`), which are personal data, kept with no end date. `holding.client_key` already hashed addresses; the rate limit did not. | The part after the first `:` is stored as an HMAC-SHA256 keyed with `SECRET_KEY` (32 hex characters). | Fixed. Test `test_s7_*` |
| S8 | Medium | `backend/app/routers/restaurants.py:212` (book), `backend/app/restaurant_service/booking_caps.py:77` | One person could fill a restaurant with fake bookings: hold, book, repeat. The hold caps only count live holds, and a booking ends the hold, so the only brake was 20 holds a minute per address. In our probe one client turned every hold it had left that minute into a booking (13 bookings for one date, its other 7 holds were earlier probes), then got 429; a minute later it could go on. No email check is needed to book. Second review: the first fix could be dodged with `name+1@`, `name+2@` (a new mailbox to the code, the same inbox in real life) and, on IPv6, with a new address per request inside one /64 (measured: the 11th booking from a new address in the same /64 got 201). | Two caps before the booking is written, both 429 `rate_limited`, the hold kept: (1) one mailbox may have at most 4 upcoming diner bookings at one restaurant (`mailbox()`: lower case, `+tag` dropped; dots are kept, since only some providers ignore them); (2) one client address may make at most 10 booking attempts at one restaurant per UTC day (`network_of()`: IPv6 counted by its /64; stored as a keyed hash through `rate_limit`). Staff bookings and walk-ins never count. Limits: soft (two requests at the same instant can both pass); the email is unchecked, so a new made-up email always passes the first cap and the address cap is the real brake; a burst at midnight UTC can reach 20; more than 10 bookings at one restaurant in a day from one Wi-Fi address (a classroom demo, or one presenter rehearsing, since the demo reset keeps `rate_limits`) get the 429, so the team should confirm the number. | Fixed. Tests in `test_booking_cap.py` (13) |
| S9 | Medium | `backend/app/mail/outbox.py:56` (`_forget_links`), `:237` (`scrub_expired`) | Contract section 4 says secret tokens are stored only as hashes, but every email body in `email_outbox` kept the raw link. Checked: after a diner booking, both the confirmation (status `skipped`) and the queued reminder contained the raw manage token in `body_text` and `body_html`. Anyone with a copy of the database or a backup could view, change or cancel those bookings, and open attendee pages. Rows were never deleted. Second review: the first fix searched the invite as stored, but RFC 5545 folds lines at 75 octets, so a link in an invite description was cut in two and the rest of the token stayed (measured); and `last_error` kept a link when a provider error quoted it. | A `queued` row keeps its link (the email and its retries must work). When a row ends `sent`, `skipped` or `failed`, every `/b/`, `/e/` and `/a/` link in `body_text`, `body_html`, the unfolded invite and `last_error` becomes `[personal link removed]`; subject, recipient, status and times stay. Cancelled reminders (`drop_reminder`, the event reminder's `_cancel`) are blanked. Every cron call also runs `scrub_expired`, which empties words and invite of finished rows 30 days after `sent_at` (or `next_attempt_at` when never sent). `GET /emails/log` runs subject and error through `redact_links`. Limits: a waiting reminder holds its link until it goes; a new kind of personal link must be added to `_PERSONAL_LINK`; retention runs only when the cron runs. | Fixed. Tests in `test_outbox_retention.py` (13), including a scan of every table for the raw token |
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
| S23 | Low | whole schema | No retention: bookings, waitlist entries and the audit log are kept for ever (outbox words and invites now go after 30 days, S9), and a diner can cancel but cannot ask for erasure in the app (guests can, through the organiser). See section 6. | A scheduled clean-up and a diner erasure route. | Open |

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
| 7 `/r/{vid}...` routes (waitlist included) | Anyone | 120 reads, 20 holds, 30 bookings, 10 waitlist joins a minute per address; hold caps; booking caps (4 upcoming per mailbox, 10 a day per address, S8) |
| 3 `/b/{token}` routes | Holder of the manage link | 30 a minute per address, then token hash |
| `GET /j/{token}` | Anyone with the shared link | 600 a minute per address, then token hash; 403 when switched off |
| `POST /j/{token}/register` | Anyone with the shared link | Link and deadline first, then code limits (section 9) |
| `POST /j/{token}/join` | Guest account | Guest session, 30 a minute per address, token, capacity after the event lock |
| `POST /guest/verify`, `/guest/login`, `/guest/password/forgot`, `/guest/password/reset` | Anyone | Code, login and failed-login limits (section 9) |
| `POST /guest/logout`, `GET /guest/me`, `POST /guest/me/delete` | Guest account | Guest session (5-part token, own signed message); delete: password and 10 a minute |
| 10 `/guest/events/{eid}...` routes | Guest account with an active guest row on that event | Guest session, 120 a minute per address, then `load_account_guest` (404 otherwise) |
| `GET`, `PATCH /events/{eid}/share`, `POST /events/{eid}/share/regenerate` | Organiser who owns the event | Session, `require_organiser`, `load_event` |
| `POST /demo/reset` | Holder of `DEMO_KEY`, demo mode only | 5 a minute per address, then key |
| `GET /demo/links` | Anyone, demo mode only | None (S22) |
| `POST /internal/email/process` | Holder of `CRON_SECRET` | 30 a minute per address, then secret |
| `GET /live/{scope}/version`, `/stream` | Anyone | Scope pattern; stream: 30 a minute per address, 50 per instance (S16) |

## 5. OWASP Top 10 (2021)

| Category | SeatPlan |
|---|---|
| A01 Broken access control | Owner checks in `events_service/access.py:33` and `restaurant_service/venue_access.py:21`; missing and forbidden both give 404. Open: S11, S12 (accepted single-tenant choices). |
| A02 Cryptographic failures | scrypt passwords, SHA-256 token hashes, HMAC-SHA256 sessions (`security.py`). Fixed S5 (weak key), S6 (HSTS), S9 (raw links in the outbox). |
| A03 Injection | Bound SQL parameters only; CSV export prefixes formula characters; email subject, HTML and `.ics` escaped; `PlainText` refuses control characters (`core/text.py`). Nothing open. |
| A04 Insecure design | Database constraints stop double booking; booking caps (fixed S8). Open: S10 (waitlist abuse), S19 (no horizon). |
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
| Data minimisation | Other attendees see only privacy-filtered names (`core/privacy.py`), never email, dietary note or accessibility need; the people search only searches the visible name (`routers/attendee.py:76`); the email log masks addresses (`core/privacy.py:32`); IP addresses are stored only as keyed hashes (fixed S7, and `restaurant_service/holding.py:55`); audit rows hold ids, not names (`events_service/guests.py:156`); the console log masks addresses (fixed S4). | Stable guest ids (S17). |
| Right to erasure | `DELETE /api/events/{eid}/guests/{gid}` overwrites name, email, dietary note and needs, deletes acquaintances, frees the seat, revokes the link (`events_service/guests.py:129`) and blanks that guest's outbox rows (`events_service/mailer.py:143`). | Diners and waitlist entries have no erasure route (S23); staff would have to delete rows by hand. |
| Retention | Rate-limit rows of past windows are deleted when the same key comes back (`security.py`); demo reset wipes demo data; a finished outbox row loses its personal links at once and its words and invite 30 days after `sent_at`, or after `next_attempt_at` when never sent (`mail/outbox.py`, S9). | No time limit on bookings, waitlist, the rest of each outbox row (subject, recipient) or the audit log (S23). A suggested rule: delete or anonymise diner data some months after the visit. The team has not decided a period. |
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

S8 and S9, later the same day (first the two fixes, then a second review that
attacked them):

| Command | Real output |
|---|---|
| `... pytest tests/test_booking_cap.py` with its first 7 tests, on the code before the S8 fix (fixer's run) | `2 failed, 5 passed, 1 warning in 1.48s` (the email cap and the address cap) |
| the 9 S9 tests with the new behaviour switched off in a temporary copy (fixer's run) | `9 failed, 1 warning in 1.21s` |
| second review: 6 attack tests added to `tests/test_booking_cap.py`, run on the first S8 fix | `2 failed, 11 passed, 1 warning in 3.89s` (`lia.moreno+again@example.com` got 201; the 11th booking from `2001:db8:1:2:ffff::1` after 10 from the same /64 got 201) |
| second review: 4 attack tests added to `tests/test_outbox_retention.py`, run on the first S9 fix | `1 failed, 12 passed, 1 warning in 1.22s` (the tail of a token folded across two invite lines stayed); with only the `last_error` part of the fix taken out again, the same test gave `1 failed` with the token in `last_error` |
| `... pytest tests/test_booking_cap.py`, after both fixes | `13 passed, 1 warning in 2.65s` |
| `... pytest tests/test_outbox_retention.py`, after both fixes | `13 passed, 1 warning in 1.07s` |
| `../.venv/bin/python -m pytest -p no:cacheprovider` (whole suite, SQLite) | `469 passed, 1 warning in 31.52s` |
| the same with `SEATPLAN_TEST_POSTGRES` on a throwaway local Postgres 16.2 cluster (deleted afterwards) | `468 passed, 1 skipped, 1 warning in 62.08s (0:01:02)` |
| `../.venv/bin/ruff check .`; `../.venv/bin/ruff format --check .` | `All checks passed!`; `138 files already formatted` |

From the repository root and `frontend/`:

| Command | Real output |
|---|---|
| `.venv/bin/pip-audit -r requirements.txt --no-deps --disable-pip` | `No known vulnerabilities found` |
| `.venv/bin/pip-audit` (every package in the virtual environment, dev tools included) | `No known vulnerabilities found` |
| `npm audit` (all frontend packages) | `found 0 vulnerabilities` |
| `npm audit --omit=dev` | `found 0 vulnerabilities` |
| after S8 and S9: `.venv/bin/pip-audit -r requirements.txt --no-deps --disable-pip`; `npm audit --audit-level=high` | `No known vulnerabilities found`; `found 0 vulnerabilities` |

## 8. Not tested

- A real Vercel deployment: not done yet. We rely on Vercel's documentation
  for `X-Forwarded-For`; whether Vercel adds HSTS by itself, its request size
  limit and whether it buffers the live stream were not checked.
- Postgres: the first audit ran on SQLite only. After the S8 and S9 fixes
  the whole suite, including their tests, also passed on a local Postgres 16.2
  (section 7); the probes of section 1 were not repeated there.
- Real email through Resend: not done yet, so SPF, DKIM and DMARC of a
  sending domain were not checked.
- The frontend code was not audited line by line. We only searched it for
  `dangerouslySetInnerHTML`, `innerHTML`, `eval` and `localStorage` (none in
  app code; the session token is in `sessionStorage`).
- Denial of service with real traffic, load or many addresses.
- GitHub Actions settings and repository secrets (only the workflow files
  were read).
- The gitleaks scan (it runs only in CI).

## 9. Guest accounts and the shared link

The feature is described in `docs/guest-accounts.md`. A security review and
a correctness review attacked it on 2026-11-10 with throwaway tests on a
temporary SQLite database (outside the repository). The fixes and their
tests followed the same night (2026-11-10 and 11). Each fix has a test in
`backend/tests/test_guest_review_fixes.py` (unless named) that failed when
the fix was undone; `docs/test-report.md` lists those runs.

| ID | Severity | Where | Attack | Fix | Status |
|---|---|---|---|---|---|
| S30 | High | `events_service/accounts.py` (`may_show_code`, `code_sent`) | With `DEMO_MODE=1` and the console provider (the documented setting for the graded demo), the sign-up answer carried the code for any address. Anyone typed an invited guest's address, read the code and took over the invitation: `201 {"status": "linked"}`, then the victim's seat page. | `demo_code` only for `@example.com` addresses that no organiser invited; never for a password reset; an account made with a shown code has `email_proven = false` and is never linked to an invitation. | Fixed |
| S31 | Medium | `accounts.start_sign_up`, `finish_sign_up` | The password is chosen at register time and verify needed only email and code. A second register replaced the pending row; the victim typed the newest code and the account got the attacker's password. A code read out on the phone did the same. | A random `signup_id` goes only to the browser that registered; verify needs it (only its keyed hash is stored). The code email says "Never give this code to anyone". A code the victim reads out to the person who started the sign-up still works: that is what an emailed code proves. | Fixed (residual: social engineering) |
| S32 | Medium | `accounts.start_sign_up` | scrypt ran only for new addresses: 8 ms for an existing account against 28 ms for a new one, so the time told who had an account. | scrypt runs for every address. | Fixed |
| S33 | Medium | `routers/visitor.py`, `routers/guest_accounts.py` | Code limits were counted before the link was checked: 3 calls with a made-up link blocked a person's sign-up for an hour; 3 "forgot password" calls did the same; about 25 networks could use up the app-wide 500 an hour. | Link and deadline checked before counting; sign-up and reset counted apart per address; the app-wide count only counts emails really queued. Someone with the real link can still use up one address's 3 sign-up codes an hour. | Fixed (residual noted) |
| S34 | Medium | `mail/templates.account_code` | The name typed on the form went into the code email to any address ("Hello Win a prize at https://evil.example.com/claim"): spam from our domain. | Code emails greet with a plain "Hello,". | Fixed |
| S35 | Medium | `events_service/guests.erase_guest`, `share.join` | A guest the organiser removed rejoined at once (`200 joined`); with no default cap an abuser could keep filling the event. | The erased row keeps the account number (no personal data); `join` answers 403 `forbidden` "The organiser removed you from this event." Account deletion clears it. No default cap or approval step (open question 3 in `guest-accounts.md`). | Fixed (cap: open) |
| S36 | Low | `models.GuestAccount` | SQLite gave a deleted account's id to the next account, so the old token (account id plus version 0) opened the new account. Postgres is not affected. | `sqlite_autoincrement` on `guest_accounts`. | Fixed |
| S37 | Low | `accounts.finish_sign_up` | A sign-up started before "Make a new link" still joined after it. | The pending row stores `share_version`; a changed version answers `link_closed`. | Fixed |
| S38 | Medium | `accounts.py` limits, `routers/visitor.py` | A conference on one Wi-Fi hit 429 at the 21st sign-up in an hour, and live map refreshes were silently refused at 120 a minute per address. | 60 code emails an hour and 200 a day per network, 100 code checks per 10 minutes, 600 visitor views a minute; the visitor page says when the map may be out of date. | Fixed |
| S39 | Low | `accounts.log_in` | 20 wrong passwords from anywhere locked the owner out for an hour. | The 20-an-hour block counts per address and network; a second block at 100 an hour per address covers guessing from many networks. | Fixed (an attacker with many networks can still lock the owner out; the reset code clears it) |
| S40 | Low | `accounts._check_code` | The try counter was read and raised in Python, so parallel requests could get more than 5 guesses per code. | One `UPDATE ... WHERE attempts < 5 RETURNING attempts` counts the try before the code is compared. | Fixed |
| S41 | Low | `events_service/share.py` (`derive_token`) | The shared token is HMAC(`SECRET_KEY`, public id, version), not random: a leaked key reveals every event's link, and switching off and on keeps the same link. | Accepted (decision D2): the organiser can copy the link again at any time; a leaked `SECRET_KEY` already breaks sessions and every other check. "Make a new link" is the way to kill old copies. | Open, accepted |

The correctness review also found a capacity bug with a security side: saying
"no" and then "yes" again made 9 guests for 8 seats and passed the organiser's
cap. Fixed in `attendee_view.set_rsvp` (room checked after the event lock).

S13 and S14 for guest accounts: guest sessions carry a version number, so
sign-out and a password reset end every older session (S13 does not apply to
them); failed guest logins are counted per address (S14, as changed by S39).

Rejected: making the app refuse to start with demo mode, the console
provider and a Postgres database together (security review finding 1). The
graded deployment runs exactly so (`docs/deployment.md`); S30 removes the
takeover without it.

**Checked and found sound** (security review): guest tokens on all organiser
routes give 401 and organiser tokens on guest routes give 401; a guest account
reaches only events where it has a guest row; the shared token has 256 bits;
a switched-off link answers 403 and a replaced one 404; the visitor map uses
the same privacy-filtered names as attendees; the seat picture reads no guest
data; email HTML is escaped and subjects stay on one line; deleting an account
blanks its outbox rows, pictures included; guest tokens live in
`sessionStorage`; no new Python package.

Commands (run 2026-11-10 to 11, from `backend/` unless named):

| Command | Real output |
|---|---|
| `../.venv/bin/python -m pytest -p no:cacheprovider` before the review fixes | `571 passed in 38.28s` |
| the 22 undo-the-fix runs (`docs/test-report.md`) | every one `CAUGHT`: the matching test failed |
| `../.venv/bin/python -m pytest -p no:cacheprovider` after the fixes (2026-11-11 00:01) | `598 passed, 3 warnings in 66.38s (0:01:06)` |
| the same with `SEATPLAN_TEST_POSTGRES` on a throwaway Postgres 16.2 cluster (deleted afterwards) | `597 passed, 1 skipped in 144.30s (0:02:24)` |
| `.venv/bin/pip-audit -r requirements.txt` (repository root) | `No known vulnerabilities found` |
| `npm audit` (`frontend/`) | `found 0 vulnerabilities` |

Not tested for this feature: a real Resend send (inline image and the
`content_id` field), real mail clients, a real Vercel deployment.

