# optimiser: READ ME FIRST

Pure Python seat planning. Nothing in this folder imports the database or
FastAPI: routers turn rows into the frozen dataclasses below, call one
function, and store the result. That is what makes every function here easy to
test with tiny hand-made examples.

## Events

Full write-up with the maths and the measured gap table: `docs/optimiser-events.md`.

### Purpose

Seat the guests of an event so that people who know each other, and members
of the same group, sit together, while never breaking a hard rule and never
moving a guest who chose their own seat.

### Files, in reading order

| File | One job |
|---|---|
| `events_model.py` | Dataclasses (`SeatSpec`, `GuestSpec`, `Weights`, `EventProblem`, results), `seat_allows`, `check_hard` |
| `events_score.py` | The objective: `score` returns a `ScoreBreakdown`, plus the gain and delta helpers the searches use |
| `events_greedy.py` | `greedy`: hardest guests first, each on the free seat that adds most points now |
| `events_anneal.py` | `anneal`: simulated annealing with move and swap; `solve` = greedy then anneal |
| `events_replan.py` | `replan`: start from the previous plan and pay `change_penalty` for every guest who moves |
| `events_recommend.py` | `recommend`: best free seats for one attendee, with plain-language reasons |
| `events_exact.py` | `solve_exact`: proven optimum for small events (CP-SAT, or branch and bound without OR-tools) |

### Data flow

```
router (rows) -> EventProblem
  solve(problem, seed)                -> SolveResult(assignment, score, iterations, seed, unseated)
  replan(problem, previous, seed)     -> SolveResult(..., moved)
  recommend(problem, current, guest)  -> [Recommendation(seat_id, gain, reasons, known_nearby)]
  solve_exact(problem, time_limit_s)  -> ExactResult(assignment, score, seated, engine, proven_optimal, seconds)
router stores assignment + score (plan_snapshots)
```

Hard rules (checked by `check_hard`, respected by every search move): one
guest per seat, blocked seats stay empty, reserved seats only for guests with
the same tag, accessibility needs met, `fixed` guests stay exactly where they
chose. A guest who cannot be placed is reported as unseated, never forced.

### Three likely walkthrough questions

1. **Why is the result the same every time I press "Auto-fill"?**
   All randomness comes from one `random.Random(seed)` created in `solve` and
   passed down. The search stops after `max_iterations`, not after a number of
   seconds, so a slower computer does not change the answer. The time limit is
   only a safety cut-off (15 s, below Vercel's 30 s function limit) that
   demo-sized events never reach.

2. **How do you know the annealing never breaks a rule?**
   `propose_move` only proposes a move if both guests are allowed on their new
   seats and nobody fixed is involved, so every visited state is feasible. The
   property-based tests (`tests/test_optimiser_events_properties.py`) generate
   hundreds of random events and check `check_hard(...) == []` and that fixed
   guests did not move, for both `solve` and `replan`.

3. **How good is the heuristic?**
   On small events we can compute the true optimum (`solve_exact`) and compare.
   `backend/scripts/gap_report_events.py` prints that comparison; on 21 random
   events of 6 to 10 guests the heuristic matched the optimum in 20 and was
   3.7 % below it in one. Large events have no proven optimum, so there we only
   know the heuristic is feasible and never worse than its greedy start
   (annealing returns the best plan it has seen, and the start is one of them).

## Restaurants

Full write-up with the model, the complexity notes and the measured gap table:
`docs/optimiser-restaurant.md`.

### Purpose

Put every party of a service (one lunch or one dinner) at a table so that the
most guests get a seat, the fewest seats are wasted (a party of 2 does not take
the table for 6), and zone wishes are met when that costs nothing. Also answer
"which table for this party?" and "can we take this walk-in?". A diner's own
table choice (`fixed_tables`) is never changed.

### Files, in reading order

| File | One job |
|---|---|
| `restaurant_model.py` | Dataclasses (`TableSpec`, `PartySpec` with an optional `label` used in messages, results), the fit rules (`choice_problem`, `candidate_choices`), `largest_party` (the biggest party any table or allowed combination can seat), the `Floor` that records who uses which table in which slot, `score_plan`, `check_hard` |
| `restaurant_assign.py` | The fast heuristic: `recommend_table`, `assign_service` (seeded greedy + local search), `whatif_walkin` |
| `restaurant_exact.py` | `assign_exact`: proven optimum for small services (CP-SAT, or branch and bound without OR-tools) |

### Data flow

```
router (rows) -> [TableSpec], [PartySpec]   (time = 15-minute slot indexes, [start, end))
  recommend_table(tables, busy, party, top)  -> [TableChoice(table_ids, waste, zone_met, reasons)]
  assign_service(tables, parties, seed)      -> ServicePlan(assignments, unseated, score, iterations)
  whatif_walkin(tables, parties, plan, walkin) -> WalkinAnswer(table_ids, displaced, reasons)
  assign_exact(tables, parties, time_limit_s)  -> ExactPlan(assignments, unseated, score, proven_optimal, method, seconds)
router stores the tables per booking (table_slots rows)
```

Who calls what: `recommend_table` serves the diner map and holds;
`whatif_walkin` serves the staff what-if and walk-ins; `assign_service` and
`assign_exact` serve the staff Optimise tab through
`restaurant_service/service_plan.py` (`POST /staff/{vid}/optimise/service` and
`/optimise/exact-check`), and the gap report in `backend/scripts/`.

Hard rules (all in `choice_problem` plus the `Floor`): a table hosts one party
per slot; the party fits the table, or the combined tables (same
`combine_group`, at most 3, none of them spare); accessibility and high-chair
needs are met; fixed parties stay exactly on their tables. A party that cannot
be placed is reported as unseated, never forced.

### Three likely walkthrough questions

1. **How does the optimiser decide between two plans?**
   It compares `ScoreBreakdown.key()`, the tuple (covers seated, minus wasted
   seats, zone wishes met). Python compares tuples left to right, so one more
   guest seated always wins over any number of saved seats, and one saved seat
   always wins over any number of zone wishes. That is the strict priority
   order of the contract, with no weights to tune.

   **Ambience wishes (spec 8).** A party may wish for `sun`, `shade`, `view`,
   `quiet` or `away_from_wc` (`PartySpec.prefs`); tables carry the matching
   `TableSpec.features`, worked out by `app.ambience.table` for that service
   time. Joined tables meet a wish only if every table does. Wishes are the
   very last tie-breaker: `ScoreBreakdown.ranking_key()` is `key()` plus
   wishes met, and the heuristic search uses it, while `key()` itself keeps its
   three parts (the exact check, the staff "is it better?" test and the gap
   report compare `key()`). In `recommend_table` a wish may beat up to two
   spare seats (`WISH_WASTE_MARGIN`), never more, so a couple who wants sun
   does not get the table for eight. Reasons say "Sunny, as you asked", "Not in
   the sun", or "No sunny table is free at 13:00".

2. **Why is the same service always planned the same way?**
   All randomness comes from one `random.Random(seed)` created in
   `assign_service`, the parties are sorted by id before anything else, and the
   search stops after `max_iterations` moves. The 15-second limit is only a
   safety net; 5,000 iterations on a 60-party service take under a second.
   `test_same_seed_gives_the_same_plan` checks this, even with the parties
   given in reverse order.

3. **How do you know a party is never put at a table that is too small, or on
   top of another party?**
   Every candidate choice passes `choice_problem` before the search may use
   it, and the `Floor` refuses to write a party into a (table, slot) that is
   already taken. The property-based tests
   (`tests/test_optimiser_restaurant_properties.py`) generate hundreds of
   random restaurants and check directly: no table used twice in one slot, no
   undersized table, no fixed party moved. On small services the heuristic is
   also compared with the proven optimum; see the gap table in the docs.
