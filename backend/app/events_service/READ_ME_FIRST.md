# events_service: read me first

## Purpose

Everything behind the two events routers: `routers/events.py` (the organiser,
logged in) and `routers/attendee.py` (an attendee with a personal link). The
routers check the request and call one function from here.

## Files, in reading order

| File | One job |
|---|---|
| `schemas.py` | Request bodies (Pydantic, unknown fields refused, lengths capped) |
| `access.py` | Find the event (organiser) or the guest (token hash); deadline rule |
| `problem.py` | Database rows to optimiser dataclasses (`EventProblem`); the current plan |
| `seatmap.py` | The map payload: attendee view (privacy-filtered) and organiser view |
| `seating.py` | Attendee hold, confirm, change and release; the shared seat rules; `lock_event` (one lock order) |
| `mailer.py` | Queue confirmation, change and cancellation emails (outbox) |
| `guests.py` | Organiser guest list: add, change, GDPR erase, new link |
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

**Why does every seat write start with `lock_event`?**
It bumps the event's row in `live_versions` before touching anything else.
Postgres lets only one open transaction change a row, so a second writer on
the same event waits at that first step until the first one commits. With
everyone taking the same lock first, two transactions can never each hold a
lock the other one needs (a deadlock). If Postgres still gives up on one,
`main.py` answers 409 "please try again" instead of a 500, on every route. The same
lock makes two auto-fills at once save different scenario numbers.
