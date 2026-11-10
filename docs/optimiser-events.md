# Events optimiser

Code: `backend/app/optimiser/events_*.py`. Tests: `backend/tests/test_optimiser_events_*.py`.
Gap report: `backend/scripts/gap_report_events.py`.

## 1. Formal statement

### Sets and data

- `S`: seats. Each seat `s` has a table `t(s)`, and flags `blocked(s)`,
  `accessible(s)` and `tag(s)` (a reserved tag or none).
- `G`: guests. Each guest `g` has `needs_accessible(g)`, `tag(g)`, a group
  `grp(g)` (or none), `keep_adjacent(g)` and a set `knows(g)`.
- `N(s)`: the seats next to seat `s` (symmetric; built from the floor plan).
- `F`: the fixed pairs `(g, s)`: seats chosen by the guests themselves.
- `P`: the related pairs `{g, h}` with `g != h`: they know each other (in either
  direction, so "knows" is treated as mutual and each pair is counted once) or
  share a group.
- Allowed pairs `A`: `(g, s)` is allowed when `s` is not blocked, `tag(s)` is
  none or equals `tag(g)`, and `s` is accessible whenever `g` needs it.

### Decision variables

`x[g, s] = 1` if guest `g` sits on seat `s`, else 0, for `(g, s)` in `A`.
A guest with no `x` equal to 1 is unseated.

### Hard constraints

1. Each guest sits at most once: `sum over s of x[g, s] <= 1`.
2. One guest per seat: `sum over g of x[g, s] <= 1`.
3. Blocked, reserved and accessibility rules: only allowed pairs have a variable.
4. Fixed choices: `x[g, s] = 1` for every `(g, s)` in `F`.

### Soft terms (weights in `Weights`)

For a related pair `{g, h}` seated on `s` and `s'`:

| Term | Points | When |
|---|---|---|
| `friend_adjacent` | 10 | they know each other and `s'` is in `N(s)` |
| `friend_same_table` | 4 | they know each other and `t(s) = t(s')` |
| `group_adjacent` | 15 | same group, the group has `keep_adjacent`, and `s'` is in `N(s)` |
| `group_same_table` | 6 | same group and `t(s) = t(s')` |
| `changes` (replan only) | -8 per guest | the guest's seat differs from the previous plan |

The terms are independent: two friends side by side at one table earn both
the adjacent and the same-table points (14 in total).

### Objective

`score = sum over related pairs of the pair terms + changes`.
`score()` returns a `ScoreBreakdown` with the total and one number per term,
so the interface can explain a plan.

The exact solver is lexicographic: first seat as many guests as possible,
then maximise the score. The heuristic reaches the same goal by construction
(it places the hardest guests first and only leaves a guest out when no
allowed seat is free); it does not prove that the number seated is maximal.

## 2. Complexity

This is a quadratic assignment style problem: the value of putting `g` on `s`
depends on where every related guest `h` sits, so the objective is a sum of
products `x[g, s] * x[h, s']` (a "flow" between guests times a "closeness"
between seats), which is the shape of the Koopmans-Beckmann quadratic
assignment problem. The quadratic assignment problem is NP-hard in general
(Sahni and Gonzalez, 1976; citation from memory, **unverified** in this repo).

Our own variant is NP-hard too, by a short argument that does not rely on that
citation. Keep only the `friend_same_table` term, with weight 1, and use `q`
tables of 3 seats with no adjacency. For a graph with `3q` vertices, make each
vertex a guest and each edge a friendship. A plan scores `3q` exactly when
every table holds 3 guests who all know each other, that is, when the graph
can be partitioned into triangles. "Partition into triangles" is NP-complete
(Garey and Johnson, 1979; the problem code GT11 is quoted from memory,
**unverified**). So deciding whether a plan with a given score exists is
NP-hard, and we should not expect an exact method that is fast on every large
event. That is why production uses a heuristic and the exact solver is only a
yardstick on small events.

## 3. Algorithms

### Greedy (`events_greedy.py`)

1. Start from the fixed pairs.
2. Order the other guests: reserved tag first, then accessibility needs, then
   bigger groups (members of one group stay consecutive). Equal-priority guests
   are shuffled by the seeded generator, then a stable sort keeps that order.
3. Put each guest on the free allowed seat with the largest marginal gain (the
   pair points with guests already seated). Ties are broken by the seeded
   generator over seats sorted by id. A tagged guest takes one of their own
   reserved seats when one is free, because a reserved seat can only ever hold
   a tagged guest. A guest who does not need an accessible seat only takes
   one when no other allowed seat is free, so accessible seats stay open for
   the guests placed later who do need them.
4. If a guest still has no free allowed seat, try one repair move: take an
   allowed seat whose current guest is not fixed and can move to an empty
   seat they are allowed on, move that guest, and seat the new one. Seats are
   tried in id order, so the result is reproducible. Only if that fails is the
   guest left unseated. Annealing cannot do this repair, because it only moves
   guests who already have a seat.

### Simulated annealing (`events_anneal.py`)

- Move: pick a random non-fixed guest and a random seat. Empty seat: move
  there. Seat of another non-fixed guest: swap. The move is skipped if either
  guest would land on a seat they are not allowed on, or if the seat belongs to
  a fixed guest. Every state visited is therefore feasible.
- Delta: only pairs touching the one or two moved guests can change, so the
  delta is "their pair points after minus before" (plus the change penalty in
  replan). A test checks this incremental delta against a full rescore on 300
  random moves. The start and the final result are scored from scratch.
- Acceptance: always if the delta is not negative, otherwise with probability
  `exp(delta / T)`.
- Cooling: geometric, from `T = 10` (about one friend-adjacent bonus) to
  `T = 0.05`, spread over `max_iterations` steps.
- Stopping: after `max_iterations` (default 20 000). The time limit (15 s) is a
  safety cut-off only, so the same seed always gives the same plan. It is set
  well below Vercel's 30 s `maxDuration` (vercel.json): an oversized request
  returns its best plan so far instead of being killed with no answer, and
  exact-check (heuristic plus a 10 s exact search in one request) still fits.
  A test reads vercel.json and fails if the two limits stop fitting.
- Result: the best plan seen, which is never worse than the start.

`solve` = greedy then annealing, with one `random.Random(seed)` shared by both.

### Replan (`events_replan.py`)

Keep every previous seat that is still valid (guest still invited, seat still
allowed and not taken by a fixed guest), fill the gaps greedily (with the
repair move above, which may move a kept guest when that is the only way to
seat someone), then anneal
with the change penalty switched on. Fixed guests never move. The result lists
the guests whose seat changed. On the test scenario (36 guests, 5 tables of 8,
3 cancellations) replan moved 0 guests, while a fresh solve put 26 guests on a
different seat than before.

### Recommend (`events_recommend.py`)

For one guest, every free allowed seat is ranked by marginal gain (ties by
seat id). Reasons are built only from the guest's own `knows` list and their
own group ("Next to 2 people you know", "Same table as your group",
"Accessible seat"). Only ids are returned; the API layer adds display names.

The objective treats knowing as mutual, so on its own the gain would count
people who listed this guest, and the seats next to them would rise to the
top. Before asking for recommendations, `events_service/recommend.py` removes
this guest from every OTHER guest's `knows` set, so the gain and the order use
the guest's own list and group only. The API also never returns the gain
number: each seat gets a `rank` (1 = best) and a coarse `match` label
(`strong` = at least as good as sitting next to one person you know, `some`,
or `none`). The planner's own objective (auto-fill, re-plan) is unchanged.

### Exact solver (`events_exact.py`)

- CP-SAT (when `ortools` imports): the `x[g, s]` variables above, plus two 0/1
  variables per related pair, "adjacent" and "same table". Each may be 1 only
  if the plan makes it true: for every seat `s` of `g`,
  `link + x[g, s] - sum of x[h, s'] over the qualifying seats s' <= 1`.
  Objective: `M * (guests seated) + pair points`, with `M` larger than all
  pair points together, which gives the lexicographic order. Points are scaled
  by 1000 and rounded, because CP-SAT needs whole numbers. One worker and a
  fixed random seed keep the answer reproducible.
- Branch and bound (no OR-tools needed): depth-first over guests, hardest
  first, trying seats in order of gain and "unseated" last. The incumbent
  starts as a greedy plan. Upper bound at depth `d`: guests seated so far plus
  guests left, and score so far plus, for every pair not yet decided, the most
  that pair could ever earn. No pair can earn more than that, so the bound is
  admissible and pruning never removes the optimum.
- Both engines report `engine` and `proven_optimal` (false only if the time
  limit stopped the search). Tests compare both engines with an independent
  brute force on tiny instances and with each other on instances up to 10
  guests.

## 4. Parameters

| Parameter | Default | Where |
|---|---|---|
| `Weights` | 10, 4, 15, 6, change 8 | `events_model.py` |
| `seed` | 0 | `solve`, `replan` |
| `max_iterations` | 20 000 | `solve`, `replan` (the stopping rule) |
| `time_limit_s` (heuristic) | 15 s | safety cut-off only, below Vercel's 30 s |
| `START_TEMPERATURE`, `END_TEMPERATURE` | 10, 0.05 | `events_anneal.py` |
| `time_limit_s` (exact) | 10 s | `solve_exact` |
| `SCALE` | 1000 | CP-SAT integer scaling |

## 5. Measured gap

Produced by `cd backend && python -m scripts.gap_report_events` on 2026-11-10
(Python 3.12.13, OR-tools 9.15.6755, Apple arm64). The heuristic ran with
`max_iterations = 20000`. "Optimal score" is from CP-SAT, "B&B score" from the
pure-Python branch and bound; "Proven" means both proved optimality. Timings
depend on the machine; every other column is reproducible.

| Guests | Tables x seats | Seed | Seated heur/opt | Heuristic score | Optimal score | B&B score | Gap % | Heuristic s | Exact s (engine) | B&B s | Proven |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 6 | 2 x 4 | 0 | 6/6 | 28 | 28 | 28 | 0.0 | 0.02 | 0.00 (cp-sat) | 0.00 | yes |
| 6 | 2 x 4 | 1 | 6/6 | 68 | 68 | 68 | 0.0 | 0.07 | 0.01 (cp-sat) | 0.00 | yes |
| 6 | 2 x 4 | 2 | 6/6 | 76 | 76 | 76 | 0.0 | 0.06 | 0.00 (cp-sat) | 0.00 | yes |
| 7 | 2 x 4 | 0 | 7/7 | 142 | 142 | 142 | 0.0 | 0.06 | 0.00 (cp-sat) | 0.00 | yes |
| 7 | 2 x 4 | 1 | 7/7 | 76 | 76 | 76 | 0.0 | 0.05 | 0.00 (cp-sat) | 0.00 | yes |
| 7 | 2 x 4 | 2 | 7/7 | 81 | 81 | 81 | 0.0 | 0.08 | 0.01 (cp-sat) | 0.00 | yes |
| 8 | 2 x 5 | 0 | 8/8 | 92 | 92 | 92 | 0.0 | 0.07 | 0.00 (cp-sat) | 0.00 | yes |
| 8 | 2 x 5 | 1 | 8/8 | 102 | 102 | 102 | 0.0 | 0.07 | 0.00 (cp-sat) | 0.00 | yes |
| 8 | 2 x 5 | 2 | 8/8 | 74 | 74 | 74 | 0.0 | 0.06 | 0.00 (cp-sat) | 0.00 | yes |
| 8 | 3 x 4 | 0 | 8/8 | 88 | 88 | 88 | 0.0 | 0.06 | 0.01 (cp-sat) | 0.00 | yes |
| 8 | 3 x 4 | 1 | 8/8 | 88 | 88 | 88 | 0.0 | 0.07 | 0.01 (cp-sat) | 0.00 | yes |
| 8 | 3 x 4 | 2 | 8/8 | 77 | 77 | 77 | 0.0 | 0.06 | 0.01 (cp-sat) | 0.00 | yes |
| 9 | 2 x 5 | 0 | 9/9 | 109 | 109 | 109 | 0.0 | 0.07 | 0.00 (cp-sat) | 0.00 | yes |
| 9 | 2 x 5 | 1 | 9/9 | 122 | 122 | 122 | 0.0 | 0.08 | 0.01 (cp-sat) | 0.01 | yes |
| 9 | 2 x 5 | 2 | 9/9 | 124 | 124 | 124 | 0.0 | 0.07 | 0.01 (cp-sat) | 0.00 | yes |
| 10 | 3 x 4 | 0 | 10/10 | 105 | 109 | 109 | 3.7 | 0.09 | 0.05 (cp-sat) | 0.06 | yes |
| 10 | 3 x 4 | 1 | 10/10 | 156 | 156 | 156 | 0.0 | 0.11 | 0.08 (cp-sat) | 0.65 | yes |
| 10 | 3 x 4 | 2 | 10/10 | 142 | 142 | 142 | 0.0 | 0.11 | 0.06 (cp-sat) | 0.56 | yes |
| 10 | 2 x 6 | 0 | 10/10 | 117 | 117 | 117 | 0.0 | 0.09 | 0.07 (cp-sat) | 0.09 | yes |
| 10 | 2 x 6 | 1 | 10/10 | 176 | 176 | 176 | 0.0 | 0.11 | 0.09 (cp-sat) | 0.57 | yes |
| 10 | 2 x 6 | 2 | 10/10 | 166 | 166 | 166 | 0.0 | 0.11 | 0.04 (cp-sat) | 0.33 | yes |

Reading: 20 of 21 instances at the optimum, one 3.7 % below. 21 random
instances of at most 10 guests say little about large events; there the gap is
unknown.

Separate timing check on the same machine (round tables of 8, `solve` with
20 000 iterations): 100 guests 0.7 s, 200 guests 1.5 s, 400 guests 4.2 s.

## 6. Limits

- The gap is only measured on small events. Larger events have no proven
  optimum to compare with.
- The heuristic does not prove that it seats the maximum number of guests; it
  places the most constrained guests first and tries one repair move per
  unseated guest. Annealing only moves guests who are already seated, so it
  never seats an extra guest. Exact-check therefore compares seat counts
  first: when the heuristic seats fewer guests than the optimum it reports
  both counts and no gap in points (`gap_percent` is null), because a plan
  with fewer guests can score as many points as the optimum or more.
- `are_adjacent` accepts a one-directional neighbour map, but the floor-plan
  save is expected to store symmetric pairs (contract, section 4).
- CP-SAT works on points scaled by 1000. With weights that have more than three
  decimals the CP-SAT optimum could differ slightly from the true optimum; the
  returned score is always recomputed exactly with `score()`.
- The exact solvers are for small checks only. Measured on the same machine
  with the gap-report generator (seed 0, 3 tables of 5, 60 s limit): with 12
  guests CP-SAT proved the optimum in 7.6 s while branch and bound found the
  same score but could not prove it; with 14 guests neither proved optimality
  within 60 s (CP-SAT best 275, branch and bound best 263).
