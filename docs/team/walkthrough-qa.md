# Walkthrough questions and model answers

How to use this file: read the question, close the file, answer out loud in
your own words, then check. The answers are short on purpose. Always open the
file and point at the lines while you talk: "here, line 54, we delete the
expired hold first".

Line numbers were checked on 2026-11-10. If someone edits a file, check the
numbers again (search for the function name).

Owners follow `docs/team/tasks.md`. The first section is for everyone.

---

## Everyone: the five questions any of us may get

**E1. Why can two people never book the same seat or table?**
Because the database refuses it, not our Python code. There are UNIQUE rules:
`seat_assignments` has UNIQUE(event_id, seat_id) and UNIQUE(event_id, guest_id)
(`backend/app/models.py` lines 290 to 304), `table_slots` has the primary key
(table_id, date, slot_index) (lines 378 to 388), and `holds` has
UNIQUE(scope, resource_kind, resource_id, slot_key) (lines 161 to 180). We just
try the INSERT. If a row with the same key is already there, the database
raises an error, we catch it as `IntegrityError` and answer 409 "seat taken"
(`core/holds.py` lines 112 to 124).

**E2. Why not just check "is it free?" and then insert?**
Between our check and our insert, another request can do the same check and
also see "free". On Vercel the two requests may even run on two different
machines, so no Python lock can see both. Only the database sees every
insert, so only a database rule closes that gap. The checks we do have
(for example `_owned_by_other` in `events_service/seating.py` lines 59 to 61)
are only there to give a nicer message earlier.

**E3. What happens when two people click the same seat at the same moment?**
Both requests reach `take_hold` (`core/holds.py` lines 36 to 70). Both try to
INSERT a hold row with the same scope, resource and slot. The database lets
the first one in and the second insert breaks the UNIQUE rule, so that
request rolls back and gets 409 `seat_taken` with "Seat ... was just taken by
someone else". We test this with 30 threads at once:
`backend/tests/test_holds.py` line 209 (`test_thirty_threads_race_for_one_hold`)
expects exactly 1 "held" and 29 "seat_taken". If you delete the UNIQUE rule,
that test fails.

**E4. How does a hold expire? Is there a timer on the server?**
No timer and no background job. A hold is a row with
`expires_at = now + 5 minutes` (`core/holds.py` line 21 and line 62). Three
things make it "expire":
1. Every reader ignores old rows: the maps only count holds with
   `expires_at > now` (`events_service/seatmap.py` line 70,
   `restaurant_service/occupancy.py` line 85).
2. When someone else wants the same seat, `take_hold` first deletes expired
   holds on it (line 54), in the same transaction, then inserts its own.
3. Confirming checks the time again: `confirm_hold` raises `HoldExpired`
   (409 `hold_expired`) when `expires_at <= now` (lines 104 to 108).
In the browser a countdown shows the minutes left; that is only a display.

**E5. Why is the optimiser result repeatable?**
All randomness comes from one `random.Random(seed)` that we create once and
pass down (`optimiser/events_anneal.py` line 200, `restaurant_assign.py`
line 306). We always loop over seats and guests in sorted order, so the
random calls happen in the same order. And we stop after a fixed number of
iterations, not after a number of seconds, so a faster laptop does not do more
work. The time limit (15 s) is only a safety stop. Same problem plus same seed
gives the same plan; tests check it, for example
`tests/test_optimiser_events_search.py` line 174 and
`tests/test_optimiser_restaurant_assign.py` line 112.

---

## Simao (events: attendee side, live updates, email, platform)

**S1. Walk me through what happens when an attendee clicks "Hold this seat
for 5 minutes".**
The browser calls `POST /a/{token}/hold` (`routers/attendee.py`, `hold`, line
202). That calls `hold_seat` in `events_service/seating.py` lines 69 to 98. It
checks the change deadline and that the guest said yes, checks the seat rules
with `seat_for_guest` (lines 48 to 56), takes the event lock, refuses if the
seat already belongs to someone else, deletes this guest's other holds (one
seat at a time), writes an audit row, and finally calls `take_hold`, which
inserts the hold and commits all of it together.

**S2. What does `lock_event` do and why is it the first write?**
`seating.py` lines 30 to 38. It adds one to the event's row in `live_versions`.
On Postgres, only one open transaction can update a given row, so a second
writer on the same event waits at this line. Because every write on an event
starts with this same step, two transactions never each hold one lock and wait
for the other's (a deadlock). Bonus: the same update tells open maps "something
changed" when we commit.

**S3. And if Postgres still detects a deadlock?**
`backend/app/main.py` line 58 lists the codes `40P01` (deadlock) and `40001`
(serialization failure). `_database_error` (lines 94 to 99) turns them into
409 `conflict` "please try again". Nothing was saved, because the transaction
was rolled back.

**S4. How does `confirm_seat` make the hold and the seat happen together?**
`seating.py` lines 101 to 134. `confirm_hold` deletes the hold but does not
commit. Then we insert or update the guest's `SeatAssignment` row and call
`flush_or_seat_taken` (lines 236 to 247), which sends it to the database
straight away so the UNIQUE rules decide there. Then audit, email, and one
final `commit_or_seat_taken`. One commit means "hold gone" and "seat owned"
happen together or not at all.

**S5. A guest changes seat. Is there a moment with two seats or none?**
No. We update the same row (`row.seat_id = seat.id`, line 127) instead of
deleting and inserting, inside one transaction. The old seat is free and the
new one taken at the same commit. UNIQUE(event_id, guest_id) also makes two
rows for one guest impossible.

**S6. How do live updates work?**
Each scope (one event, or one restaurant day) has a version number in
`live_versions`. Every write calls `live.bump` (`core/live.py` lines 57 to
66), in the same transaction, so a rolled-back write never announces itself.
The browser opens `GET /live/{scope}/stream`; the server checks the version
every second and sends an event when it changes, for about 25 seconds
(lines 37 to 38, 87 to 107), then closes. The browser reconnects. Only the
number travels; the page then fetches the real data again.

**S7. Why not WebSockets?**
Vercel functions are short-lived and do not share memory, so a long-lived
socket does not fit. A 25-second stream plus a version number in the database
works across many instances. If the stream fails, `useLive.ts` polls
`/version` every 2 seconds (`POLL_INTERVAL_MS`, line 16; `startPolling`, lines
38 to 54). We have not checked on a real Vercel deployment whether it buffers
the stream; the README says so.

**S8. What stops someone from opening thousands of streams?**
`core/live.py` lines 41 to 44: at most 30 stream opens per address per minute
(through the database rate limit) and at most 50 open streams per instance.
Past that we answer 429 and the browser falls back to polling.

**S9. How do you hide names from other attendees?**
`core/privacy.py`, `display_name` (lines 12 to 29). Three modes: full name,
first name plus last initial ("Ana S."), or "Guest". A guest who asked to be
anonymous is always "Guest". Every name an attendee sees passes through this
function. Email, dietary notes and accessibility needs are never sent to
other attendees at all.

**S10. Recommendations say "Next to 2 people you know". Could they reveal who
listed me?**
No. `events_service/recommend.py`, `only_my_own_list` (lines 53 to 56) removes
everyone else's "I know them" marks on me before ranking, so only my own list
counts. We also send `rank` and a coarse `match` ("strong", "some", "none",
lines 59 to 66), never the raw score, because a number could leak that
someone else listed me.

**S11. How are emails sent without slowing down a booking?**
A request never sends email. It only adds a row to `email_outbox`. A GitHub
Actions job (`.github/workflows/email-cron.yml`, every 15 minutes) calls
`POST /api/internal/email/process`, which sends due rows. The
`idempotency_key` column is unique (`models.py` line 186), so the same email
cannot be queued twice. To stop two processors sending the same row, `_claim`
in `mail/outbox.py` (lines 102 to 119) uses one conditional UPDATE: only one of
them changes the row, the other changes 0 rows and skips it.

**S12. Could a real person get an email from the demo by mistake?**
No. `EMAIL_ALLOWLIST` decides who may receive email; everyone else is logged as
`skipped`, and an empty list means nobody (`README.md`, environment
variables). The rule applies to every provider, even the console one
(decisions log, email system, item 2). All demo addresses end in
`@example.com`.

**S13. What does the floor-plan editor save, and how do you know who sits
next to whom?**
`PUT /venues/{id}/layout` saves zones, tables and seats (`core/layout.py`,
`save_layout`, line 125). After saving it rebuilds `seat_neighbours`
(`rebuild_neighbours`, lines 99 to 123), using the table shape: around a round
table, along a row, or along the sides of a rectangle (`core/neighbours.py`,
`neighbour_pairs`, line 68). The events optimiser uses those pairs for "next
to".

**S14. Why does the app refuse to start on Postgres without `SECRET_KEY`?**
The key signs login sessions. With a random key per instance, each Vercel
instance would reject the others' sessions and people would be logged out at
random. So `config.py` requires it whenever the database is Postgres (decisions
log, platform fixes, item 3).

---

## Federico (events: organiser side, events optimiser)

**F1. What does the events optimiser try to maximise?**
Points for pairs of people. `optimiser/events_score.py`: a pair counts if the
two know each other (either one listed the other) or share a group
(`build_relations`, lines 63 to 74). `pair_points` (lines 89 to 101) gives
points when they sit next to each other or at the same table. The weights are
in `events_model.py` lines 37 to 43: friend next to friend 10, friend at same
table 4, group next to group 15 (only for groups that asked to sit together),
group at same table 6. The total is the sum over all pairs.

**F2. Why can two friends side by side earn both "adjacent" and "same table"
points?**
On purpose: the terms are independent (comment at lines 94 to 95). Sitting
next to someone is better than only sharing the table, so 10 plus 4 is more
than 4.

**F3. What are the hard rules, and where are they enforced?**
One guest per seat, blocked seats unused, a reserved seat only for a guest
with the same tag, an accessible-needs guest only on an accessible seat, and
human choices (`fixed`) never moved. The per-seat rules are `seat_allows`
(`events_model.py` lines 108 to 120); the whole-plan check is `check_hard`
(line 130). Every search move checks `seat_allows` before it is even proposed,
so the search never visits an illegal plan.

**F4. How does the greedy start work?**
`events_greedy.py`. `placement_order` (lines 40 to 65) seats the hardest
guests first: reserved tag, then accessibility, then big groups, with group
members next to each other in the queue. `best_seat` (lines 68 to 91) puts
each guest on the free allowed seat that adds the most points right now, and
keeps accessible seats for people who need them. If no seat is free,
`make_room` (lines 106 to 125) tries moving one non-fixed guest to an empty
seat.

**F5. Explain simulated annealing in our code.**
`events_anneal.py`, `run_anneal` lines 77 to 113. Each step picks a random
movable guest and a random seat: move there if empty, or swap with the guest
there (`propose_move`, lines 116 to 139). If the score goes up we keep it. If
it goes down we still keep it with probability `exp(delta / temperature)`. The
temperature starts at 10 and falls to 0.05 (lines 36 to 37), so early on we
explore and at the end we only accept improvements. We remember the best plan
seen and return that.

**F6. Isn't rescoring the whole plan at every step slow?**
We do not rescore everything. `try_move` (lines 142 to 160) only measures the
pairs that touch the one or two moved guests, before and after
(`touching_value`, `events_score.py` lines 201 to 220). The difference is the
exact change in the total, because no other pair changed.

**F7. Why is the result the same every time?**
One `random.Random(seed)` is created in `solve` (`events_anneal.py` line
200) and used for both greedy and annealing. Seats and guests are sorted
before any random choice. The loop stops at `max_iterations` (default 20000),
not at a time; the 15 s limit (line 44) is only a safety stop. Tests:
`test_optimiser_events_search.py` lines 87 and 174, and the hypothesis property
test in `test_optimiser_events_properties.py` line 109.

**F8. How do you make sure auto-fill never moves a guest who chose a seat?**
`events_service/problem.py`, `human_fixed` (lines 63 to 70), passes every
seat with source `self` or `organiser` as `fixed`. Annealing only moves guests
not in `fixed` (`movable`, `events_anneal.py` line 87) and refuses to swap
with a fixed guest (line 135). Applying a scenario later still protects them:
`plans.py`, `apply_plan` (lines 167 to 200) never overwrites a protected row
and reports a conflict instead.

**F9. What is re-plan and how does it keep changes small?**
`events_replan.py`. It starts from the previous plan where still valid
(`keep_valid_seats`, lines 52 to 68), fills the gaps greedily, then anneals
with a penalty of 8 points for every guest whose seat differs
(`change_penalty`). So a move must earn more than 8 points to be worth it.

**F10. What is the exact check, and why only 16 seats?**
`events_exact.py`, `solve_exact` (lines 47 to 71) finds the proven best plan,
with OR-tools CP-SAT if installed, else our own branch and bound. It first
seats as many guests as possible, then maximises points. The search grows very
fast with size, so `events_service/exact_check.py` allows at most 16 seats
(line 25) and 10 s (line 27). On 2026-11-10 the gap report
(`python -m scripts.gap_report_events`) gave a 0.0 % gap on 20 of 21 small
instances and 3.7 % on one.

**F11. On Vercel, does the exact check use CP-SAT?**
No. `ortools` is only in `backend/requirements-dev.txt`, not in the root
`requirements.txt` that Vercel installs, so it falls back to branch and bound
(`events_exact.py` lines 51 to 52). Both give the same optimum; the gap report
checks that they agree.

**F12. What does Apply do if a guest picked a seat after the preview?**
Their choice wins. `apply_plan` reads the current rows under the event lock,
keeps every protected row, and lists each planned seat that could not be used
with a reason (`CHANGED_SINCE`, `STILL_SEATED`, `plans.py` lines 27 to 28).

**F13. How do undo and redo work?**
Every organiser change saves a "history" snapshot (`plans.py`, `push_history`,
lines 234 to 243). Undo and redo step to the previous or next snapshot and
apply it with `protected={"self"}` (`step_history`, lines 246 to 257), so a
seat a guest chose themselves is never undone. `plan_snapshots` has
UNIQUE(event_id, seq) (`models.py` line 310), so two saves at once cannot get
the same number.

**F14. How does the CSV import avoid half an import?**
`events_service/csv_io.py` checks every row first (`validate_rows`, line 118).
If any row is wrong, nothing is saved and the answer lists `{line, message}`
for each bad row. Limits: 200 KB and 1000 rows (lines 25 to 26). The CSV is
the raw request body because form uploads would need an extra library.

---

## Sergio (restaurants: diner side, database and security)

**G1. Walk me through a diner booking, from map to confirmation.**
Hold: `POST /r/{vid}/hold` (`routers/restaurants.py`, `hold`, line 142) calls
`take_table_hold` (`restaurant_service/diner_flow.py` lines 84 to 115): check
the time is bookable, check the covers cap, work out the stay window, pick the
tables (the diner's, or the optimiser's top 3), and hold every slot. Confirm:
`POST /r/{vid}/bookings` calls `confirm_booking` (lines 130 to 171): check the
hold still fits, consume it, insert the booking and all its `table_slots`
rows, queue the email, commit once.

**G2. Why is a table hold one row per 15-minute slot?**
`restaurant_service/holding.py`, comment lines 3 to 5. If a hold were one row
per booking, a hold for 19:00 to 21:00 and another for 20:00 to 22:00 on the
same table would have different keys and both succeed. With one row per slot
both want slot 80 (20:00), so the UNIQUE rule catches the clash. Test:
`tests/test_restaurant_booking_flow.py` line 128.

**G3. A party needs two tables. What if we get the first and someone else
gets the second?**
`hold_tables` (`holding.py` lines 123 to 160) is all or nothing. Everyone takes
slots in the same order (table id, then slot), and if any slot is taken we
give back the ones we already got (`_release_all`) and raise `SeatTaken`.

**G4. What makes a double booking impossible after the hold?**
`table_slots` has the primary key (table_id, date, slot_index)
(`models.py` lines 378 to 388). `write_slots` (`booking_rows.py` lines 25 to
46) inserts one row per table per slot and flushes at once, so a clash raises
`SeatTaken` right there. Test: 20 threads book the same table and exactly one
wins (`test_restaurant_booking_flow.py` line 188).

**G5. What is the covers cap, and what stops two bookings both slipping under
it?**
It limits how many guests may arrive at one seating time, so the kitchen is
not asked to start too many meals at once. `check_covers_cap`
(`availability.py` lines 98 to 118) first calls `_lock_period` (lines 81 to
95), an UPDATE of the service row to the value it already has. That locks the
row, so a second booking waits until the first commits and then sees its
guests. Test: `test_covers_cap_holds_under_concurrent_confirms`, line 303.

**G6. Holds need no login. What stops one person holding every table?**
Two caps in `check_hold_caps` (`holding.py` lines 80 to 105): at most 3 live
holds per client per date, and holds may never cover more than half the tables
of a slot. Both answer 429. They are soft limits; double booking is still
blocked by the UNIQUE rules, not by these caps.

**G7. You recognise "the same client" by IP address. Do you store IPs?**
No. `client_key` (`holding.py` lines 55 to 64) stores a keyed hash (HMAC with
`SECRET_KEY`) of the address, cut to 16 characters. A plain SHA-256 of an IPv4
address could be reversed by trying all 4 billion addresses; the key stops
that.

**G8. How is the manage link kept secret?**
`security.py`: `new_token` makes 32 random bytes with `secrets` (line 62), and
we store only `hash_token`, a SHA-256 of it (lines 65 to 68). The raw token is
in the confirmation answer and the email only. A database leak would reveal no
links. A wrong token gives 404, same as an unknown one.

**G9. Why SHA-256 for tokens but scrypt for passwords?**
A token is 32 random bytes, so nobody can guess it, and a fast hash is enough.
Passwords are chosen by people and can be guessed, so we use scrypt, which is
slow on purpose (`security.py` lines 24 to 26 and `hash_password`, line 36).

**G10. How does login work without storing sessions in the database?**
`create_session_token` (`security.py` lines 83 to 92) builds
"user id.expiry.signature", where the signature is an HMAC with `SECRET_KEY`.
`verify_session_token` (lines 95 to 107) recomputes the signature and checks
the expiry (12 hours, line 27). Nobody can change the user id without the key.

**G11. How does the rate limit work across serverless instances?**
The counter is a row in the `rate_limits` table, not in memory
(`security.py`, `rate_limit`, lines 149 to 178). It counts per calendar
minute. Weak spot we know: a burst across a minute boundary can pass up to
twice the limit; the docstring says so.

**G12. The diner changes the time. What happens to the table and the
reminder?**
`manage_flow.py`, `change_booking` (lines 66 to 102): check the cap for the new
time (ignoring this booking), pick tables, drop the old reminder, release the
old slots, write the new ones, queue a "changed" email, commit once. If the
table changed, `table_choice` becomes `auto`, because the optimiser chose it.

**G13. What does a diner see when someone was faster?**
A 409 with alternatives inside the error: nearest free times and other free
tables (`restaurant_service/alternatives.py`, `conflict_response`, line 61;
decisions log, restaurants vertical API, item 5). The page sends them back to
the map with their details kept.

**G14. How is the waitlist wait estimated?**
`waitlist.py`, `estimate_wait` (lines 33 to 46): k = number of tables or
combinations that fit the party, T = their average turn time, position p.
Wait = p x T / k, rounded up to the next 5 minutes. It is an estimate, not a
promise.

---

## Martim (restaurants: staff side, restaurant optimiser, seat map, CI)

**M1. How does the restaurant optimiser score a plan?**
`restaurant_model.py`, `ScoreBreakdown.key` (lines 77 to 84) returns a tuple
`(covers seated, minus wasted seats, zone wishes met)`. Python compares tuples
left to right, so more covers always wins; only on a tie do fewer wasted seats
count; only then zone wishes. No weights to tune.

**M2. Which tables can a party use?**
`candidate_choices` (lines 196 to 206) lists every single table and every
combination of up to 3 (`MAX_COMBINED_TABLES`, line 21) that passes
`choice_problem` (lines 164 to 180): size fits, tables share the same
`combine_group`, every table in a combination is really needed, accessibility
and high chairs are met. The list is sorted best fit first (`_choice_order`,
lines 183 to 193).

**M3. How does "Choose for me" pick a table?**
`recommend_table` (`restaurant_assign.py` lines 88 to 105): only free choices,
single tables before combinations (joining tables is extra work for staff),
least waste first, then zone wish. Each pick comes with reasons such as "Exact
fit for 2" or "Keeps the table for 6 free for a larger party" (`_explain`,
lines 60 to 85).

**M4. How does the service plan search work?**
`assign_service` (lines 297 to 309): greedy first (`_greedy`, lines 151 to
159: fixed parties placed, then the rest biggest first, seeded order among
equal sizes), then `_local_search` (lines 259 to 283). Each step tries one of
four moves at random: move, swap, seat a waiting party pushing others aside,
or push a seated party. A trial is kept if its key is not worse. Equal moves
are accepted so the search can walk across plans with the same score.

**M5. Why accept equal moves but never worse ones? Is that a weakness?**
Accepting equal moves lets it free the right table step by step. Never
accepting worse moves means the final plan is also the best one seen, which is
simple to explain. The weakness: it can get stuck. On 2026-11-10 the gap
report (`python -m scripts.gap_report_restaurant`) matched the optimal plan on
every small service except one, but on demo-sized services it matched the
optimal covers in only 4 of 8 cases. Issue 15 in `docs/team/issues.md` is
about this.

**M6. How does the exact solver turn three priorities into one number for
CP-SAT?**
`restaurant_exact.py`, `_objective_weights` (lines 159 to 175): a zone wish is
worth 1, one wasted seat is worth more than all zone wishes together, one cover
is worth more than all possible waste together. So the weighted sum ranks plans
exactly like the tuple key.

**M7. A walk-in arrives and nothing is free. What does what-if do?**
`whatif_walkin` (`restaurant_assign.py` lines 381 to 395) first looks for a
free table. If none, `_cheapest_displacement` (lines 350 to 378) tries every
table choice, moves the parties in the way to their first free alternative
(`_relocate_blockers`, lines 323 to 347), and keeps the cheapest: fewest
parties moved, then fewest guests moved. Fixed parties (the diner chose the
table) are never moved. Nothing is written; it only describes the moves.

**M8. How is a walk-in stored?**
`staff_floor.py`, `seat_walkin` (lines 136 to 169): a booking with
`source="walk_in"`, `status="seated"`, empty email (no emails) and a random
manage token hash nobody receives. Its `table_slots` rows are written like any
booking, so the UNIQUE rule protects it too.

**M9. Re-plan a service: why preview first, then apply with a `plan_id`?**
`service_plan.py`, `propose` (lines 111 to 126) only keeps the new plan if
everyone still has a table and the key is better. Apply (`apply_proposal`,
lines 168 to 195) releases old slots, writes new ones and commits once. The
`plan_id` is built from the plan, so if the floor changed between preview and
apply, the ids do not match and staff get 409 "preview again". Staff never
apply something they did not see.

**M10. What do the dashboard numbers mean?**
`dashboard.py`, `dashboard` (lines 114 to 130). Utilisation = booked
seat-minutes / available seat-minutes per service. No-show rate = no-shows /
finished bookings over the 90 days before the date (`HISTORY_DAYS`, line 30).
Overbooking suggestion = expected covers x no-show rate, rounded down. It is
only a suggestion; SeatPlan never overbooks by itself.

**M11. How is the seat map drawn, and why not a canvas library?**
`frontend/src/seatmap/SeatMap.tsx` (`SeatMap`, line 209) draws SVG by hand:
zones, tables, seats. `usePanZoom.ts` (line 57) handles drag, wheel and pinch.
`mapKeyboard.ts` (`handleMapKey`, line 26) moves focus to the nearest seat in
the arrow's direction (`geometry.ts`, `nearestInDirection`, line 62). SVG
elements can have focus and labels, so screen readers and the keyboard work; a
canvas is one picture with nothing inside to focus.

**M12. How does a colour-blind person tell seat states apart?**
States are shown with a shape and a mark, not only a colour
(`seatmap/glyphs.tsx`; `docs/product-spec.md` section 3.1). `npm run contrast`
(`frontend/scripts/contrast.mjs`) checks the colour pairs: "86 checks, 0
failures" in the README test report.

**M13. What does CI check?**
`.github/workflows/ci.yml`: backend ruff lint and format, pytest,
pip-audit; frontend typecheck, vitest, build, contrast, npm audit; Playwright
browser tests (`e2e` job); plus a gitleaks secret scan. On 2026-11-10 we ran
the local parts: `443 passed, 1 warning` for pytest, `Tests 133 passed (133)`
for vitest and `12 passed` for `npm run e2e`. We have not seen the gitleaks
step or the `e2e` job run yet (they run only on GitHub).

**M14. How is the demo data made, and is it real?**
`seed/demo_restaurant.py`: "Casa Lumen", 18 tables in four zones, lunch
Tuesday to Sunday and dinner every day, bookings for today and the next three
days, and 14 days of history so the dashboard has a no-show rate. One
`random.Random(2026)` makes it the same every run; only the secret tokens are
truly random. All names are invented and emails end in `@example.com`.

---

## Hard follow-ups (anyone may get these)

**H1. SQLite and Postgres behave differently with locks. Does your guarantee
hold on both?**
The UNIQUE rules work the same on both, and that is the guarantee. The locks
(`lock_event`, `_lock_period`) are about clean errors and the covers cap.
`README.md` says the full test suite also ran on a local Postgres 16.2 with
`430 passed, 1 skipped` (the skipped test is SQLite-only), from an earlier run
with the 431-test suite. It was not repeated in the final verification, so
the 12 newer security tests have not run on Postgres.

**H2. Can the optimiser ever break a hard rule?**
It never proposes an illegal move (events: `seat_allows` in `propose_move`;
restaurants: only `candidate_choices`, and `Floor.place` raises if a slot is
taken, `restaurant_model.py` lines 265 to 271). And even if it did, the
database would refuse the write when the plan is applied.

**H3. Your time limit is 15 s but Vercel stops at 30 s. Why those numbers?**
`vercel.json` sets `maxDuration` 30 s. An exact check runs the heuristic and
then the exact solver (up to 10 s) in one request, so 15 s plus 10 s still
fits. Decisions log, "fixes after the adversarial review", item 3.

**H4. What did you not test?**
A real Vercel deployment, real email through Resend, screen readers, real
touch devices, usability with real people, and the gitleaks step. All written
in `README.md` and `docs/product-spec.md` section 6.
