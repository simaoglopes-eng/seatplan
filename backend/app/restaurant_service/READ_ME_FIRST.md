# restaurant_service: read me first

## Purpose

owner_accounts.py handles owner sign-up with purpose owner in email_codes.
Codes are bound to a browser signup id and consumed under a write lock.
Existing accounts receive the same registration response shape, and only the
approved demo conditions expose a code. Owner accounts reuse organiser login.
venue_access limits staff to demo restaurants and owners to their restaurants.
The shared venues router enforces the same rule for restaurants while keeping
event access unchanged.

owner_view.py builds private owner cards and setup progress. It reads image
metadata without loading image bytes. Publication validation remains the
server's responsibility, independently of the progress indicator.

publishing.py checks and flips a restaurant between draft and published: `problems` (identity, location,
hours, a table, no room-editor errors, north where there are windows, each with a fix link), `review` (the
read-only checklist with the photo tip), `publish` (all or nothing, idempotent) and `unpublish`. features.py
works out sun / view / accessible / terrace from the saved rooms and refreshes them on every room save and on
publish. venue_access.load_published is what diner routes use: a draft looks like a restaurant that does not exist.
rooms.py saves the owner's whole room layout (rooms, zones, tables, chairs, openings,
fixed items) in one transaction behind `PUT /owner/restaurants/{vid}/rooms`: the version
moves first with an atomic compare (409 `stale_layout`), objects are upserted by id or key,
what is missing is deleted, chair neighbours are rebuilt, and a table with bookings, a live
hold or a chosen chair is protected (409 with the tables, "make it unavailable instead").
`view` shows a restaurant without rooms as one implicit "Main room".
room_rules.py checks structural opening references/spans, non-overlap, full-side
glass and view tags, and normalizes winding without moving openings (straight
or curved). Opening clocks are bounded HH:MM by the router. Geometric problems
and room area outside 4–5000 m² remain draft errors, not structural save failures.
occupancy.table_specs scopes combine groups by room; no pure optimiser change
is needed. Holding retains the half-of-tables cap with a minimum of one.
publishing.recheck_after_edit atomically puts an explicitly published venue
back in draft after an invalid room/profile/schedule edit, keeping bookings.
Legacy default-published venues keep their old path until explicit publication.
published_at keeps slugs fixed even after unpublish. Room answers include status
so the editor can explain when new bookings were closed.
profiles.py creates owner-only restaurant drafts and loads/patches their profile.
Slugs use ASCII transliteration and a unique database index; concurrent insert
collisions retry in savepoints, with a bounded number of actual races. Published
links cannot change. The owner router validates PlainText, cuisine choices,
coordinate pairs, timezone and contact links, rejecting unknown fields. Profile
reads/updates match owner id, restaurant kind and public id before returning data.

photos.py stores at most 800000 decoded bytes per photo. It identifies JPEG,
PNG and WebP by their actual headers, reads bounded dimensions (1–1600 px),
and uses no decoder dependency. Header validation is not a full pixel decode.
Uploads serialize on the venue row so concurrent count/cover decisions hold.
Gallery cap is ten, view cap one per saved window/glass wall. Canonical saved
opening keys are o<id> (numeric ids also accepted). Room persistence must use
that key or update this resolver when it is introduced in task 17.
Listing defers bytes. Order includes every gallery photo exactly once and
selects a cover. Deleting a cover selects the first remaining photo. Draft
bytes require the owner and use private/no-store; published bytes are immutable
public URLs. Old public caches cannot be revoked when a venue is unpublished.
WebP header reference: https://developers.google.com/speed/webp/docs/riff_container .

The database side of the restaurants vertical. The three routers
(`routers/restaurants.py` for diners, `routers/bookings.py` for manage links
and the waitlist, `routers/staff.py` for staff) only check the request and
call one function from here. The pure optimiser (`optimiser/restaurant_*.py`)
never touches the database; this package turns rows into its dataclasses.

## Files, in reading order

| File | One job |
|---|---|
| `clock.py` | Local time zone, 15-minute slots (slot 76 = 19:00), slot to UTC moment |
| `schedule.py` | Service periods, seating times, turn times, blackout dates, `check_bookable` |
| `occupancy.py` | Rows to `TableSpec`; "busy" maps from `table_slots` and live holds |
| `availability.py` | `PartyNeeds` (with ambience `prefs`, checked by `clean_prefs`), the covers cap (locked, see below), `max_party`, available / limited / full per seating time |
| `ambience_view.py` | Saved rooms and tables -> the ambience engine -> sun patches, light and sentences per table (spec 7.6). Read-only, no photo bytes, no personal data |
| `map_view.py` | The diner map: state of every table plus the recommended tables, and (new) the rooms with sun patches and each table's `ambience`. Tables the owner switched off (`is_active` false) are never sent |
| `holding.py` | 5-minute table holds: one `holds` row per table per slot; caps per client and per slot; release |
| `booking_caps.py` | Fair caps on diner bookings: upcoming bookings per email, bookings per address per day (S8) |
| `chosen_seat.py` | The diner's optional chair (spec 9.4): `check_chosen_seat` (422 unless a usable chair at one of the booking's tables), `keep_seat_if_still_valid` (a change that moves the booking drops a chair that is no longer there), `seat_payload` (with the "Facing the window" sentence only when asked) |
| `booking_rows.py` | Write and release `table_slots`, load by manage token, describe a booking |
| `diner_flow.py` | Hold a table, then confirm the booking |
| `manage_flow.py` | Change or cancel a booking |
| `waitlist.py` | Join, position, estimated wait, offer a freed table |
| `alternatives.py` | The 409 answer with the nearest free times and tables |
| `emails.py` | Every restaurant email, queued through `mail/outbox.enqueue` |
| `changes.py` | `record_change`: bump the live scope and write the audit log |
| `staff_floor.py` | Live floor, walk-ins, status changes, moving bookings |
| `whatif.py` | Walk-in what-if with the optimiser's `whatif_walkin` |
| `service_plan.py` | Re-plan a service (`assign_service`, preview then apply) and the exact check (`assign_exact`) |
| `dashboard.py` | Covers, utilisation, no-show rate, overbooking suggestion |
| `schedule_edit.py` | Read and replace the schedule |
| `venue_access.py` | Find the restaurant in the URL (diner and staff rules) |

## Data flow of one booking

```
POST /r/{vid}/hold      check_bookable -> check_covers_cap -> recommend_table
                        -> check_hold_caps -> hold_tables (holds rows, 5 min) -> bump + audit
DELETE /r/{vid}/hold/{hold_id}  delete the hold rows -> bump + audit
POST /r/{vid}/bookings  read_hold -> check_booking_caps -> lock the service row -> fit and covers cap checked again -> consume holds
                        -> Booking + ALL table_slots rows -> emails -> one commit
PATCH /b/{token}        release old slots -> write new slots -> one commit
DELETE /b/{token}       release slots -> cancellation email -> waitlist offer
```

## Likely walkthrough questions

**How can two diners never get the same table at the same time?**
Every booking writes one `table_slots` row per table per 15-minute slot, and
the primary key `(table_id, date, slot_index)` refuses a second row for the
same table and slot. `booking_rows.write_slots` flushes inside a `try` and
turns the refusal into HTTP 409 with alternatives. The holds in front of it
are only a courtesy. `tests/test_restaurant_booking_flow.py` fires 20 threads
at one table and checks exactly one booking wins.

**Why are holds stored per slot instead of once per booking?**
A hold for 19:00-20:30 and a hold for 19:45-21:15 on the same table must
clash. With one row per slot both want the rows for 19:45 to 20:30, so the
`holds` UNIQUE constraint refuses the second. Everyone takes slots in the same
order, so for the same table and time the very first slot decides.

**How can the covers cap hold when two diners confirm at the same moment?**
The cap is "count the guests arriving, then insert". Before counting,
`availability._lock_period` updates the service period row to the value it
already has. That is enough for the database to lock the row until our
commit: a second confirm waits there, and counts only after the first booking
is saved. `test_covers_cap_holds_under_concurrent_confirms` slows the count
down on purpose and fires three confirms at once against a cap of 4.

**Where does the time zone come in?**
Only in `clock.py`. A diner says "19:00 on Friday"; we combine that with the
restaurant's time zone and store UTC. Slots follow the local wall clock, so
19:00 is always slot 76, also on the night the clocks change.
