# SeatPlan for organisers

This guide follows one event from start to finish. Every step is also an API
call (in brackets), so the frontend and the tests use exactly the same steps.

## 1. Create the event

Draw the room first in the floor-plan editor (tables, seats, accessible seats,
blocked seats, seats reserved for `vip`, `family` or `speaker` guests). Then
create the event with a name, start and end time, a privacy mode and an
optional change deadline (`POST /api/events`).

Privacy modes decide what guests see of each other: `full_name`,
`first_initial` ("Ana S.") or `anonymous` ("Guest"). You always see real names.

## 2. Add guests

- One by one (`POST /api/events/{eid}/guests`): name, email, group, needs an
  accessible seat, dietary note, reserved tag.
- From a spreadsheet (`POST /api/events/{eid}/guests/import`): save it as CSV
  (UTF-8) with a first line naming the columns. Allowed columns: `name`
  (required), `email`, `group`, `keep_adjacent`, `needs_accessible`,
  `dietary_note`, `reserved_tag`, `wants_anonymous`. Yes/no columns accept
  yes, no, true, false, 1 or 0. Up to 1000 guests and 200 KB.

If any line is wrong, nothing is imported and you get a list such as
"line 4: email: value is not a valid email address". Fix those lines and import
the whole file again.

Each new guest gets a personal link, shown once. Send it to them. If a guest
loses it, use **New link** (`POST .../guests/{gid}/new-link`); the old link
stops working immediately.

Groups: guests with the same group name belong together. A group created with
`keep_adjacent` asks to sit side by side (families); other groups only like
sharing a table (friends, colleagues).

## 3. Watch guests choose

The event page (`GET /api/events/{eid}`) shows the live map with real names,
who chose their own seat, and the list of guests who have **not chosen yet**.

You can place or move anyone yourself (`PUT .../assignments/{gid}`) or take
them off their seat (`DELETE` same path). The hard rules still apply: you
cannot put a guest on a blocked seat, on a reserved seat without the matching
tag, or a guest who needs an accessible seat on a seat that is not.

## 4. Auto-fill the rest

**Auto-fill** (`POST .../optimise/autofill`) proposes seats for everyone who
has not chosen, around the seats people already chose. It never moves a guest
who chose their own seat or a guest you placed. The same seed always gives the
same proposal; try another seed for an alternative.

A proposal is a **scenario**: nothing changes until you apply it. You can list
scenarios, compare two of them (score per term and how many guests differ), and
try single moves with **What if** (`POST .../whatif`) before deciding.

**Apply** (`POST .../scenarios/{sid}/apply`) writes the scenario. If a guest
picked a seat in the meantime, their choice wins: the answer lists every
planned seat that could not be used and why.

## 5. Something changed

After a cancellation or a late guest, use **Re-plan** (`POST .../optimise/replan`).
It starts from the current plan and pays a penalty for every guest it moves, so
it fills the gaps while moving as few people as possible. The scenario shows
who would move.

**Undo** and **Redo** (`POST .../undo`, `POST .../redo`) step through your own
changes (moves and applied scenarios). They never undo a seat a guest chose.
If you had moved a guest away from a seat they chose themselves, Undo gives
them their own seat back. Undo never leaves a guest without a seat because
their old seat is gone: if it was taken in the meantime, the guest keeps the
seat they have now and the answer lists that as a conflict.

## 6. How good is the plan?

**Exact check** (`POST .../optimise/exact-check`) takes one or two tables (at
most 16 seats), solves that piece perfectly and compares it with the normal
optimiser: how many guests each one seats, heuristic score, optimal score,
the gap in percent, and how long each took. The perfect plan first seats as
many guests as possible, so when the normal optimiser seats fewer guests there
is no gap in percent (comparing points would be unfair); a short note says how
many guests it left out instead.

## 7. On the day

- **Chart** (`GET .../chart`): every table with who sits where, place cards
  (name, table, seat) and the list of guests without a seat.
- **Export** (`GET .../export.csv`): the guest list with table and seat.

## 8. Removing a guest (privacy request)

**Delete** (`DELETE .../guests/{gid}`) erases the guest's name, email, dietary
note and other personal data, frees their seat and revokes their link. This
cannot be undone. The audit log keeps only the guest's number. Emails to the
guest are wiped too: address, text and calendar invite are blanked in the email
log, anything not sent yet is never sent, and no "seat released" email goes out.

If the guest had joined with the shared link (section 9), removing them also
stops their account from joining that event again with the link.

## 9. The shared link (optional)

Instead of, or as well as, personal links you can post one link for the whole
event. Open the event, tab **Settings**, card **Shared link**.

- Tick **Allow people to join with the shared link**. Existing events start
  with it off; the demo events have it on.
- **Copy link** copies `https://.../j/...`. Anyone with it sees the seat map,
  with names shown as your privacy setting allows, and cannot hold a seat.
  To choose one they create an account with an email address they prove with
  a code. Your invited guests keep their personal links; one who makes an
  account with the same address is linked to their invitation, not added
  twice.
- **Make a new link** (asks first) stops the old link at once; people who
  already joined keep their places. Switching the link off and on again keeps
  the same link, so use "Make a new link" if a copy went somewhere it should
  not.
- **Most people who may join with this link** sets a cap; leave it empty to
  allow up to the free seats. The line under it says how many joined, how
  many places are left and how many guests and seats there are. Seats you
  reserved for a tag are never counted as places for newcomers.
- In the **Guests** tab, people who joined this way show "Joined with link",
  and anyone with an account shows "Has an account". Seat them, move them
  and remove them as any other guest. When you move someone with an account
  (by hand or by applying a plan), they get an email with their new seat and
  a picture of the room.
- On a real deployment the codes go out only to addresses allowed by
  `EMAIL_ALLOWLIST` (an open question for the team, `docs/guest-accounts.md`
  section 15).
