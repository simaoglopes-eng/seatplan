# events_service: read me first

## Purpose

Everything behind the events routers: `routers/events.py` (the organiser,
logged in), `routers/attendee.py` (an attendee with a personal link),
`routers/visitor.py` (anyone with an event's shared link) and
`routers/guest_accounts.py` / `guest_events.py` (a signed-in guest account).
The routers check the request and call one function from here.

## Files, in reading order

| File | One job |
|---|---|
| `schemas.py` | Request bodies (Pydantic, unknown fields refused, lengths capped) |
| `access.py` | Find the event (organiser) or the guest (token hash); deadline rule |
| `problem.py` | Database rows to optimiser dataclasses (`EventProblem`); the current plan |
| `seatmap.py` | The map payload: attendee view (privacy-filtered) and organiser view |
| `seating.py` | Attendee hold, confirm, change and release; the shared seat rules; `lock_event` (one lock order); `drop_assignment(notify=False)` frees a seat without an email |
| `attendee_view.py` | The attendee page, people list, own details, RSVP, "I know them" and privacy: one copy used by the personal link and by guest accounts |
| `mailer.py` | Queue confirmation, change and cancellation emails (outbox). Account holders get the email with the seat picture (`picture_room`, `account_link`) |
| `guests.py` | Organiser guest list: add, change, GDPR erase (`actor` is the organiser's email or `account:<id>`; an erased row keeps its `account_id` so that account cannot rejoin), new link. `guest_dict` adds `source` and `has_account` |
| `share.py` | The shared link: derived token (`derive_token`), `places_left` (seats reserved for a tag are not for newcomers), `room_to_come_back` (a "no" turning "yes"), the visitor map (four states, filtered names), and `join()`, the one step that puts an account on a guest list (answers `removed` for an account the organiser removed) |
| `accounts.py` | Guest accounts: emailed 6-digit codes (stored as keyed hashes, tries counted before the compare), the sign-up id that ties a code to one browser, `may_show_code` (the demo rule), sign-up, sign-in (failed logins per address and network), password reset, my events, account deletion |
| `csv_io.py` | CSV import (validated, all or nothing) and safe CSV export |
| `plans.py` | Plan snapshots: scenarios, `apply_plan`, undo and redo |
| `optimise.py` | Auto-fill, re-plan, compare, what-if (calls the optimiser) |
| `recommend.py` | Seat recommendations for one attendee: only their own list counts, rank and label instead of the raw gain |
| `exact_check.py` | Heuristic versus proven optimum on one or two tables |
| `chart.py` | Print data: seating chart per table and place cards |

## Data flow: an attendee picks a seat

```
GET  /a/{token}           rate_limit -> load_guest (hash) -> attendee_map (privacy)
POST /a/{token}/hold      seat rules -> lock_event -> take_hold (UNIQUE on holds) -> 409 seat_taken
POST /a/{token}/confirm   lock_event -> confirm_hold -> insert or update seat_assignments
                          -> flush (UNIQUE) -> 409 ; audit + outbox email -> one commit
```

## Data flow: someone joins with the shared link

```
GET  /j/{token}            rate_limit -> hash lookup + derive check -> visitor_map (no people list)
POST /j/{token}/register   link + deadline -> code limits -> pending row in email_codes
                           (password already scrypt, keyed hash of a new signup_id)
                           -> outbox "account_code" -> send_now (same claim as the cron)
                           -> 202 with signup_id (and demo_code only per may_show_code)
POST /guest/verify         signup_id matches? -> count the try, then compare the code
                           -> share-join limit -> account row
                           -> join(): lock_event, re-check, places_left, guest row -> one commit
```

Nothing that counts against the event is written before the code is typed,
so made-up addresses cannot fill an event, and linking to an invited guest
with the same address is safe: the inbox was proven, the code works only in
the browser that started the sign-up, and an account whose code was shown on
screen (demo) is never linked.

## Data flow: the organiser auto-fills

```
POST /events/{eid}/optimise/autofill   rows -> EventProblem (human choices fixed) -> solve()
                                       -> stored as a "scenario" snapshot, map unchanged
POST /events/{eid}/scenarios/{sid}/apply
                                       apply_plan: keep every "self"/"organiser" seat as it is
                                       NOW, write the rest, report conflicts -> history snapshot
                                       (a guest whose planned seat cannot be written keeps
                                       the seat they have: never deleted without a replacement)
POST /events/{eid}/undo | /redo        move along the history snapshots, never touching "self"
```

## Three likely walkthrough questions

**How do you make sure another attendee never sees my email or dietary note?**
The attendee payload is built field by field in `seatmap.attendee_map`,
`attendee.people` and `recommend._describe`. None of them reads those columns,
and every name goes through `core/privacy.display_name`. The privacy tests
turn the whole answer into text and check that the forbidden values are not in
it, in all three privacy modes.

**What happens if a guest picks a seat while the organiser applies a plan?**
`apply_plan` reads the current seats first and keeps every seat a person chose,
reporting the planned move as a conflict instead. If the guest's confirm lands
between our read and our commit, the UNIQUE constraint refuses one of the two
writes and the loser gets 409, so a seat is never given twice.

**Why can a wrong link not tell me whether a link once existed?**
`access.load_guest` looks the token up by its SHA-256 hash and answers the same
404 with the same message for a wrong token, an old token replaced by a new
link, and a revoked one. Attempts are also rate limited per address.

**Two people join for the last place at the same moment. Who gets it?**
`share.join` takes `lock_event` first, then reads the event again and counts
the places left. The second request waits at the lock until the first commits,
then counts the new guest and answers `event_full`.
`test_two_visitors_race_for_the_last_place` runs two threads to prove it.

**Why does every seat write start with `lock_event`?**
It bumps the event's row in `live_versions` before touching anything else.
Postgres lets only one open transaction change a row, so a second writer on
the same event waits at that first step until the first one commits. With
everyone taking the same lock first, two transactions can never each hold a
lock the other one needs (a deadlock). If Postgres still gives up on one,
`main.py` answers 409 "please try again" instead of a 500, on every route. The same
lock makes two auto-fills at once save different scenario numbers.
