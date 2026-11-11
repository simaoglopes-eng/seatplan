# Guest accounts and the shared event link: build spec

Status: **built**, 2026-11-10. This file started as the build spec for two
builders working in parallel (BACKEND, section 14.1, and FRONTEND, section
14.2). It now describes what was built, including the changes made after the
security and correctness reviews of the same day (section 2.1). The JSON
shapes in section 6 are the agreement between backend and frontend; change
one only by changing this file first.

The product owner's words (translated): "There must be a guest profile for
when the link is shared; but to receive by email the seat where they are
sitting, with the view of the venue and their seat, they will have to create
an account."

## 1. Summary

- Each event gets one **shared link** `/j/<token>`. The organiser switches it
  on, copies it, and can replace it.
- Anyone who opens it is a **visitor**: they see the event and the live seat
  map, with names filtered exactly as an attendee sees them. A visitor cannot
  hold or confirm a seat.
- To choose a seat, the visitor creates a **guest account** (name, email,
  password, consent). The account is created when they type the 6-digit code
  we email them. That same step puts them on the event's guest list (source
  `self_registered`) and signs them in.
- When an account holder confirms a seat, or the organiser moves them, they
  get an email with the event details, their table and seat, a **picture of
  the room with their seat marked**, the calendar invite and a link to their
  seat page.
- Guests who only have a personal link (`/e/<token>`) keep today's behaviour
  and today's emails.
- The account holder can delete the account at any time.

## 2. Decisions, and where this spec departs from the chosen defaults

Defaults 1 to 7 from the brief are kept, with these changes. Each one is
needed for safety or because of how the code works today.

| # | Default | What this spec does | Why |
|---|---|---|---|
| D1 | 3: "Creating the account makes a guest row and signs them in" | The account, the guest row and the session are created only when the person types the code we emailed them (section 7). Before that, nothing is stored except a pending sign-up that expires after 15 minutes. | A guest row counts against the event's capacity. If rows were made before the address was proven, one person could fill an event with made-up addresses and lock real guests out. Proving the address first also makes linking to an invited guest safe (default 3), stops anyone from "squatting" someone else's address, and lets the sign-up answer be identical whether or not an account exists (no account discovery). |
| D2 | 1: "token stored hashed, shown with copy" | The token is **derived**, not random: `HMAC-SHA256(SECRET_KEY, "share-link:<event public id>:<share_version>")`, Base64url, 43 characters. Only its SHA-256 hash is stored, for the lookup. "Make a new link" adds 1 to `share_version`. | A random token stored as a hash can be shown only once, so an organiser who lost it would have to replace it and break every copy already shared. A derived token can be shown again at any time and still never sits in the database. If `SECRET_KEY` changes, every shared link changes (exactly as every login session already does); the organiser page then says "Make a new link" (section 6.3). |
| D3 | 2: link switched off | A switched-off link answers 403 `link_closed`; a wrong or replaced link answers 404 `not_found`. | The holder of a switched-off link already has a valid link, so telling them "closed for now" reveals nothing. A replaced link cannot be told apart from a wrong one (only the new hash is stored), which is the safe default. |
| D4 | 5: the email | Seat emails still go through the outbox and the 15-minute cron. Only the 6-digit code emails are sent at once (section 9.6). | A code must arrive while the person waits. A seat email can wait a few minutes, and sending it inside the confirm request would make seat confirmation depend on Resend being up. |
| D5 | 5: "or the organiser moves them" | A single organiser move (`PUT /events/{eid}/assignments/{gid}`) **and** an applied optimiser plan (apply, undo, redo) send the picture email to each **account holder** whose seat changed. Guests with only a personal link still get no email from a plan, as before. | Changed after review (2.1, R6): the product owner's words promise the email "when the organiser moves them", and a plan is the organiser moving them. Personal-link guests keep the old rule because a plan can move dozens of them at once. |
| D6 | 6: delete account | Guest rows the account created (`self_registered`) are erased like an organiser erasure. A guest row the organiser created and the account later linked to is **unlinked**, its seat released without an email, but the organiser's own record stays. | The organiser typed that record; it is theirs to erase. The person's seat and the emails we sent them are still released and wiped. Section 11. |
| D7 | (none) | The 6-digit code goes through the same outbox rule as every email: only addresses on `EMAIL_ALLOWLIST` really receive email. | Today, production sends real email only to allowlisted addresses (`mail/outbox.py:_process_one`). So with today's settings, a guest whose address is not on the list never gets a code and cannot create an account. **Open question for the product owner** (section 15). In demo mode with the console provider the code is shown on screen (section 7.2). |

### 2.1 Changes after the reviews of 2026-11-10

Two reviews (security, then correctness and UX) found problems in the first
build. Each fix has a test that failed before it (`backend/tests/test_guest_review_fixes.py`
unless named; `docs/test-report.md` lists the runs). The security finding
numbers are those of `docs/security.md` (S30 to S40).

| # | Problem found | What was changed |
|---|---|---|
| S30 (High) | In demo mode with the console provider the sign-up answer carried the code for **any** address, so anyone could take over an invited guest on a demo deployment | `demo_code` only for `@example.com` addresses that no organiser invited; never for a password reset; an account made with a code shown on screen has `email_proven = false` and is never linked to an invitation (7.2, 7.3) |
| S31 / R1 (High) | A second sign-up for the same address replaced the pending one, password included; the victim then typed the attacker's code and the account got the attacker's password | Each register answer carries a random `signup_id`; `/guest/verify` needs it with the code, and only its keyed hash is stored (`email_codes.signup_hash`). The code email also says "Never give this code to anyone" |
| S32 | `register` ran scrypt only for new addresses, so the answer time told who had an account | scrypt runs for every address |
| S33 | Calls with a made-up link, and "forgot password" calls, used up the 3-an-hour code limit of someone else's address and the app-wide limit | The link and deadline are checked before counting; sign-up and reset codes have separate per-address counts; the app-wide count only counts emails really queued |
| S34 | The name typed on the form went into the code email to any address | Code emails greet with a plain "Hello," |
| S35 / R10 | A guest the organiser removed could rejoin at once | The removed row keeps the account number (no personal data); joining again answers 403 `forbidden` "The organiser removed you from this event." |
| S36 | On SQLite a deleted account's id went to the next account, so an old token opened it | `guest_accounts` uses `AUTOINCREMENT` on SQLite (Postgres never reuses ids) |
| S37 / R11 | A sign-up started before "Make a new link" still joined afterwards | The pending row stores the link version; a changed version gives `link_closed` |
| S38 / R8 | Per-network limits stopped a conference on one Wi-Fi | Code emails 60 an hour and 200 a day per network, code checks 100 per 10 minutes, visitor views 600 a minute; a failed live refresh now says "The map may be out of date" |
| S39 | 20 wrong passwords from anywhere locked the owner out | The 20-an-hour block counts per address **and** network; a second count of 100 an hour per address stops guessing spread over networks |
| S40 | Parallel wrong codes could get more than 5 tries | The try is counted in one `UPDATE ... WHERE attempts < 5 RETURNING` before the code is compared |
| R3 (High) | Saying "no", then "yes" again, made more guests than seats (and passed the cap) | `set_rsvp` checks for room after the event lock, 409 `event_full` |
| R4 | Places left counted seats reserved for a tag | Newcomers only count seats with no tag (8.2) |
| R5 | A full event refused the sign-up of a guest who was invited | `register` no longer refuses a full event (refusing only strangers would reveal who is invited); the join step decides. The visitor page offers "I was invited: create my account" |
| R6 | A plan applied by the organiser sent no email to account holders | Changed D5 (above) |
| R7 | The "you already have an account" email led to an empty "My events" | It now says to open the shared link again and choose "I already have an account" |
| R9 | A tall room's picture was stretched to 560 px | The `<img width>` is the picture's real width, at most 560 |
| R12, R13 | Privacy text and delete dialog said more than was true; "1 places left"; a wrong delete password answered 401 like an ended session | Texts corrected; a wrong delete password is 422 `validation` "password: That password is not correct." |

Rejected or left open, with the reason:

- **Refuse to start with demo mode, the console provider and Postgres
  together** (security review, finding 1): the graded deployment is meant to
  run exactly like that (`docs/deployment.md`, steps 4 to 6). S30 closes the
  takeover without it.
- **Random shared token shown once** (S41, finding 10): kept the derived
  token of D2, so the organiser can copy the link again at any time. A leaked
  `SECRET_KEY` already breaks every session and personal-link check, so it is
  not a new risk. Switching the link off and on keeps the same link; "Make a
  new link" is the way to stop an old copy, and the organiser hint says so.
- **A default cap or organiser approval for joins, a per-domain limit**
  (S35, R10): not built. The organiser can set a cap, switch the link off or
  make a new one; open question 3.
- **A code read out over the phone** (S31): the code is the proof of the
  inbox. Whoever is given it can finish a sign-up they started themselves.
  The email now warns against sharing it. No design that relies on an emailed
  code can stop this fully.
- **D7, the email allowlist** (R2, High): still open for the product owner
  (section 15, question 1). With today's `EMAIL_ALLOWLIST`, real guests do not
  receive their code outside the demo.

New dependencies: **none**. The picture is drawn with the Python standard
library (`zlib`, `struct`, `binascii`). Section 9.3 gives the reasons and the
measurements.

## 3. Data model

All new tables and columns follow contract section 4: integer keys inside the
database, nothing guessable in URLs, secrets only as hashes, UTC timestamps
(`UtcDateTime`).

### 3.1 New table `guest_accounts`

| Column | Type | Rule |
|---|---|---|
| `id` | INTEGER primary key | |
| `public_id` | VARCHAR(32), indexed | `new_public_id()`; never shown in URLs today, kept for logs and future use |
| `email` | VARCHAR(254), **UNIQUE** (`uq_guest_accounts_email`) | Stored lower case and trimmed. The `+tag` is kept (a different address to the mail server) |
| `name` | VARCHAR(120) | `PlainText` rules |
| `password_hash` | VARCHAR(255) | `security.hash_password` (scrypt, same settings as organisers) |
| `email_proven` | BOOLEAN NOT NULL DEFAULT TRUE | False only when the sign-up code was shown on screen (demo, 7.2). Such an account is never linked to an invited guest |
| `session_version` | INTEGER NOT NULL DEFAULT 0 | Goes into every guest session token; adding 1 ends every session of this account (sign out, password reset) |
| `consent_at` | UtcDateTime NOT NULL | When they ticked the consent line |
| `consent_version` | VARCHAR(20) NOT NULL | The date of the privacy text they agreed to, `"2026-11-10"` |
| `created_at` | UtcDateTime NOT NULL | |
| `last_login_at` | UtcDateTime NULL | |

An account exists only after its code was typed (D1). `email_proven` records
whether that code went only to the inbox. On SQLite the table is made with
`AUTOINCREMENT`, so a deleted account's id is never given to a new account
(an old session token names the id; S36).

### 3.2 New table `email_codes`

One live code per address and purpose.

| Column | Type | Rule |
|---|---|---|
| `id` | INTEGER primary key | |
| `email` | VARCHAR(254) | lower case |
| `purpose` | VARCHAR(10) | `register` or `reset` |
| `code_hash` | VARCHAR(64) | `HMAC-SHA256(SECRET_KEY, "<purpose>:<email>:<code>")` hex. A plain SHA-256 of a 6-digit code could be reversed by trying all million codes |
| `attempts` | INTEGER NOT NULL DEFAULT 0 | Wrong tries on this code |
| `expires_at` | UtcDateTime | 15 minutes after `created_at` |
| `created_at` | UtcDateTime | |
| `event_id` | INTEGER NULL, FK `events.id` | `register` only: the event whose shared link was used |
| `name` | VARCHAR(120) NULL | `register` only |
| `password_hash` | VARCHAR(255) NULL | `register` only, already scrypt-hashed |
| `needs_accessible` | BOOLEAN NOT NULL DEFAULT FALSE | `register` only |
| `signup_hash` | VARCHAR(64) NULL | `register` only: `HMAC-SHA256(SECRET_KEY, "signup:<signup_id>")` hex. The raw `signup_id` goes only to the browser that registered (S31) |
| `share_version` | INTEGER NULL | `register` only: the event's `share_version` when the sign-up started (S37) |
| `code_shown` | BOOLEAN NOT NULL DEFAULT FALSE | True when the code was also in the answer (demo, 7.2) |

Constraint: **UNIQUE(email, purpose)** (`uq_email_codes_email_purpose`). A new
code for the same address and purpose deletes the old row first, in the same
transaction.

### 3.3 New columns on existing tables

| Table | Column | DDL used by migrate | Model declaration |
|---|---|---|---|
| `events` | `share_enabled` | `BOOLEAN NOT NULL DEFAULT FALSE` | `Mapped[bool]`, `default=False`, `server_default=false()` |
| `events` | `share_version` | `INTEGER NOT NULL DEFAULT 0` | `default=0`, `server_default="0"` |
| `events` | `share_token_hash` | `VARCHAR(64)` | nullable; NULL until the link is first switched on |
| `events` | `share_cap` | `INTEGER` | nullable; NULL means "no cap beyond the number of seats" |
| `guests` | `account_id` | `INTEGER REFERENCES guest_accounts (id)` | nullable FK |
| `guests` | `source` | `VARCHAR(20) NOT NULL DEFAULT 'invited'` | `invited` or `self_registered`; `server_default="invited"` |
| `email_outbox` | `image_png` | `TEXT` | nullable; Base64 of the inline seat picture |

The model must declare the same `server_default` as the migrate DDL, so a
fresh database (made by `create_all`) and an upgraded one (made by `ALTER
TABLE`) are the same.

### 3.4 New indexes

| Name | DDL |
|---|---|
| `uq_events_share_token` | `CREATE UNIQUE INDEX IF NOT EXISTS uq_events_share_token ON events (share_token_hash)` |
| `uq_guests_event_account` | `CREATE UNIQUE INDEX IF NOT EXISTS uq_guests_event_account ON guests (event_id, account_id)` |
| `ix_guests_account_id` | `CREATE INDEX IF NOT EXISTS ix_guests_account_id ON guests (account_id)` |

Declared in the models through `__table_args__` with `Index(..., unique=True)`
so `create_all` makes them on a fresh database. NULLs are all different to
both SQLite and Postgres, so the many invited guests with no account never
clash on `uq_guests_event_account`; one account can have at most one guest row
per event.

### 3.5 Rules the database enforces

- One account per address: `uq_guest_accounts_email`. Two sign-ups for one
  address at the same moment: the second insert fails and is answered like a
  wrong code (409 `conflict`, "Please try again").
- One guest row per account per event: `uq_guests_event_account`.
- One seat per guest, one guest per seat, 5-minute holds: unchanged
  (`seat_assignments`, `holds`).
- Capacity is checked **after** `lock_event()` (section 8.2), which serialises
  every writer of one event on Postgres and SQLite alike, so two joins cannot
  both take the last place.

### 3.6 Things that change meaning

- `guests.token_hash` stays NOT NULL and UNIQUE. A self-registered guest gets
  the hash of a fresh `new_token()` that nobody is ever given (the same trick
  `erase_guest` uses). They have no personal link unless the organiser presses
  "New link" for them, which still works.
- `erase_guest` (organiser removes a guest) **keeps** `account_id` on the
  erased row. The row holds no personal data any more; the account number is
  what stops that account from simply joining again (`join` answers
  `removed`, HTTP 403 `forbidden`; S35). Deleting the account clears it.
- `guests.email` of a self-registered guest is the account email. When an
  account is linked to an invited guest, the organiser's `email` is kept (it
  matched the account email ignoring case).

## 4. Migration

### 4.1 What `python -m app.seed.migrate` does after this change

All in **one transaction**, after the existing Postgres advisory lock
(`db._SCHEMA_LOCK_ID`), so eight runs started together still work one after
the other:

1. `Base.metadata.create_all(connection)`: creates `guest_accounts` and
   `email_codes` if missing (and every older table, as today).
2. For each entry of a fixed module-level list `NEW_COLUMNS` (table, column,
   DDL from section 3.3): read the table's columns with
   `sqlalchemy.inspect(connection).get_columns(table)`; when the column is
   missing, run `ALTER TABLE <table> ADD COLUMN <column> <ddl>`. On Postgres
   the statement is `ADD COLUMN IF NOT EXISTS` as a second guard; SQLite has no
   such clause, which is why the inspector check comes first on both.
3. Run each `CREATE [UNIQUE] INDEX IF NOT EXISTS` of section 3.4 (both
   databases understand it).
4. Print one line per change (`Added column events.share_enabled`, `Index
   uq_guests_event_account is ready`), then `Tables are ready.`

No data is rewritten: the defaults give existing events `share_enabled =
false` and existing guests `source = 'invited'`. Only the demo seed switches
the link on (section 12).

The DDL strings are constants written in the source, never built from input,
so contract section 7 ("no string-built SQL") still holds: the same reasoning
as the two existing fixed `text()` calls.

Notes for the builder:

- `create_all` must run before step 2, because `guests.account_id` refers to
  `guest_accounts`.
- SQLite accepts `ADD COLUMN ... REFERENCES` only when the column's default
  is NULL, which is the case here. SQLite 3.23 or later reads `FALSE` as 0
  (the local `sqlite3.sqlite_version` is `3.53.1`, checked 2026-11-10).
- On Postgres 11 or later, `ADD COLUMN ... NOT NULL DEFAULT <constant>` does
  not rewrite the table.
- The module docstring of `migrate.py`, `docs/runbook.md` section 4 and the
  README must stop saying "it only adds missing tables": it now also adds the
  columns and indexes listed in `NEW_COLUMNS` and `NEW_INDEXES`, and nothing
  else.

### 4.2 The old-schema test

Before touching `models.py`, the backend builder writes the schema **as it is
today** into two fixture files, by running from `backend/`:

```
../.venv/bin/python -c "from sqlalchemy.schema import CreateTable, CreateIndex; from sqlalchemy.dialects import sqlite, postgresql; from app.models import Base; [open(f'tests/fixtures/schema_2026_11_10.{n}.sql','w').write(';\n'.join([str(CreateTable(t).compile(dialect=d)).strip() for t in Base.metadata.sorted_tables] + [str(CreateIndex(i).compile(dialect=d)) for t in Base.metadata.sorted_tables for i in t.indexes]) + ';\n') for n, d in (('sqlite', sqlite.dialect()), ('postgres', postgresql.dialect()))]"
```

(The folder `backend/tests/fixtures/` is new.) These two files are frozen: they
are the "production today" shape. The test (section 13.1, `test_migrate_guest_accounts.py`) loads
the right file into an empty database, inserts one organiser, venue, table,
seat, event, guest, seat assignment and outbox row with bound parameters, runs
the migrate entry point **twice**, and checks the result (section 13.1).

## 5. Who may call what

### 5.1 Callers

| Caller | Proves itself with | Notes |
|---|---|---|
| Visitor | The shared token in the path `/j/{token}` | Read-only. Any number of people share the same token |
| Guest account holder | `Authorization: Bearer <guest session>` | New. Section 5.2 |
| Attendee with a personal link | `/a/{token}` | Unchanged |
| Organiser | `Authorization: Bearer <organiser session>` | Unchanged; adds the three share routes |
| Staff | Organiser-style session, role `staff` | 403 on share routes (`require_organiser`) |

### 5.2 Guest sessions

- Format: `g.<account id>.<session_version>.<expiry unix seconds>.<signature>`,
  where `signature = HMAC-SHA256(SECRET_KEY, "guest-session.<account id>.<session_version>.<expiry>")` hex.
- Life: 12 hours (`SESSION_HOURS`).
- **Kept apart from organiser sessions on purpose.** An organiser token has 3
  parts and is signed over `"<id>.<expiry>"`; a guest token has 5 parts, starts
  with `g` and is signed over a message that starts with `guest-session.`. So
  `verify_session_token` refuses every guest token (wrong number of parts), and
  the new `verify_guest_session` refuses every organiser token (wrong prefix,
  and its signature was made over a different message). Without this, account
  3's guest token would open organiser 3's events.
- Checked on every call: signature (constant time), expiry, account still
  exists, `session_version` equal to the account's. Any failure: 401
  `unauthorised` "Please sign in again."
- Sign out adds 1 to `session_version`, which ends the account's sessions on
  every device. A password reset does the same. (This closes finding S13 for
  guest accounts; organisers are unchanged.)
- The browser keeps the guest token in `sessionStorage` under its own key
  (section 10.1), never with the organiser's.
- New dependency in `security.py`: `CurrentGuestAccount = Annotated[GuestAccount, Depends(require_guest_account)]`.

### 5.3 Route table

| Routes | Caller | Guard |
|---|---|---|
| `GET /j/{token}` | Anyone | 120 a minute per address (key `share-view`), then token hash |
| `POST /j/{token}/register` | Anyone | Section 8 limits, then token hash, `share_enabled` |
| `POST /j/{token}/join` | Guest account | Guest session; 30 a minute per address; token; section 8.2 |
| `POST /guest/verify`, `POST /guest/login`, `POST /guest/password/forgot`, `POST /guest/password/reset` | Anyone | Section 8 limits |
| `POST /guest/logout`, `GET /guest/me`, `POST /guest/me/delete` | Guest account | Guest session |
| `/guest/events/{eid}` and its 9 sub-routes | Guest account with an active guest row on that event | Guest session, 120 a minute per address, then `load_account_guest` (section 6.5) |
| `GET /events/{eid}/share`, `PATCH /events/{eid}/share`, `POST /events/{eid}/share/regenerate` | Organiser who owns the event | Session, `require_organiser`, `load_event` |

## 6. HTTP API

Everything is under `/api`, JSON, with the contract's error shape
`{"error": {"code": "...", "message": "..."}}`. Request bodies forbid unknown
fields and limit every length (Pydantic `Strict`). Shapes are written in
TypeScript notation; Python sends the same snake_case names. `string (ISO)`
means an ISO 8601 UTC timestamp, as today.

**Two new error codes** (contract section 5 amended):

- `event_full` with HTTP 409: no place left for one more guest.
- `link_closed` with HTTP 403: the shared link is valid but switched off.

### 6.1 Shared shapes

```ts
type SeatState = "free" | "held" | "taken" | "mine" | "friend" | "blocked"; // unchanged

interface EventSummary {            // unchanged, the attendee version (no public_id)
  name: string; starts_at: string; ends_at: string;
  privacy_mode: "full_name" | "first_initial" | "anonymous";
  change_deadline: string | null; deadline_passed: boolean; live_scope: string;
}

interface GuestAccountOut {
  name: string;
  email: string;          // the account holder's own address, in full
  created_at: string;     // ISO
}

type JoinStatus =
  | "joined"            // a new self_registered guest row was made
  | "linked"            // an invited guest row with this address now belongs to the account
  | "already_member"    // the account already had a row on this event
  | "event_full"        // no place left; the account exists but did not join
  | "link_closed"       // the organiser switched the link off, or made a new link, meanwhile
  | "deadline_passed"   // the change deadline has passed
  | "removed";          // the organiser removed this account from the event

interface JoinResult {
  status: JoinStatus;
  event_id: string | null;   // the event's public id when the account is a member, else null
}

interface GuestSession {
  token: string;             // "g.<id>.<version>.<expiry>.<signature>"
  account: GuestAccountOut;
}

interface CodeSent {
  status: "code_sent";
  sent_to: string;           // masked with core/privacy.mask_email, "an***@example.com"
  expires_in_seconds: 900;
  signup_id?: string;        // register only: random, for this browser only; /guest/verify needs it
  demo_code?: string;        // ONLY in the cases of section 7.2; may be missing even in the demo
}
```

### 6.2 Visitor routes

**`GET /j/{token}`** -> `200 VisitorView`

```ts
interface VisitorView {
  event: EventSummary;
  venue: { name: string };
  map: SeatMapPayload;   // seats: state is only "free" | "held" | "taken" | "blocked";
                         // occupant: display_name() of the person on it, or null
  join: {
    open: boolean;
    places_left: number;                                    // see 8.2; 0 when not open
    reason: null | "full" | "deadline_passed";              // why open is false
  };
}
```

- Seat state for a visitor: `taken` when someone sits there, `blocked` when
  blocked **or** reserved for any tag (a visitor has no tag), `held` when a
  live hold exists, else `free`. Never `mine` or `friend`.
- `occupant` passes through `core/privacy.display_name(name, event.privacy_mode,
  wants_anonymous)`, as for attendees. No people list, no guest ids, no seat
  sources, no emails, no dietary or accessibility data: the response carries
  only what `MapSeat` and `MapTable` allow.
- Errors: 404 `not_found` "This link does not work. It may have been replaced
  by a new one. Ask the organiser for the current link." (wrong, replaced or
  over 128 characters); 403 `link_closed` "The organiser is not taking new
  guests through this link at the moment."; 429 `rate_limited`.

**`POST /j/{token}/register`** body `RegisterIn` -> `202 CodeSent`

```ts
interface RegisterIn {
  name: string;               // PlainText, 1..120
  email: string;              // EmailStr, max 254; stored lower case
  password: string;           // 10..200 characters, must not equal the email
  needs_accessible: boolean;  // default false
  consent: true;              // Literal[True]; anything else is 422
}
```

- Checks, in order: the body (422), the link (404, 403) and the deadline
  (409), and only then the code limits (8.1), so a made-up link cannot use
  them up (S33).
- Always the **same 202 body** for a new address and for an address that
  already has an account, so the answer never reveals who has an account.
  Both carry a fresh `signup_id`, and both run scrypt, so neither the body
  nor the time taken differs (S32).
  - New address: replace any `register` row for this address, store a new code
    (section 3.2) with the name, password hash, event and accessibility need,
    queue the `account_code` email and send it at once (section 9.6).
  - Address with an account: store nothing, queue the `account_exists` email
    (section 9.5) and send it at once. It contains no code.
- The password is hashed here, so the raw password is never stored, even in
  the pending row.
- A full event is **not** refused here (R5): an invited guest may still make
  an account to reach their invitation, and refusing only strangers would
  tell anyone who is on the guest list. The join step answers `event_full`.
- Errors: 404 and 403 `link_closed` as above; 409 `deadline_passed`; 422
  `validation` (field-specific message: "password: Use at least 10
  characters."); 429 `rate_limited`.

**`POST /j/{token}/join`** (guest session, empty body `{}`) -> `200 JoinResult`

For an account holder who signs in on the shared link. Statuses as in 6.1; the
HTTP answer is 200 for `joined`, `linked` and `already_member`, and the errors
409 `event_full`, 403 `link_closed`, 409 `deadline_passed`, 403 `forbidden`
("The organiser removed you from this event. Ask them if you think this is a
mistake.") and 404 `not_found`.

### 6.3 Organiser share routes

```ts
interface ShareSettings {
  enabled: boolean;
  link: string | null;       // "/j/<token>", a path; the page adds its own origin.
                             // null when never switched on, or when SECRET_KEY changed
                             // since the link was made (needs_new_link is then true)
  needs_new_link: boolean;
  cap: number | null;        // most people who may join with the link; null = no cap
  joined: number;            // active guests with source "self_registered"
  capacity: number;          // seats that are not blocked
  guests: number;            // active guests (any source)
  places_left: number;       // section 8.2, the same number visitors see
}
```

- **`GET /events/{eid}/share`** -> `200 ShareSettings`.
- **`PATCH /events/{eid}/share`** body `{ enabled?: boolean; cap?: number | null }`
  (cap 1..5000) -> `200 ShareSettings`. Switching on an event whose
  `share_token_hash` is NULL computes it (version 0). Audit `share.update` with
  the changed field names. Live bump of the event scope.
- **`POST /events/{eid}/share/regenerate`** `{}` -> `200 ShareSettings`. Adds 1
  to `share_version`, stores the new hash. The old link answers 404 at once.
  People who already joined keep their rows and seats. Audit
  `share.regenerate`. Live bump.
- Errors: 401, 403 (staff), 404 (not their event), 422.

**Changed: `GET /events/{eid}/guests`** and every answer built by
`guests.guest_dict` gain two fields:

```ts
interface OrganiserGuest {      // existing fields unchanged
  source: "invited" | "self_registered";
  has_account: boolean;         // account_id is not null; never the account's id or email
}
```

`DELETE /events/{eid}/guests/{gid}` works on self-registered guests exactly as
on invited ones (and clears `account_id`, section 3.6).

### 6.4 Account routes

**`POST /guest/verify`** body `{ email: string; code: string /* ^[0-9]{6}$ */; signup_id: string }`
-> `201 GuestSession & { join: JoinResult }`

- Finds the live `register` row for this address. A `signup_id` that is not
  the one this row was made for: 404 as below, and no try is used up (S31).
- Each try is counted first, in one `UPDATE ... SET attempts = attempts + 1
  WHERE attempts < 5 RETURNING attempts`, then the code is compared, so
  parallel requests share 5 tries (S40). Wrong code: at 5 the row is deleted. Answer 422 `validation` "That code is
  not right. You have N tries left." (N = 5 - attempts), or after the fifth
  "That code is not right. Please ask for a new code."
- No row, or expired: 404 `not_found` "This code has expired or was replaced.
  Please ask for a new one."
- Right code, in one transaction: create the account; delete the code row;
  then try to join the event of the code row (section 8.2), which may give
  `joined`, `linked`, `event_full`, `link_closed` (also when the link was
  replaced since the sign-up started, S37) or `deadline_passed`. The
  account is created in every case; only a successful join makes a guest row.
- A unique clash on the email (two verifies at once): 409 `conflict` "Please
  try again."

**`POST /guest/login`** body `{ email: string; password: string /* 1..200 */ }`
-> `200 GuestSession`

Same behaviour as organiser login: dummy hash for unknown addresses, one
message for both failures: 401 `unauthorised` "Email or password is not
correct." Sets `last_login_at`.

**`POST /guest/logout`** `{}` -> `200 { signed_out: true }`. Adds 1 to
`session_version`.

**`POST /guest/password/forgot`** body `{ email: string }` -> `202 CodeSent`.
Same body whether or not an account exists; a code row and an email
(`password_code`) only when it does. **Never** a `demo_code`, not even in the
demo: on a demo deployment anyone could otherwise set a new password for
anyone's account (S30).

**`POST /guest/password/reset`** body `{ email: string; code: string; new_password: string /* 10..200 */ }`
-> `200 GuestSession`. Same code rules as verify. Sets the new hash and adds 1
to `session_version` (other sessions end), then returns a fresh session.

**`GET /guest/me`** -> `200 MyAccount`

```ts
interface MyEvent {
  event_id: string;            // public id, used in /my/:eventId and /guest/events/{eid}
  name: string;
  starts_at: string; ends_at: string;
  venue_name: string;
  deadline_passed: boolean;
  rsvp: "pending" | "yes" | "no";
  seat: { seat_label: string; table_label: string } | null;
}
interface MyAccount { account: GuestAccountOut; events: MyEvent[]; } // events by starts_at
```

Only guest rows that are active (`token_revoked_at` is NULL) count.

**`POST /guest/me/delete`** body `{ password: string }` -> `200 { deleted: true }`.
Wrong password: 422 `validation` "password: That password is not correct."
(not 401, which means "your session is over" and signs the person out). Section
11 says what happens. POST, not DELETE, because it carries a body and the
frontend's `api.delete` helper sends none.

### 6.5 The account holder's event routes

Under `/guest/events/{eid}` (`eid` = event public id). Each route first runs
the dependency `load_account_guest(eid, account)`: the guest row with
`event.public_id == eid`, `account_id == account.id` and `token_revoked_at IS
NULL`, else 404 `not_found` "You are not on the guest list of this event."

They mirror the attendee routes **exactly**, with the same request bodies,
the same answers and the same errors:

| Account route | Same as |
|---|---|
| `GET /guest/events/{eid}` -> `AttendeeView` | `GET /a/{token}` |
| `GET /guest/events/{eid}/people?q=` | `GET /a/{token}/people` |
| `POST /guest/events/{eid}/rsvp`, `/knows`, `/privacy` | the `/a/{token}` versions |
| `GET /guest/events/{eid}/recommendations` | `GET /a/{token}/recommendations` |
| `POST /guest/events/{eid}/hold`, `/confirm`; `DELETE /guest/events/{eid}/seat` | the `/a/{token}` versions |

To keep one copy of the logic, the bodies of the attendee route functions move
into `events_service/attendee_view.py` (page, people, me) and are called by
both routers with a `Guest`. `confirm_seat` and `release_seat` are called with
`token=None`; the mailer chooses the account email by `guest.account_id`
(section 9.1).

## 7. Account flows

### 7.1 New person through the shared link

1. `GET /j/{token}`: the visitor sees the map.
2. They press "Create an account to choose a seat" and fill in the form.
3. `POST /j/{token}/register` -> 202. The page shows the code step.
4. `POST /guest/verify` -> 201 with session and `join`.
5. `joined` or `linked` or `already_member`: go to `/my/{event_id}`.
   `event_full`, `link_closed`, `deadline_passed`: go to `/my` with the
   matching message (section 10.4).

### 7.2 Demo mode

`CodeSent.demo_code` holds the code, and the page shows it under "Demo only:
your code is 123456", only when **all** of these hold (`accounts.may_show_code`):

1. `DEMO_MODE=1` and `EMAIL_PROVIDER=console` (no real email can go out);
2. the address ends in `@example.com` (a reserved domain: nobody owns that inbox);
3. no organiser has invited that address on any event (an active guest row
   with no account).

Password reset codes are never shown. An account made with a shown code gets
`email_proven = false` and is never linked to an invitation, even if the
organiser invites the address later (S30). This keeps the demo and the
Playwright tests working with made-up addresses, while a real address, or an
invited one, on a demo deployment still needs the inbox.

### 7.3 Linking to an invited guest safely (default 3)

The rule: **an account is linked to an existing guest row only when the
account's address has been proven by an emailed code (`email_proven`), and
that address equals the row's `email` ignoring case.** The join step (section
8.2, step 3) applies this rule both after verify and on `POST /j/{token}/join`.
The code works only in the browser that started the sign-up (`signup_id`,
S31), so a stranger who types an invited guest's address cannot use the code
the guest receives.

- Typing an invited guest's address on the sign-up form does nothing to that
  guest: no row is touched until the code from that inbox is typed.
- Linked rows keep the organiser's name, group, needs, reserved tag, RSVP,
  acquaintances and seat. `source` stays `invited`.
- A row that is erased (`token_revoked_at` set) or already linked to another
  account is never linked.
- The guest's personal link keeps working after linking.
- If the person signs up with a **different** address from the invited one, a
  second (self-registered) row is made. The organiser sees both and can
  remove one. Linking by personal link instead of email is not built
  (section 15, question 4).

### 7.4 Returning guest

`/my/sign-in` -> `POST /guest/login` -> `/my` (or the `next` page). The seat
email's button opens `/my/{eid}`; without a session the page sends them to
`/my/sign-in?next=/my/{eid}`.

### 7.5 Forgotten password

`/my/forgot` -> `POST /guest/password/forgot` -> `/my/reset?email=...` ->
`POST /guest/password/reset` -> signed in, `/my`.

## 8. Limits, caps and capacity

### 8.1 Rate limits

All use `security.rate_limit` (database-backed, keyed hash of the "who" part).
"Network" means `network_of(client_ip(request))` (IPv6 counted by its /64);
`mailbox()` and `network_of()` move from `restaurant_service/booking_caps.py`
to `security.py` so both verticals import them from one place
(`booking_caps.py` imports them back; its behaviour does not change).

| What | Key | Limit |
|---|---|---|
| Visitor reads `GET /j/{token}` | `share-view:<ip>` | 600 a minute (a whole room may share one address) |
| Code emails, per network (register and forgot together) | `code-send:<network>` | 60 an hour, and `code-send-day:<network>` 200 a day |
| Code emails, per address | `code-send-mail-register:<mailbox(email)>` and `code-send-mail-reset:<mailbox(email)>` | 3 an hour each |
| Code emails, whole app | `code-send-all:all`, counted only when an email is really queued | 500 an hour (protects the sending domain and the Resend quota) |
| Code checks (`/guest/verify`, `/guest/password/reset`) | `code-check:<network>` | 100 per 10 minutes; plus 5 tries per code (section 6.4) |
| Login | `guest-login:<ip>` | 10 a minute |
| Failed logins per account | `guest-login-fail:<email>\|<network>` and `guest-login-fail-all:<email>` (counted only after a wrong password) | 20 an hour from one network, 100 an hour from all together, then 429 "Too many tries for this account. Reset your password or try again in an hour." |
| Joins per event (new guest rows by the shared link) | `share-join:<event id>` | 30 an hour |
| Account holder event routes | `guest-events:<ip>` | 120 a minute |

Every limit answers 429 `rate_limited` and the request changes nothing. The
address limits are counted before any other write (as `rate_limit` asks).

Why these numbers:

- Guessing a code: at most 5 tries per code and 3 codes an hour per address
  gives 15 guesses an hour out of a million codes (about 1 in 66 000).
- 60 code emails an hour per network leaves room for a conference on one
  Wi-Fi joining together (the same concern as S8; raised from 20 after R8).
  Every account still needs a real inbox, which is the real brake.
- The failed-login block (finding S14) counts per address and network, so a
  guesser blocks only their own network, not the owner at home (S39). The
  100-an-hour count over all networks still stops spread-out guessing; the
  emailed reset code clears both counts for the network that uses it.
- Sign-up and reset codes are counted apart per address, so asking for reset
  codes cannot block someone's sign-up (S33).
- The whole-app code limit is a denial-of-service lever (a flood would stop
  sign-ups for an hour). It is still worth it: the alternative is an unbounded
  email bill and a blocked sending domain.

### 8.2 Capacity and the join step

`places_left(event)`:

```
capacity    = seats of the venue that are not blocked
reserved    = of those, seats reserved for a tag (a newcomer has no tag)
guests      = active guests of the event (is_active: not erased, rsvp not "no")
tagged      = active guests with a reserved tag; untagged = guests - tagged
joined      = active guests with source "self_registered"
by_seats    = capacity - guests
for_new     = (capacity - reserved) - untagged - max(0, tagged - reserved)
by_cap      = share_cap - joined          (only when share_cap is not null)
places_left = max(0, min(by_seats, for_new, by_cap))
```

Invited guests who have not answered still count, so their places are
protected. Guests with a tag sit on the reserved seats first and only take
open seats when there are more of them than reserved seats (R4).

**Coming back after "no"** (R3). A guest who said no does not count, so
someone may join in their place. `set_rsvp` (both doors) checks, after the
event lock, before a "no" becomes "yes": when the link has brought anyone in
(or the guest joined with it) there must be fewer active guests than seats,
and a self-registered guest must also fit under the cap. Otherwise 409
`event_full` "This event is full. Every place has a guest." An event that
never used the link keeps today's behaviour.

`join(session, event, account)` steps, in one transaction, the first write
being `lock_event(session, event)`:

1. `share_enabled` is false: `link_closed`. Deadline passed:
   `deadline_passed`.
2. The account already has an active row on the event: `already_member`.
   The organiser removed its row (an erased row still holding the account):
   `removed` (S35).
3. The account's address is proven (`email_proven`) and an active, unlinked
   row's `lower(email)` equals it: set `account_id`: `linked` (no capacity
   check: no new guest).
4. Count `share-join:<event id>` (section 8.1).
5. `places_left` (computed **after** the lock) is 0: `event_full`.
6. Insert the guest row: `name` from the account, `email` the account email,
   `source = "self_registered"`, `account_id`, `rsvp = "yes"`,
   `needs_accessible` from the sign-up (False on `/join`), `token_hash` of a
   token nobody gets. Audit `guest.self_register` with the guest id only.
   `joined`.

The lock makes step 5 safe under concurrency: a second join waits at step 0
until the first commits, then counts the new row.

## 9. Emails and the seat picture

### 9.1 Which email a guest gets

In `events_service/mailer.queue_seat_email`:

- `guest.account_id` is NULL: **unchanged** (today's templates, personal link
  when known, no picture).
- `guest.account_id` is set and the kind is `seat_confirmed` or
  `seat_changed`: the account template (9.2), with the picture and the
  invite; the button links to `{PUBLIC_BASE_URL}/my/{event.public_id}`, a page
  that needs a sign-in, so the email holds **no secret link**.
- `seat_cancelled` for an account holder: today's cancellation words, link to
  `/my/{event.public_id}`, no picture.
- The reminder (`mail/reminders.py`): today's words; the link is
  `/my/{event.public_id}` for account holders; no picture.

- An applied plan (apply, undo, redo) that gives an account holder a new seat:
  the account template with the picture and "The organiser moved you to a new
  seat." (`plans._email_account_holder`, D5 as changed).

The idempotency keys stay as today (`seat-<kind>:<guest id>:<seat id>:<audit
id>`; a plan move writes a `seat.plan_move` audit row for the id), so
`forget_guest_emails` keeps finding these rows.

### 9.2 The account seat email

Subject (`templates._subject`, one line, at most 200 characters):

- confirmed: `Your seat for {event}: seat {seat} at table {table}`
- changed: `Your seat for {event} has changed: now seat {seat} at table {table}`

Plain-text body (confirmed; for "changed" the first sentence is replaced by
"Your seat for {event} has changed." plus, when the organiser moved them, "The
organiser moved you to a new seat." and "Before: seat {old}. Now: seat {new}."):

```
Hello {name},

Your seat for {event} is confirmed.

Event: {event}
When: {when}
Where: {venue}
Your seat: seat {seat} at table {table}

The picture shows the room from above. Your seat is the large black dot inside a ring, with the label YOU. If your email app shows no picture, it is attached as seat-map.png.

You can change or give up your seat until {deadline}.

See my seat: {PUBLIC_BASE_URL}/my/{event public id}

The SeatPlan team

--
You received this email because you have a SeatPlan account and joined {event}.
To stop these emails, give up your seat or delete your account on the page above. We never send marketing.
```

`{deadline}` is `format_when(change_deadline, venue timezone)`, or "the
organiser closes changes" when there is none. `{when}` is
`format_when(starts_at, venue timezone)`. Every value a person typed is
HTML-escaped in the HTML version and passed through `_one_line` in the subject,
as today.

HTML body: the existing `_PAGE` frame. Inside the white card, in order:
greeting; first sentence; a two-column details table (`<table role="presentation">`
with `<th scope="row">` for Event, When, Where, Your seat); the picture; a
caption; the deadline sentence; the existing `_BUTTON` with label "See my
seat"; "The SeatPlan team". The picture element:

```html
<img src="cid:seatmap" width="{w}" alt="{alt}"
     style="display:block;width:100%;max-width:{w}px;height:auto;border:1px solid #d4d4d8;border-radius:6px;margin:16px 0 8px;">
<p style="margin:0 0 16px;font-size:14px;color:#3f3f46;">Your seat: seat {seat} at table {table}, marked YOU.</p>
```

`{w}` is the picture's real width (read from the PNG header, `png.png_width`),
at most 560, so a tall, narrow room is never stretched (Outlook reads only the
`width` attribute; R9). `{alt}`: "Floor plan of {venue} seen from above. Your seat, seat {seat} at
table {table}, is marked with a large black dot inside a ring and the label
YOU." (HTML-escaped, at most 300 characters). The caption repeats the seat in
words so nobody needs the picture.

Attachments sent to the provider: the existing `invite.ics`, and the picture
`{"filename": "seat-map.png", "content": <Base64>, "content_id": "seatmap"}`.
Resend documents `content_id` inside each `attachments` item for inline images
referenced as `cid:` (resend.com/docs/dashboard/emails/embed-inline-images,
read 2026-11-10); the content type is worked out from the filename, so none is
sent. The console provider logs `has_image=True/False`, never the picture.

### 9.3 The picture: how it is drawn

**Choice: a small PNG writer and rasteriser in the standard library**
(`zlib` for compression, `struct` and `binascii.crc32` for the PNG chunks).
New modules: `mail/png.py` (encode an indexed-colour image), `mail/pixel_font.py`
(a 5 x 7 pixel font as a dict of strings like `"01110"`), `mail/seat_picture.py`
(draw the room). No new dependency.

Why not a library:

- The contract says to prefer the standard library and to ask before any new
  runtime dependency. Pillow is a compiled package; its size was not measured
  here. Size is not the blocker: Vercel's limit for a Python function is
  500 MB uncompressed (vercel.com/docs/functions/limitations, read
  2026-11-10). The blocker is a compiled dependency to install, pin and audit
  for a picture made of circles, rectangles and a few letters.
- SVG would be smaller to write, but Gmail and Outlook do not show SVG in
  emails; a PNG with a content id is shown by the main mail apps.
- A throwaway measurement on 2026-11-10 (script in the system temp folder,
  deleted afterwards, never in the repository): a 640 x 427 indexed PNG of the demo wedding room
  (10 round tables, 80 seats, one marked seat, no text) took **10.4 ms** to
  draw and encode and was **3160 bytes** (4213 as Base64). Text, zones and
  rotated tables will add to that; the budget below leaves plenty of room.

Budget, checked by tests (13.1): at most **60 KB** PNG and **150 ms** for the
two demo rooms on a developer laptop.

### 9.4 The picture: what is drawn

Pure function, no database:

```python
@dataclass(frozen=True)
class PictureSeat:  id: int; table_id: int; x: float; y: float
@dataclass(frozen=True)
class PictureTable: id: int; label: str; shape: str; x: float; y: float; w: float; h: float; rotation: float
@dataclass(frozen=True)
class PictureZone:  kind: str; name: str; x: float; y: float; w: float; h: float
@dataclass(frozen=True)
class PictureRoom:  width: float; height: float; zones: tuple[PictureZone, ...]; tables: tuple[PictureTable, ...]; seats: tuple[PictureSeat, ...]

def render_seat_picture(room: PictureRoom, my_seat_id: int, seat_label: str, table_label: str) -> bytes
```

**No type here has a field for a person**, so the picture cannot show anyone's
name, by construction. The mailer builds `PictureRoom` from `zones`, `tables`
and `seats` of the venue only.

Size: width 640 px; height `round(640 * venue.height / venue.width)`. When
that is more than 640, the height is 640 and the width is scaled down; neither
side goes below 240. A 40 px header band sits above the map; the map keeps
16 px padding and the venue's proportions.

Palette (indexed PNG, colour type 3, 8 entries; all on a white background so
dark-mode mail apps cannot make it transparent):

| Index | Colour | Used for |
|---|---|---|
| 0 | `#ffffff` | background, halo around the marker, text inside the tag |
| 1 | `#18181b` | header text, room outline, the marker's dot and ticks, the tag |
| 2 | `#f4f4f5` | zones |
| 3 | `#a1a1aa` | other seats (hollow rings) |
| 4 | `#d4d4d8` | tables |
| 5 | `#1d4ed8` | the marker's ring |
| 6 | `#71717a` | stage hatching, table labels |
| 7 | `#52525b` | outline of the guest's own table |

Drawing order:

1. Background; room outline 2 px in colour 1.
2. Zones: filled rectangles in colour 2. A `stage` zone also gets diagonal
   hatching every 6 px in colour 6. A zone name is written in the pixel font
   (scale 1) at its top-left only when it is plain ASCII and fits.
3. Tables: `round` as a filled ellipse; `rect` and `row` as a filled
   rectangle, rotated by `rotation` around its centre (each pixel of the
   rotated bounding box is turned back into the table's own frame and tested).
   Colour 4. The guest's own table gets a 2 px outline in colour 7. Table
   labels in colour 6, scale 1, centred, only when ASCII and narrower than the
   table.
4. Other seats: hollow rings, radius 5 px, 2 px wide, colour 3. No state is
   drawn (free and taken look the same), so the picture says nothing about
   other guests.
5. The guest's seat, drawn last so nothing covers it:
   - a white halo disc, radius 22 px;
   - a ring in colour 5, outer radius 18 px, 5 px wide;
   - a solid dot in colour 1, radius 9 px;
   - four ticks in colour 1, 3 px wide, from 22 px to 30 px out (up, down,
     left, right), like a target;
   - a 2 px leader line in colour 1 to a tag: a black rounded box with "YOU"
     in white at scale 2, placed up and to the right, or flipped to stay
     inside the picture when the seat is near an edge.
6. Header band: "YOUR SEAT: {seat} AT TABLE {table}" in colour 1, scale 2,
   upper-cased, ASCII only. If a label has a character the font lacks, or the
   line is wider than the picture, the header becomes "YOUR SEAT IS MARKED
   YOU". The full labels are always in the alt text and the email words.

**Not relying on colour.** The marked seat differs from every other seat in
size (radius 18 against 5), in fill (solid against hollow), in shape (ticks)
and by a text label. In greyscale it is still a black dot inside a ring with
"YOU" next to it. Contrast on white, computed with the WCAG formula on
2026-11-10: `#18181b` 17.72:1, `#1d4ed8` 6.70:1, `#52525b` 7.73:1, `#71717a`
4.83:1. A unit test repeats this sum for every palette entry used for marks
or text and fails below 4.5:1.

The pixel font covers `A` to `Z`, `0` to `9`, space and `. - : / ( ) & + # '`.
Lower case is drawn as upper case.

### 9.5 Account code emails

All three use `_compose` (greeting, paragraphs, one link, footer reason) and
carry **no secret link**.

| Kind | Subject | Paragraphs | Link label and target |
|---|---|---|---|
| `account_code` | `Your SeatPlan code` | Greeting "Hello," with **no name** (the typed name is not proven, S34). "Your code to finish creating your SeatPlan account for {event} is: {code}" / "It works for 15 minutes. If you did not ask for it, ignore this email: no account is made without the code." / "Never give this code to anyone. SeatPlan never asks for it by phone or message." | "Open SeatPlan", `{base}/my/sign-in` |
| `password_code` | `Your SeatPlan password reset code` | "Your code to choose a new SeatPlan password is: {code}" / "It works for 15 minutes. If you did not ask for it, ignore this email: your password stays the same." | "Open SeatPlan", `{base}/my/sign-in` |
| `account_exists` | `You already have a SeatPlan account` | "Someone, probably you, tried to create a SeatPlan account with this address to join {event}. You already have one, so nothing changed." / "To join this event, open again the link the organiser shared and choose "I already have an account". Sign in with your password, or choose a new one if you forgot it." (R7) | "Sign in", `{base}/my/sign-in` |

Reason line: "You received this email because someone typed this address on
SeatPlan." The code is never in the subject (lock screens show subjects).
The `_STOP_TEXT` footer does not fit these emails; the templates use "You
will not get more emails unless you ask for another code." instead.

Idempotency keys: `account-code:<email_codes id>`, `password-code:<email_codes id>`,
`account-exists:<mailbox(email)>:<UTC hour>` (at most one an hour per address).

### 9.6 Outbox changes

- New column `image_png` (section 3.3) and `OutgoingEmail.image_png: str | None`.
- `enqueue(..., image_png: str | None = None)`.
- `ResendProvider._payload` adds the picture attachment (9.2) when present.
- **Codes are secrets too (like S9).** When a row of kind `account_code` or
  `password_code` is finished (sent, skipped, failed), its `body_text` and
  `body_html` become `[code removed]`. When a code is used or replaced, any of
  its rows still `queued` are blanked and set to `skipped`.
- `_PERSONAL_LINK` also matches `/j/<token>`, in case a shared link is ever
  pasted into an email or an error.
- `scrub_expired` also sets `image_png = NULL`.
- `forget_guest_emails` also sets `image_png = NULL`.
- New `send_now(session, provider, idempotency_key, now)`: claims that one row
  with the existing `_claim` and sends it with `_process_one`, so it can never
  be sent twice even if the cron runs at the same moment. Called after commit
  by `register`, `forgot` (codes and `account_exists`). Any exception is
  logged and swallowed: the row stays queued for the cron.
- The cron endpoint also deletes `email_codes` rows whose `expires_at` has
  passed.
- `GET /emails/log` items gain `has_picture: boolean` (`image_png` is not
  NULL). The picture itself is never returned by any API route.

## 10. Frontend

### 10.1 API client

- `client.ts`: `request(method, path, body?, auth?: "organiser" | "guest" | "none")`,
  default `"organiser"` so every existing call is unchanged. `"guest"` sends
  the token from `sessionStorage["seatplan.guest-session"]`; `"none"` sends no
  `Authorization`. New helpers `getGuestToken`, `setGuestToken`,
  `clearGuestToken` (same try/catch pattern as the organiser ones). A 401 on
  a guest call clears the guest token.
- `types.ts`: `ErrorCode` gains `"event_full" | "link_closed"`.
- New `api/guest.ts`: the shapes of section 6 and one function per route:
  `getVisitorView(token)`, `register(token, body)`, `joinEvent(token)`,
  `verifyCode(email, code)`, `guestLogin(email, password)` (stores the token),
  `guestLogout()`, `forgotPassword(email)`, `resetPassword(email, code, newPassword)`,
  `getMyAccount()`, `deleteMyAccount(password)`, and the account event calls.
- `api/events.ts`: `OrganiserGuest` gains `source` and `has_account`; new
  `ShareSettings`, `getShare(eid)`, `patchShare(eid, changes)`,
  `regenerateShare(eid)`.

### 10.2 Reusing the attendee screens

`useAttendeeData` and `useAttendee` today take a token. They change to take an
adapter:

```ts
interface AttendeeApi {
  view(): Promise<AttendeeView>;
  recommendations(): Promise<SeatRecommendation[]>;
  people(q: string): Promise<VisiblePerson[]>;
  rsvp(answer: "yes" | "no"): Promise<unknown>;
  knows(ids: number[]): Promise<unknown>;
  privacy(wantsAnonymous: boolean): Promise<unknown>;
  hold(seatId: number): Promise<HoldResponse>;
  confirm(seatId: number): Promise<unknown>;
  release(): Promise<unknown>;
}
function linkApi(token: string): AttendeeApi      // today's /a/{token} calls
function accountApi(eventId: string): AttendeeApi // /guest/events/{eid}, auth "guest"
```

`AttendeePage` becomes a thin wrapper that passes `linkApi(token)`;
`MySeatPage` passes `accountApi(eventId)`. Every step component stays as it is.

### 10.3 Routes (added to `App.tsx`)

| Path | Page | Who |
|---|---|---|
| `/j/:token` | `pages/join/JoinPage.tsx` | Visitor |
| `/j/:token/register` | `pages/join/RegisterPage.tsx` (form, then code step) | Visitor |
| `/j/:token/sign-in` | `pages/join/JoinSignInPage.tsx` (sign in, then `POST /j/{token}/join`) | Account holder |
| `/my` | `pages/account/MyEventsPage.tsx` | Account holder |
| `/my/sign-in` | `pages/account/GuestSignInPage.tsx` (reads `?next=`) | Account holder |
| `/my/forgot`, `/my/reset` | `pages/account/ForgotPage.tsx`, `ResetPage.tsx` | Account holder |
| `/my/account` | `pages/account/AccountPage.tsx` (details, privacy text, delete) | Account holder |
| `/my/:eventId` | `pages/account/MySeatPage.tsx` (the attendee steps) | Account holder |

`/my/account`, `/my/sign-in`, `/my/forgot` and `/my/reset` are declared before
`/my/:eventId`. `next` is followed only when it starts with `/my/` and
contains no `//` and no `:` (no open redirect). Pages under `/my` without a
guest token send the person to `/my/sign-in?next=<this path>`.

`pages/demoLinks.ts`: `groupFor` puts `/j/` and `/my` paths in `events`.

### 10.4 Pages and states

**JoinPage (`/j/:token`)**

| State | What shows |
|---|---|
| Loading | `States` loading: "Loading the event" |
| Ready, open | Event name (h1), date and place, the read-only live map, legend (free, held, taken, not available), a panel: "{places_left} places left." Buttons "Create an account to choose a seat" (primary) and "I already have an account" (secondary) |
| Ready, signed in as an account holder (guest token present) | Same, but the one button "Join this event" calls `POST /j/{token}/join` |
| Picking a free seat | Selecting a free seat does **not** hold it. An inline panel under the map: heading "Seat {seat} at table {table} is free", text "To choose it, create an account. It takes a minute; we will email your seat and a picture of the room.", the two buttons. The seat id is kept in `sessionStorage["seatplan.wanted-seat.<event live scope>"]` so the seat page can offer it later |
| Full (`join.reason == "full"`) | Map still shows. Panel: "This event is full. Every place has a guest." Buttons "I was invited: create my account" (to the register page; R5) and "I already have an account" |
| Deadline passed | Panel: "Seat choices for this event have closed." Only "I already have an account" |
| Link switched off (403 `link_closed`) | No map. "The organiser is not taking new guests through this link at the moment. If you already joined, sign in to see your seat." Link "Sign in" -> `/my/sign-in` |
| Link replaced or wrong (404) | No map. "This link does not work. It may have been replaced by a new one. Ask the organiser for the current link." |
| Rate limited (429) | "Too many people are opening this page from your network. Please wait a minute and try again." with a "Try again" button |
| Network error | Today's network message with "Try again" |
| Live update | The map refreshes through `useLive(view.event.live_scope)`; places left updates. A failed refresh keeps the old map and shows "The map may be out of date: we could not refresh it. It will try again at the next change." (R8) |
| Joining closes while a seat is picked | The panel closes and the hidden live region says "Joining this event closed while you were looking." (not "no longer free"; R13) |

**RegisterPage (`/j/:token/register`)**

Step 1, form (one column, each field a `Field` with a visible label):

- "Your name" (autocomplete `name`); hint "The organiser sees it. Other guests see it as the organiser's privacy setting allows."
- "Email" (type email, autocomplete `email`); hint "We email you a code to check it is yours, then your seat."
- "Password" (type password, autocomplete `new-password`); hint "At least 10 characters." A "Show password" toggle button with `aria-pressed`.
- Checkbox "I need an accessible seat".
- Checkbox (required) "I agree that SeatPlan stores my details to manage my seat and emails me about it." followed by a `<details>` "What we store" with the privacy text of section 11.2.
- Button "Send my code".

The register answer's `signup_id` is kept in the page's memory and sent with
the code; "Send a new code" registers again and gets a new one.

Step 2, code: heading "Check your email". Text "We sent a 6-digit code to {sent_to}. It works for 15 minutes. If you already have an account with this address, we sent a sign-in reminder instead." Field "Code" (`inputmode="numeric"`, `autocomplete="one-time-code"`, `pattern="[0-9]{6}"`, maxlength 6). Button "Create my account". Links "Send a new code" (calls register again with the kept values; disabled for 30 seconds) and "Use a different email" (back to step 1, password field emptied). In demo: a `Badge` "Demo only: your code is {demo_code}".

Results of verify: `joined`/`linked`/`already_member` -> `/my/{event_id}` with a toast "Your account is ready." (`linked`: "Your account is ready. We found your invitation, so your details are already here."). `event_full` -> `/my` with notice "Your account is ready, but this event filled up while you were signing up." `link_closed` -> `/my` with "Your account is ready, but the organiser has closed sign-ups for this event." `deadline_passed` -> `/my` with "Your account is ready, but seat choices for this event have closed."

Errors are shown next to their field (`aria-describedby`, `aria-invalid`) and
summarised at the top in a box with `role="alert"` that receives focus.

**JoinSignInPage, GuestSignInPage**: fields "Email" (autocomplete `email`) and
"Password" (autocomplete `current-password`), button "Sign in", links "Forgot
your password?" and, on the join page, "Create an account instead". Error
"Email or password is not correct."

**ForgotPage / ResetPage**: "Email" then "Send a reset code"; then "Code", "New
password" (autocomplete `new-password`, at least 10 characters), "Save and sign
in". After forgot: "If there is an account for {sent_to}, we sent it a code."

**MyEventsPage (`/my`)**: h1 "My events". One card per `MyEvent`: name, date
and place, "Your seat: seat 5 at table T3" or "No seat yet", button "Open".
Empty: "You have not joined any events yet. Open the link the organiser shared
to join one." Header links "My account" and "Sign out" (sign out text: "This
signs you out on every device.").

**MySeatPage (`/my/:eventId`)**: the attendee steps (Welcome, People, Seat,
Done) through `accountApi`. Differences from `AttendeePage`:

- A top bar: "Signed in as {email}", "My events", "Sign out".
- If a wanted seat was kept from the visitor page and is still free, the seat
  step opens with it selected and the hold bar offers "Hold seat {seat}".
- Done step adds: "We are emailing your seat and a picture of the room to
  {email}. It can take up to 15 minutes."
- 404: "You are not on the guest list of this event with this account."
  with a link to "My events".
- 401: back to `/my/sign-in?next=/my/{eventId}`.

**AccountPage (`/my/account`)**: name, email, "Account made on {date}", the
privacy text, and a danger zone: button "Delete my account". The dialog
(`Dialog`): title "Delete your account?", text "We free your seats, take you
off the guest lists you joined with this account and wipe the emails we keep
for you. Where you joined with the shared link, we take you off the guest list.
Where the organiser invited you, they keep their own record of your
invitation, without your account. This cannot be undone." (R12), field "Your
password" (a wrong one shows "That password is not correct." under the field
and keeps the person signed in), buttons "Delete my account" (danger) and
"Keep my account". After success the guest token is
cleared and the page shows "Your account is deleted." with a link home.

**Organiser: `ShareLinkCard.tsx`** in the Settings tab, after the deadline
card:

- h3 "Shared link".
- Checkbox "Allow people to join with the shared link". Hint: "Anyone with the
  link sees the seat map, with names shown as set above. To choose a seat
  they create an account with a checked email address. Your invited guests
  keep their personal links."
- When on: a read-only text field labelled "Link to share" holding
  `window.location.origin + link`; buttons "Copy link" (status text "Link
  copied" in a polite live region) and "Make a new link".
- "Make a new link" opens a `Dialog`: "Make a new link? The current link stops
  working at once. People who already joined keep their places." Buttons
  "Make a new link" and "Cancel".
- `needs_new_link`: "The link had to be reset for security. Make a new link to
  share." with the button.
- Field "Most people who may join with this link" (number, optional, 1 to
  5000), button "Save limit"; hint "Leave empty to allow up to the number of
  free seats."
- Line: "{joined} joined with the link. {places_left} places left ({guests}
  guests for {capacity} seats)." ("1 place left" for one). Not a live region:
  the numbers change at every live update (R13).
- When off: "The link is off. Nobody new can join with it. People who already
  joined keep their seats and can still sign in."

**GuestRow**: `Badge` "Joined with link" (tone `info`) when `source ===
"self_registered"`; `Badge` "Has an account" (tone `neutral`) when
`has_account`. The remove action is unchanged.

### 10.5 Keyboard and screen readers

- Each page has one `h1`; when a step changes (form to code, code to done),
  focus moves to the new heading (`tabIndex={-1}`).
- The visitor map is the existing `SeatMap` in `"seats"` mode with no hold
  behind it: arrow keys move between seats as today (`mapKeyboard.ts`); each seat's name
  reads "Seat 5, table T3, free" (or held, taken, not available, plus
  "accessible"). Enter or Space on a free seat opens the join panel and moves
  focus to its heading; Escape closes it and returns focus to the seat.
  `selectable` allows only free seats.
- Live map changes are announced by the map's existing hidden live region;
  places left is in a `aria-live="polite"` line.
- Forms: every input has a `<label>`; hints and errors are tied with
  `aria-describedby`; required fields have `required` and the label says
  "(required)" only for the consent box (the others are all required and the
  form says "All fields are needed" once at the top).
- The code field announces "6 digits". The "Send a new code" countdown is not
  announced every second; only "You can ask for a new code now" when it ends.
- Password toggle: a `button` with `aria-pressed` and the text "Show
  password" / "Hide password"; it never moves focus.
- Dialogs use the existing `Dialog` (focus trap, Escape closes, focus returns).
- Copy link: if the clipboard is blocked, the text field is selected and the
  status says "Press Ctrl+C or Cmd+C to copy."
- Touch targets at least 44 by 44 px (existing tokens). Works at 390 px wide
  with no horizontal scroll.

## 11. GDPR

### 11.1 What deleting an account does (`POST /guest/me/delete`)

In one transaction, for each event with a guest row linked to the account,
calling `lock_event` first:

- `self_registered` row: the same erasure as an organiser delete
  (`erase_guest`, refactored so the actor is a string, here
  `account:<account id>`): address removed first, seat released without an
  email, acquaintances deleted, personal data overwritten, outbox rows wiped,
  `account_id = NULL`.
- `invited` row: seat released with `drop_assignment(..., notify=False)` (a
  new flag: no cancellation email, reminder cancelled), this guest's outbox
  rows wiped with `forget_guest_emails`, `account_id = NULL`. The organiser's
  record (name, email they typed) stays.

Then: delete the account's `email_codes` rows; blank every outbox row of kind
`account_code`, `password_code` or `account_exists` whose `to_email` is the
account email (same blanking as `forget_guest_emails`); delete the
`guest_accounts` row (so every session stops working); audit `account.delete`
with the account id only. The address can sign up again later as a new
account.

### 11.2 Privacy text (shown on the sign-up form and the account page)

> **What we store.** Your name, your email address, your password in a
> scrambled form we cannot read, the events you join, your seat, the people
> you say you know, whether you need an accessible seat and whether you want
> to be shown as "Guest". The organiser of each event you join sees your name,
> email and seat. Other guests see your name only as the organiser's privacy
> setting allows, never your email. We email you only about your seat: a
> confirmation or a change comes with a picture of the room that shows no
> other guest's name; a reminder or a "seat released" email has no picture.
> We never send marketing. We keep the words of each email for 30 days. We
> keep your account until you delete it. For security we also keep, without
> your name or email, a log of changes to seats and short-lived counters that
> slow down password guessing. You can delete your account at any time on the
> My account page: we free your seats and wipe the emails we keep for you. If
> an organiser invited you, they keep their own record of that invitation.
> Copies already in your inbox stay there.

(Corrected after review R12: the first version said every email had a
picture, and did not say how long the account is kept.)

`consent_version` is `"2026-11-10"`. Lawful basis (our reading, not legal
advice): performance of the service the person asked for (Art. 6(1)(b)); the
consent box records that they read the text.

## 12. Demo data

- `seed/demo_events.py`: both demo events get `share_enabled = True`,
  `share_version = 0` and the derived hash. The returned links gain
  `wedding_share` and `conference_share` (`/j/<token>`), which land in
  `demo_links` and on the home page.
- Demo reset already wipes every table except `organisers` and `rate_limits`,
  so `guest_accounts` and `email_codes` are wiped too (FK order comes from
  `Base.metadata.sorted_tables`). A test checks this.
- No demo account is seeded (no new environment variable). Playwright signs
  up through the demo code (7.2).

## 13. Tests

Every new test must fail when the feature is switched off or broken (write
it, see it fail, then build). Real output only, dated, in the docs.

### 13.1 Backend (pytest, from `backend/`)

`tests/test_migrate_guest_accounts.py`
- Old SQLite schema from the fixture, sample rows, migrate twice: no error;
  every column of 3.3 and index of 3.4 present; old rows unchanged; existing
  event `share_enabled` false and guest `source` `invited`; `guest_accounts`
  and `email_codes` exist; a second guest row with the same `(event_id,
  account_id)` raises `IntegrityError`; two NULL `account_id` rows on one
  event are fine.
- After migrate, `create_app()` starts and `GET /api/events/{eid}` for the
  sample organiser answers 200 with the sample guest.
- The same on Postgres when `SEATPLAN_TEST_POSTGRES` is set, plus two migrate
  runs started together in two threads.
- A fresh database (`create_all` only) and an upgraded one have the same
  columns, defaults and indexes (compare inspector output).

`tests/test_share_link.py`
- New events: link off; `GET /share` gives `link: null`. PATCH on: a 43
  character token; GET again gives the same link.
- Regenerate: new link works, old link 404 with the same body as a made-up
  token; joined people keep their rows.
- Switched off: 403 `link_closed`; switched on again: same link works.
- `SECRET_KEY` changed: `needs_new_link` true, old link 404.
- Another organiser: 404; staff: 403. Audit rows hold no token.
- Demo events: link on; demo links include `wedding_share`.

`tests/test_visitor_view.py`
- `occupant` follows each privacy mode and `wants_anonymous`.
- The JSON of `GET /j/{token}` contains no guest email, dietary note, guest
  id or token of any seeded guest (scan the serialised text).
- Only the four visitor states appear; reserved seats are `blocked`.
- No hold or confirm route exists under `/j/` (POST `/j/{t}/hold` is 404 or 405).
- 121st call in a minute: 429.

`tests/test_guest_register.py`
- New address: 202, one `email_codes` row, code email sent at once by a fake
  provider; the 6-digit code is not stored anywhere in plain text once the
  row is finished (scan every table).
- Existing account address: the same 202 body, no code row, an
  `account_exists` email.
- `demo_code` present only with `DEMO_MODE=1` and the console provider.
- Verify: wrong code reduces tries; the fifth wrong code deletes the row;
  expired code 404; right code: account, session, guest row
  (`self_registered`, `rsvp` yes, `needs_accessible` copied).
- Capacity: with `places_left` 0, verify makes the account, `join.status`
  `event_full`, no guest row. Cap honoured. On Postgres, 10 threads joining
  for 3 places: exactly 3 rows.
- Every limit of 8.1: the call after the limit gets 429 and changes nothing.
- Validation: `consent` false, password of 9 characters, password equal to the
  email, unknown field: 422.

`tests/test_guest_linking.py`
- Invited `Ana.Silva@example.com`; sign-up as `ana.silva@example.com`, code
  typed: `linked`, still one row, seat and acquaintances kept, personal link
  still works.
- Sign-up typed but code never typed: the invited row is unchanged and no
  account exists.
- Erased invited row: not linked; a new row is made.
- Signed-in account on `POST /j/{t}/join`: same rules; `already_member` on the
  second call.

`tests/test_guest_sessions.py`
- A guest token on every organiser route: 401. An organiser token on every
  guest route: 401. An attendee personal token as a bearer: 401.
- Tampered, expired, and wrong-version tokens: 401.
- Logout and password reset end older tokens.
- Login: unknown address and wrong password give the same body; the 21st
  failure in an hour for one account: 429; reset by code still works then.

`tests/test_guest_events.py`
- Hold, confirm, release, RSVP, knows, privacy through `/guest/events/{eid}`
  behave like `/a/{token}` (reuse the attendee flow assertions).
- Not a member, removed by the organiser, or another account's event: 404.
- One account on two events: `GET /guest/me` lists both, seats right.
- Two account holders hold the same seat: one 409 `seat_taken`.

`tests/test_seat_picture.py` (a small test-only PNG reader: check signature,
read IHDR, inflate IDAT, undo filter 0)
- Size rules for wide, tall and square rooms.
- The marked seat's centre pixel is colour 1; a pixel at radius 16 is colour 5;
  every other seat's centre is not colour 1 (hollow).
- No guest data reaches the drawing: the `Picture*` dataclasses have only the
  fields of 9.4 (a test lists them), and the mailer's `picture_room()` builder
  is tested to read only `zones`, `tables` and `seats` (a guest named
  "ZEBRA" seated next to the marked seat changes no pixel of the picture).
- Palette contrast: every entry used for marks or text is at least 4.5:1 on
  white.
- Rotated rect table drawn where expected; a seat at each corner keeps the
  tag inside the picture; non-ASCII labels fall back to the plain header and
  do not crash.
- Demo wedding and conference: PNG at most 60 KB, render at most 150 ms.

`tests/test_account_emails.py`
- Account holder confirms: one `seat_confirmed` row with `image_png`, HTML with
  `cid:seatmap`, the alt text and the seat words, text body with the seat,
  invite attached, link `/my/{eid}`, no `/e/` or `/a/` link.
- Organiser `PUT /assignments`: `seat_changed` with picture and "The organiser
  moved you".
- Personal-link-only guest: emails identical to today (compare with the
  existing template output; no `image_png`).
- Applying a plan: no seat email (unchanged).
- Resend payload: two attachments, the picture with `content_id` `seatmap`.
- `scrub_expired` and `forget_guest_emails` empty `image_png`; finished code
  rows read `[code removed]`; `send_now` and a cron run at once send a code
  once.

`tests/test_guest_delete.py`
- Wrong password: 401, nothing changed.
- Self-registered seat freed, row erased; invited row unlinked with its seat
  released and **no** cancellation email; outbox rows wiped; code rows gone;
  old session 401; the account email and name appear in no table except the
  organiser's own invited row.
- Signing up again with the same address works.

Also: `test_demo_live.py` (reset wipes `guest_accounts`), `test_redteam.py`
(guest token is not an organiser token), existing suites unchanged and green.

`tests/test_guest_review_fixes.py` (27 tests, added after the reviews): one
or more tests per fix of section 2.1, each shown to fail when its fix is
undone (the list of runs is in `docs/test-report.md`).

### 13.2 Frontend units (vitest)

- `client.ts`: `auth: "guest"` sends the guest token and not the organiser
  token; `"none"` sends none; a 401 on a guest call clears the guest token.
- `safeNext()`: accepts `/my/abc`; refuses `//evil.example.com`,
  `https://evil.example.com`, `/my//evil.example.com`, `/my/a:b`, `/e/abc`
  and the empty string.
- `JoinPage`: loading, 404, 403, full and deadline states show their texts;
  choosing a free seat opens the join panel and never calls a hold.
- `RegisterPage`: required fields, consent, 10-character rule, code step,
  demo code shown only when sent, each verify status routes as in 10.4.
- `ShareLinkCard`: switch calls `patchShare`; copy announces "Link copied";
  "Make a new link" asks first; `needs_new_link` text.
- `GuestRow`: both badges.
- `MyEventsPage`: empty state; `AccountPage`: delete needs the password and
  clears the guest token.
- `demoLinks`: `/j/...` goes to the events group.
- `linkApi` and `accountApi` call the right paths (fetch mock).

### 13.3 Browser (Playwright, `frontend/e2e/`)

Built (2026-11-10): `guest-account.spec.ts` covers steps 1, 2 (sign-up,
hold, confirm, the outbox row with `has_picture`, "Joined with link" as
`source`), 3, a second visitor who cannot take the seat (map and a 409 from
the API), and step 5's switch-off. `mobile.spec.ts` adds the sign-up at 390 x
844 with touch and no sideways scroll. `accessibility.spec.ts` adds axe scans
of `/j/:token`, `/j/:token/register` and `/my/sign-in`. Steps 4, 6 and 7, the
second half of step 5 (new link) and the axe scans of `/my/:eventId` and the
Settings tab are covered by backend tests only.

The original plan for `guest-account.spec.ts`:

1. Visitor opens `wedding_share`: map visible, a free seat gives the join
   panel, no hold made (organiser map unchanged).
2. Sign-up with `new.guest@example.com`, demo code, lands on `/my/{eid}`,
   holds and confirms a seat; the organiser's email log shows a
   `seat_confirmed` row to `ne***@example.com` with `has_picture` true; the
   organiser guest list shows "Joined with link".
3. Sign out, open `/my/{eid}`: sent to sign-in; sign in: back on the seat
   page, seat still "mine".
4. Sign-up with a demo invited guest's address: after the code, their seat
   page shows the invitation's data; the organiser list has one row for that
   address.
5. Organiser switches the link off: the visitor page shows the closed state.
   On again, "Make a new link": the old link shows the "does not work" state,
   the new one works.
6. Organiser sets the cap to the number already joined: the visitor page
   shows the full state.
7. Delete account: organiser map shows the seat free; signing in fails.

`accessibility.spec.ts` adds axe scans of `/j/:token`, `/j/:token/register`
(both steps), `/my/sign-in`, `/my/:eventId` and the organiser Settings tab.
`mobile.spec.ts` adds steps 1 and 2 at 390 x 844 with touch.

## 14. Work split (no file in both lists)

### 14.1 BACKEND owns `backend/`, `api/`, `requirements.txt`

Changed: `backend/app/models.py`, `security.py`, `main.py` (register
routers), `routers/attendee.py` (calls the moved helpers),
`routers/events.py` (share routes, guest fields), `routers/emails.py` (code
clean-up, `has_picture`), `events_service/guests.py` (`guest_dict` fields,
`erase_guest` actor and `account_id`), `events_service/seating.py`
(`drop_assignment(notify=...)`), `events_service/mailer.py`,
`events_service/schemas.py`, `mail/outbox.py`, `mail/providers.py`,
`mail/templates.py`, `mail/reminders.py` (account link), `restaurant_service/booking_caps.py`
(imports `mailbox`, `network_of` from `security.py`), `seed/migrate.py`,
`seed/demo_events.py`, and the `READ_ME_FIRST.md` of every package touched.

New: `routers/visitor.py` (`/j/...`), `routers/guest_accounts.py`
(`/guest/verify`, login, logout, password, me), `routers/guest_events.py`
(`/guest/events/...`), `events_service/share.py` (derive, places left,
visitor map, join), `events_service/accounts.py` (codes, accounts, delete),
`events_service/attendee_view.py` (page, people, me), `mail/png.py`,
`mail/pixel_font.py`, `mail/seat_picture.py`, `tests/fixtures/schema_2026_11_10.sqlite.sql`,
`tests/fixtures/schema_2026_11_10.postgres.sql`, and the test files of 13.1.

Not changed: `api/index.py`, `requirements.txt` (no new dependency).

### 14.2 FRONTEND owns `frontend/`

Changed: `src/App.tsx`, `src/api/client.ts`, `src/api/types.ts`,
`src/api/events.ts`, `src/pages/events/useAttendeeData.ts`, `useAttendee.ts`,
`AttendeePage.tsx`, `SettingsTab.tsx`, `GuestRow.tsx`, `events.css`,
`src/pages/demoLinks.ts`, `src/pages/events/READ_ME_FIRST.md`,
`e2e/accessibility.spec.ts`, `e2e/mobile.spec.ts`, `e2e/fixtures.ts`,
`e2e/READ_ME_FIRST.md`.

New: `src/api/guest.ts`, `src/pages/events/attendeeApi.ts` (`linkApi`,
`accountApi`), `src/pages/events/ShareLinkCard.tsx`, `src/pages/join/`
(`JoinPage.tsx`, `RegisterPage.tsx`, `JoinSignInPage.tsx`, `JoinPanel.tsx`,
`join.css`, `READ_ME_FIRST.md`), `src/pages/account/` (`MyEventsPage.tsx`,
`MySeatPage.tsx`, `GuestSignInPage.tsx`, `ForgotPage.tsx`, `ResetPage.tsx`,
`AccountPage.tsx`, `safeNext.ts`, `useGuestSession.ts`, `account.css`,
`READ_ME_FIRST.md`), their unit tests, and `e2e/guest-account.spec.ts`.

Until the backend lands, the frontend builds against the shapes of section 6
with mocked fetch in unit tests; Playwright runs only after both are merged.

### 14.3 After both land (integrator, `docs/` only)

`README.md` (feature, migrate wording), `docs/api.md` and `docs/openapi.json`
(regenerated from the app), `docs/data-model.md`, `docs/security.md` (new
routes in section 4, threats of section 15 below, S13 and S14 for guest
accounts, a new red-team pass), `docs/email.md` (picture, codes, `send_now`),
`docs/runbook.md` section 4, `docs/user-guide-attendee.md`,
`docs/user-guide-organiser.md`, `docs/ux-events.md`, `docs/decisions-log.md`
(D1 to D7), `docs/CHANGELOG.md`, `docs/test-report.md`.

## 15. Threats checked in this design, and open questions

| Threat | Answer in this design |
|---|---|
| The shared link leaks to strangers | They see the map with names as the privacy mode allows, nothing else; they cannot hold seats. The organiser can switch it off or replace it. The settings hint says so. |
| Flood of fake accounts filling the event | No guest row before an emailed code is typed (D1); code limits per network, address and app; 30 joins an hour per event; organiser cap; capacity check after the event lock. |
| Taking over an invited guest by typing their email | Linking needs the code from that inbox (7.3). |
| Finding out who has an account | Sign-up and forgot answer the same 202; login has one failure message and a dummy hash. |
| Guessing a code | 5 tries per code, 3 codes an hour per address, HMAC-hashed codes, 15-minute life. |
| Mixing up guest and organiser sessions | Different token format and signed message (5.2); tests on every route. |
| Names in the picture | The drawing functions never receive a person (9.4). |
| Codes and links in the database | Codes hashed; code emails blanked once finished; account emails carry no secret link. |
| Shared token in platform logs | As S15: accepted, the link is meant to be shared; replace it if needed. |

| A stranger finishing someone else's sign-up | The code works only with the `signup_id` given to the browser that started it (S31). |
| Showing codes on screen in a demo deployment | Only for uninvited `@example.com` addresses, never for resets; such accounts never take an invitation (S30). |
| Removed guests coming back | The removed row keeps the account number; `join` answers `removed` (S35). |

Open questions for the product owner:

1. **Email allowlist (D7).** Today only addresses on `EMAIL_ALLOWLIST` receive
   real email, so in production most guests could never get a code. Keep it
   (accounts only for listed addresses), or add a rule such as
   `EMAIL_ALLOWLIST=*` for real sending? This needs a decision before the
   feature is useful outside the demo.
2. Should visitors (anyone with the link) see occupant names at all, or at
   most first name and initial whatever the event's mode? This spec follows
   default 2 (same as attendees).
3. When the organiser removes a self-registered guest, may that account join
   again through the same link? **Answered by the review (S35): no.** Still
   open: should joins by link need the organiser's approval, or have a
   default cap?
4. Linking an invited guest by their personal link, when they sign up with a
   different address, is not built.
5. The Resend plan's sending limits were not checked against the code
   emails.
