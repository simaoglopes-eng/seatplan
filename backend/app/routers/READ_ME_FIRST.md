# backend/app/routers: read me first

## Purpose

The HTTP endpoints. One file per area of the API (contract section 5).
`main.py` registers every router under `/api`. A route stays thin: it checks
who is calling and what they sent, calls a helper (in `events_service/`,
`restaurant_service/`, `mail/` or `core/`), then commits once.

## Key files

| File | URLs | Who may call |
|---|---|---|
| `health.py` | `GET /health` | Anyone. 503 when the database does not answer |
| `auth.py` | `POST /auth/login`, `GET /auth/me` | Anyone (login is rate limited) / a logged-in user |
| `owners.py` | `POST /owner/register`, `POST /owner/verify` | Public, code-send and verification rate limits, consent required |
| `photos.py` | `/owner/restaurants/{vid}/photos`, `/photos/{public_id}` | Owner-only gallery writes/metadata; public bytes only for published restaurants, otherwise owner-only |
| `discovery.py` | `GET /restaurants`, `GET /restaurants/{slug}` | Anyone (shared read limit); a draft is visible only to its owner, as a preview |
| `venues.py` | `/venues`, `PUT /venues/{vid}/layout` | Organisers and staff (`CurrentUser`) |
| `demo.py` | `POST /demo/reset`, `GET /demo/links` | Only with `DEMO_MODE=1`; the reset only with a matching `X-Demo-Key` |
| `events.py` | `/events/...` (guests, seats, auto-fill, scenarios, undo, shared link) | Organisers (`CurrentOrganiser`) |
| `attendee.py` | `/a/{token}/...` | Whoever holds the personal link; rate limited per address |
| `visitor.py` | `GET /j/{token}`, `POST /j/{token}/register`, `POST /j/{token}/join` | Anyone with an event's shared link (read only); joining needs a guest account. No hold or confirm route exists here. Register checks the link before counting any limit, and never refuses a full event (the join step decides) |
| `guest_accounts.py` | `/guest/verify` (needs the `signup_id`), `/guest/login`, `/guest/logout`, `/guest/password/...` (never shows the code), `/guest/me`, `/guest/me/delete` (a wrong password is 422) | Anyone (code, login and reset are rate limited) / a signed-in guest account (`CurrentGuestAccount`) |
| `guest_events.py` | `/guest/events/{eid}/...` | A guest account with a guest row on that event; mirrors `attendee.py` exactly |
| `restaurants.py` | `/r/{vid}/...` (slots, map, hold, book) | Anyone; rate limited per address. Booking also has daily caps per mailbox and per address (`restaurant_service/booking_caps.py`, S8) |
| `bookings.py` | `/b/{manage_token}`, waitlist | Whoever holds the manage link; rate limited |
| `staff.py` | `/staff/{vid}/...` (floor, walk-ins, dashboard, schedule) | A logged-in user |
| `emails.py` | `POST /internal/email/process`, `GET /emails/log` | The cron (`X-Cron-Secret`) / organisers |

The live-update routes (`/live/{scope}/version` and `/stream`) live in
`core/live.py`, because every vertical uses them.

## Data flow of one write (for example a seat confirm)

1. FastAPI checks the body against a Pydantic model (unknown fields: 422).
2. A dependency gives the route a database session and, if needed, the user.
3. Public routes call `rate_limit(...)` first, before any other write.
4. The route calls one helper that does the work, then `live.bump(...)`,
   `audit.record(...)` and, if an email is due, `enqueue(...)`.
5. One `session.commit()`: the change, the live counter, the audit row and the
   email are saved together or not at all.
6. Any `ApiError` becomes `{"error": {"code", "message"}}` (see `main.py`).

## Three likely walkthrough questions

**Why is the logic not in the routers?**
So each file has one job and the logic can be tested without HTTP. The
routers translate between HTTP and Python; `events_service/` and
`restaurant_service/` decide.

**How does a route know who is calling?**
Organisers and staff send `Authorization: Bearer <session>`. The parameter
`user: CurrentUser` (or `CurrentOrganiser`) runs `security.require_user`,
which checks the HMAC signature and the expiry, or answers 401. Attendees and
diners have no account: the secret token in their link is their key, and we
look it up by its SHA-256 hash. People who join through an event's shared
link have a guest account and send `Authorization: Bearer g.<id>.<version>.<expiry>.<signature>`;
`CurrentGuestAccount` checks it. That token has five parts and is signed over
a different message, so it can never pass as an organiser session (or the
other way round).

**Why can nobody wipe the demo by logging in?**
The demo organiser's password may be public. So `POST /demo/reset` accepts no
login at all: only the `X-Demo-Key` header, compared with `DEMO_KEY` in
constant time. An empty `DEMO_KEY` rejects everyone.
