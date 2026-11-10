# Restaurant optimiser

Code: `backend/app/optimiser/restaurant_model.py`, `restaurant_assign.py`,
`restaurant_exact.py`. Tests: `backend/tests/test_optimiser_restaurant_*.py`.
Gap report: `backend/scripts/gap_report_restaurant.py`.

The optimiser answers three questions for one service (for example Friday
dinner):

1. **Which table for this party?** `recommend_table` ranks the free tables and
   explains each choice in plain language.
2. **Who sits where for the whole service?** `assign_service` places every
   party, never touching a diner's own choice.
3. **Can we take this walk-in?** `whatif_walkin` gives the best free table, or
   the cheapest set of moves that would make room, without changing the plan.

`assign_exact` computes the proven optimum on small services so that we can
measure how good the fast heuristic is.

Where the app calls each function:

| Function | Endpoint | Code |
|---|---|---|
| `recommend_table` | `GET /r/{vid}/map`, `POST /r/{vid}/hold` without a table, walk-ins, booking changes | `restaurant_service/map_view.py`, `diner_flow.py`, `staff_floor.py`, `manage_flow.py` |
| `assign_service` | `POST /staff/{vid}/optimise/service` (auto-assigns the diners who chose no table) | `restaurant_service/service_plan.py` |
| `whatif_walkin` | `POST /staff/{vid}/whatif` | `restaurant_service/whatif.py` |
| `assign_exact` | `POST /staff/{vid}/optimise/exact-check` (heuristic versus proven optimum) | `restaurant_service/service_plan.py` |
| `largest_party` | `GET /r/{vid}` and `GET /b/{token}` (`max_party`) | `restaurant_service/availability.py` |

## 1. Model

### Sets and data

| Symbol | Meaning |
|---|---|
| T | tables. Table t has `min_party` m_t, `max_party` M_t, a zone, `accessible`, `high_chair_ok`, and an optional `combine_group` g_t |
| P | parties. Party p has size n_p, a slot interval [a_p, b_p), `needs_accessible`, `high_chairs` h_p, an optional zone wish, and optional `fixed_tables` F_p |
| S | 15-minute slots of one day, numbered 0, 1, 2, ... |
| C(p) | candidate choices of p: the sets of tables that may host p, ignoring time |

The interval is half-open: a party in [8, 12) leaves before slot 12, so the
next party may sit down at slot 12.

### What a candidate choice is (hard rules that do not depend on time)

A set c of tables is in C(p) when all of these hold:

- **Size, one table:** m_t <= n_p <= M_t.
- **Size, combined tables:** all tables share one non-empty `combine_group`;
  at most 3 tables; n_p <= sum of M_t; and every table is needed, that is
  n_p > (sum of M_t) - (smallest M_t in c). Without the last rule a party of 4
  could block three 2-tops.
- **Accessibility:** if the party needs it, every table in c is accessible.
- **High chairs:** if h_p > 0, at least one table in c accepts a high chair.
- **Fixed choice:** if F_p is given, C(p) = {F_p} and nothing else. A fixed
  choice that itself breaks a rule above is refused with a `ValueError`,
  because it is a data error made before the optimiser ran.

All of this lives in one function, `choice_problem`, so the heuristic, both
exact solvers and `check_hard` use the same definition.

### Decision variables

x(p, c) in {0, 1} for every party p and every c in C(p): "party p sits at the
tables c". A party with no chosen c is unseated.

### Hard constraints

1. Each party sits at most once: sum over c of x(p, c) <= 1.
2. A fixed party sits exactly at its own tables: x(p, F_p) = 1.
3. One party per table per slot: for every table t and slot s,
   sum of x(p, c) over all p with s in [a_p, b_p) and all c containing t <= 1.

In the code, constraint 3 is the `Floor` class: a dictionary keyed by
(table id, slot), so a second party simply cannot be written into a taken key.
In the database, the same rule is the primary key of `table_slots`.

### Soft terms and the lexicographic objective

For a seated party, the waste is w(p, c) = (sum of M_t for t in c) - n_p, and
the zone term z(p, c) is 1 when p has a zone wish and every table in c is in
that zone.

The objective is lexicographic, in strict priority order:

1. maximise covers seated: sum of n_p x(p, c);
2. then minimise wasted seats: sum of w(p, c) x(p, c);
3. then maximise zone wishes met: sum of z(p, c) x(p, c).

In Python this is just a tuple compared left to right:
`ScoreBreakdown.key() = (covers, -waste, zones)`.

For CP-SAT, which needs one number, the tuple becomes a weighted sum. A zone
wish is worth 1, a wasted seat costs W = |P| + 1 (more than all zone wishes
together), and a cover is worth W x (Wmax + 1), where Wmax is the largest
possible total waste. Each level then outweighs everything below it, so the
weighted sum orders plans exactly like the tuple (`_objective_weights`).

## 2. Complexity (stated carefully)

What we can say with confidence:

- If every party took exactly one slot (all at the same time) and only single
  tables were allowed, the problem would be a maximum-weight bipartite matching
  between parties and tables, which is solvable in polynomial time.
- If every party fitted every table, the time dimension alone would be
  interval scheduling on |T| identical machines with weights, which is also
  known to be solvable in polynomial time (for example by a min-cost-flow
  formulation). **Unverified:** we believe this is the result of Arkin and
  Silverberg (1987), "Scheduling jobs with fixed start and end times"; we did
  not check the paper.
- Our problem has both: each party may only use some tables (its candidate
  set), and it occupies an interval. **Unverified:** the literature on
  interval scheduling with machine eligibility restrictions reports the
  general version as NP-hard (the same 1987 paper and the survey by Kolen,
  Lenstra, Papadimitriou and Spieksma, 2007, "Interval scheduling: a survey").
  Our eligibility sets have extra structure (mostly "big enough tables"),
  and we have not proved whether that structure makes it easier.
- Combining tables makes the problem look like a packing problem: choosing
  disjoint sets of tables whose capacities cover the parties is related to
  bin packing and set packing. **Unverified:** we have not written a reduction
  proving NP-hardness of our exact variant.

What this means in practice: we do not rely on a polynomial algorithm. The
exact solvers are exponential in the worst case and are only used on small
services; the everyday answer comes from the heuristic, whose gap we measure
(section 4) instead of assuming.

Sizes: with |T| tables and combinations of at most 3 tables, a party has at
most |T| + C(|T|, 2) + C(|T|, 3) candidates (for 20 tables: 1,350 before
filtering; far fewer after the size and group rules).

## 3. Algorithms

### recommend_table(tables, busy, party, top=3)

1. Build C(p) sorted by: least waste, then zone wish met, then fewer tables,
   then table ids (so ties always break the same way).
2. Keep only the choices whose tables are free during [a_p, b_p) in `busy`.
3. If any single table is left, drop the combinations: joining tables is extra
   work for the staff and only makes sense when nothing else fits.
4. Explain each of the first `top` choices, for example "Exact fit for 4",
   "Keeps the table for 6 free for a larger party", "Window zone as
   requested", "Joins tables 3 + 4 for a party of 8".

Hard needs are never traded for soft ones: an inaccessible table is simply not
in C(p), so it cannot be recommended at all.

### assign_service(tables, parties, seed=0, max_iterations=5000)

1. **Fixed parties first.** Every party with `fixed_tables` is placed on
   exactly those tables (`place_fixed`). The search never moves them: every
   move only picks from the non-fixed parties.
2. **Seeded greedy.** The non-fixed parties are shuffled with
   `random.Random(seed)` and then stably sorted by size, largest first; the
   seed only decides the order among parties of equal size. Each party takes
   the first free choice of its sorted C(p), which is the best fit.
3. **Local search.** For `max_iterations` rounds, pick one of four moves at
   random and keep the result if its key is not worse than the current one:
   - **move:** a seated party goes to another free choice;
   - **swap:** two seated parties exchange tables, if each fits the other's;
   - **seat a waiting party:** an unseated party takes a random choice; the
     non-fixed parties in the way are taken off, then every unseated party
     (them included) gets a best-fit free table, largest first;
   - **push a seated party:** the same as the previous move but for a party
     that is already seated, so it can reach tables that are currently taken.

   The last two moves are what let one party of 8 make room for two parties of
   6. The first version only had "move, swap, relocate one blocker"; the gap
   report showed that it could not leave the plan where the greedy had put the
   largest party, so the relocation became the "take off, then refill" step.
   Accepting equal moves lets the search walk across plans with the same score;
   never accepting a worse one means the final plan is the best one seen.
4. **Stopping rule.** The iteration budget. A wall-clock cut-off (15 s) exists
   only as a safety net; on a 20-table, 60-party service 5,000 iterations take
   under one second on our laptop, so it never fires on demo data and the same
   seed gives the same plan on any machine.

### whatif_walkin(tables, parties, plan, walkin)

1. Rebuild the floor from the plan (on a copy: the plan is never changed).
2. If `recommend_table` finds a free table, answer with it and its reasons.
3. Otherwise, for each candidate choice of the walk-in, take the parties in the
   way off the floor (only if none of them is fixed), seat the walk-in, and try
   to re-seat each displaced party on its best free choice. If all of them find
   a table, this choice is possible; its cost is (number of parties moved,
   number of guests moved). The cheapest possible choice is returned with the
   list of moves ("Move Ana Costa (party of 2) from table T4 to table T7").
   Reasons use table labels and the party's name (`PartySpec.label`), never
   database ids; without a label they fall back to "party 12".
4. If no choice is possible, the answer says so and has no table.

The router should pass parties that are already sitting at their table as
fixed, so the answer never suggests moving people in the middle of a meal.

### assign_exact(tables, parties, time_limit_s=10)

- **CP-SAT** (when `ortools` imports): one Boolean per (party, candidate
  choice), constraints 1 to 3 above (constraint 3 as `AddAtMostOne` per table
  and slot), and the weighted objective. One worker and a fixed seed make it
  repeatable. `proven_optimal` is true when the status is OPTIMAL.
- **Branch and bound** (pure Python, used when OR-tools is missing): fixed
  parties are placed first; the others are visited largest first; each is
  either placed on a free candidate (best fit first) or left unseated. The
  bound assumes every remaining party that has any candidate gets seated with
  its least waste and its zone wish met; a branch is cut when even that cannot
  beat the best plan found. The bound is valid for the lexicographic order:
  any completion with fewer covers is smaller in the first component, and a
  completion with all those covers wastes at least the summed minimum waste.
  If the time limit stops it, `proven_optimal` is false and the best plan so
  far (at least the fixed parties) is returned.

The tests check both solvers against a brute force written separately inside
the test file, on random tiny services generated by hypothesis.

### In the app: re-plan a service, and the exact check

`POST /staff/{vid}/optimise/service` `{date, service, seed?}` builds one
`PartySpec` per active booking of the date and calls `assign_service`:

- A booking may move only if the optimiser placed it (`table_choice` "auto")
  and the party has not sat down yet (`confirmed`). A diner's own table choice,
  a party that is `seated` or `finishing`, and every booking of another
  service of the same date get `fixed_tables` = their current tables.
- The new plan is used only if nobody ends up unseated and its key is strictly
  better than the current plan's key. Otherwise the answer is "no moves".
- The first call is a preview: who moves where, and covers seated and wasted
  seats before and after. Nothing is written. The answer carries a `plan_id`,
  a hash of the exact moves. A second call with `apply: true` and that
  `plan_id` plans again (same data and seed give the same plan) and writes it
  only if the hash still matches; if the floor changed meanwhile it answers 409
  and staff look again. A table a diner is holding right now is never taken.

`POST /staff/{vid}/optimise/exact-check` `{date, service, max_parties?}` takes
the first `max_parties` bookings of the service (default 8, at most 12, so the
exact solver stays well inside the 30-second function limit; the heuristic's
15 s cut-off plus the exact solver's 5 s also fit inside it), runs both
`assign_service` and `assign_exact` on that same slice, and returns both
scores, the gap (covers, wasted seats, and covers as a percentage of the
optimum) and `matches_optimum`. `capped` says when the slice is smaller than
the service.

### largest_party(tables)

The biggest party any single table, or allowed combination, can seat at all.
A combination counts only when the hard rules accept it full, so tables that
may not be joined never add up. The diner endpoints report
min(largest_party, the largest covers cap, 30) as `max_party`, so the booking
form never offers a size that would always come back "full".

## 4. Measured gap (real output)

Produced by running, from `backend/`:

```
python -m scripts.gap_report_restaurant
```

on 2026-11-10 with Python 3.12 and OR-tools 9.15 installed. Heuristic:
`assign_service(seed=seed, max_iterations=5000)`. Each row is a random service
built from the seed: a repeating floor of 2, 2, 4, 4, 6 and 8-tops (2- and
4-tops can be joined), random party sizes 2 to 8 with a turn time of 6 to 10
slots, random accessibility, high chair and zone wishes, and one party fixed to
a table it chose. "Covers / waste / zones" is the lexicographic key. "Covers
gap %" is (optimal covers - heuristic covers) / optimal covers. Timings depend
on the machine; everything else is the same on every run.

OR-tools available: True

Small services (CP-SAT and branch and bound)

| Tables | Parties | Seed | Covers wanted | Heuristic covers / waste / zones | Optimal covers / waste / zones | Covers gap % | Heuristic optimal | Heuristic s | Exact s | Exact agree | Proven |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 4 | 6 | 0 | 36 | 14 / 2 / 1 | 14 / 2 / 1 | 0.0 | yes | 0.01 | cp-sat 0.00, branch-and-bound 0.00 | yes | yes |
| 4 | 6 | 1 | 20 | 18 / 2 / 1 | 18 / 2 / 1 | 0.0 | yes | 0.02 | cp-sat 0.00, branch-and-bound 0.00 | yes | yes |
| 4 | 6 | 2 | 29 | 13 / 1 / 1 | 13 / 1 / 1 | 0.0 | yes | 0.03 | cp-sat 0.00, branch-and-bound 0.00 | yes | yes |
| 4 | 6 | 3 | 27 | 11 / 1 / 1 | 11 / 1 / 1 | 0.0 | yes | 0.02 | cp-sat 0.00, branch-and-bound 0.00 | yes | yes |
| 5 | 7 | 0 | 43 | 20 / 2 / 2 | 20 / 2 / 2 | 0.0 | yes | 0.03 | cp-sat 0.00, branch-and-bound 0.00 | yes | yes |
| 5 | 7 | 1 | 25 | 23 / 3 / 1 | 23 / 3 / 1 | 0.0 | yes | 0.02 | cp-sat 0.00, branch-and-bound 0.00 | yes | yes |
| 5 | 7 | 2 | 31 | 18 / 2 / 1 | 18 / 2 / 1 | 0.0 | yes | 0.03 | cp-sat 0.00, branch-and-bound 0.00 | yes | yes |
| 5 | 7 | 3 | 31 | 15 / 3 / 1 | 15 / 3 / 1 | 0.0 | yes | 0.02 | cp-sat 0.00, branch-and-bound 0.00 | yes | yes |
| 6 | 8 | 0 | 50 | 35 / 3 / 2 | 35 / 3 / 2 | 0.0 | yes | 0.03 | cp-sat 0.00, branch-and-bound 0.00 | yes | yes |
| 6 | 8 | 1 | 32 | 30 / 4 / 1 | 30 / 4 / 1 | 0.0 | yes | 0.02 | cp-sat 0.00, branch-and-bound 0.00 | yes | yes |
| 6 | 8 | 2 | 38 | 25 / 3 / 2 | 25 / 3 / 2 | 0.0 | yes | 0.03 | cp-sat 0.00, branch-and-bound 0.00 | yes | yes |
| 6 | 8 | 3 | 39 | 30 / 4 / 3 | 30 / 4 / 3 | 0.0 | yes | 0.02 | cp-sat 0.00, branch-and-bound 0.00 | yes | yes |
| 6 | 10 | 0 | 60 | 37 / 3 / 2 | 37 / 3 / 2 | 0.0 | yes | 0.03 | cp-sat 0.00, branch-and-bound 0.00 | yes | yes |
| 6 | 10 | 1 | 38 | 34 / 4 / 2 | 34 / 4 / 2 | 0.0 | yes | 0.03 | cp-sat 0.00, branch-and-bound 0.00 | yes | yes |
| 6 | 10 | 2 | 51 | 28 / 6 / 2 | 28 / 6 / 2 | 0.0 | yes | 0.03 | cp-sat 0.00, branch-and-bound 0.00 | yes | yes |
| 6 | 10 | 3 | 48 | 35 / 3 / 3 | 35 / 3 / 3 | 0.0 | yes | 0.02 | cp-sat 0.00, branch-and-bound 0.00 | yes | yes |
| 8 | 12 | 0 | 69 | 41 / 3 / 3 | 41 / 3 / 3 | 0.0 | yes | 0.05 | cp-sat 0.01, branch-and-bound 0.01 | yes | yes |
| 8 | 12 | 1 | 44 | 39 / 3 / 3 | 39 / 3 / 3 | 0.0 | yes | 0.03 | cp-sat 0.00, branch-and-bound 0.02 | yes | yes |
| 8 | 12 | 2 | 59 | 34 / 12 / 1 | 34 / 6 / 2 | 0.0 | no | 0.05 | cp-sat 0.03, branch-and-bound 0.03 | yes | yes |
| 8 | 12 | 3 | 61 | 40 / 2 / 3 | 40 / 2 / 3 | 0.0 | yes | 0.04 | cp-sat 0.00, branch-and-bound 0.02 | yes | yes |

Demo-sized services (CP-SAT only)

| Tables | Parties | Seed | Covers wanted | Heuristic covers / waste / zones | Optimal covers / waste / zones | Covers gap % | Heuristic optimal | Heuristic s | Exact s | Exact agree | Proven |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 12 | 30 | 0 | 159 | 87 / 13 / 5 | 87 / 3 / 3 | 0.0 | no | 0.13 | cp-sat 1.40 | yes | yes |
| 12 | 30 | 1 | 138 | 74 / 6 / 6 | 74 / 6 / 6 | 0.0 | yes | 0.11 | cp-sat 0.03 | yes | yes |
| 12 | 30 | 2 | 134 | 70 / 12 / 3 | 72 / 10 / 3 | 2.8 | no | 0.12 | cp-sat 0.04 | yes | yes |
| 12 | 30 | 3 | 148 | 74 / 2 / 6 | 74 / 2 / 6 | 0.0 | yes | 0.13 | cp-sat 0.03 | yes | yes |
| 20 | 60 | 0 | 263 | 152 / 14 / 11 | 154 / 12 / 11 | 1.3 | no | 0.65 | cp-sat 1.46 | yes | yes |
| 20 | 60 | 1 | 272 | 133 / 19 / 10 | 138 / 26 / 8 | 3.6 | no | 0.74 | cp-sat 0.97 | yes | yes |
| 20 | 60 | 2 | 266 | 131 / 25 / 6 | 131 / 17 / 8 | 0.0 | no | 0.81 | cp-sat 0.95 | yes | yes |
| 20 | 60 | 3 | 260 | 142 / 16 / 11 | 146 / 12 / 10 | 2.7 | no | 0.67 | cp-sat 1.01 | yes | yes |

In the demo-sized table only one exact method runs, so "Exact agree" is
trivially yes there.

What the numbers say:

- On the 20 small services the heuristic seated the optimal number of covers
  every time and matched the full lexicographic optimum in 19; in the other one
  it wasted 12 seats where 6 was possible.
- On the 8 demo-sized services it matched the optimal covers in 4, and was
  1.3 % to 3.6 % below in the other 4. Waste and zones were optimal in 2 of 8.
- Running 20,000 or 50,000 iterations instead of 5,000 on the four 60-party
  services changed little (we tried it once: 2 of 4 improved by 1 to 3 covers,
  the others not at all), so the search is stuck in local optima rather than
  short of time. That is a limit of the move set, see below.
- The two exact methods always agreed, which is a useful check on each other.

## 5. Limits

- **Local optima on busy services.** The local search only accepts moves that
  are not worse, so it cannot climb out of a local optimum. On demo-sized
  services this costs up to 3.6 % of covers in our measurements. Restarts with
  other seeds or simulated annealing (as in the events optimiser) are the
  obvious next step; we kept the simpler rule because it is easy to explain
  and never returns a worse plan than the greedy start.
- **Combinations.** At most 3 tables, all in one `combine_group`, and no spare
  table. `min_party` is checked only for single tables. Physical adjacency is
  assumed to be captured by the group: we do not check distances.
- **High chairs** need one table in the choice that accepts one; we do not
  count how many high chairs fit, and the children are part of the party size.
- **Zones are soft and come last.** A zone wish never beats one wasted seat,
  which is the rule in the contract, but a manager might prefer otherwise.
- **One day only.** Slots are indexes inside one day; a service across
  midnight would need the router to renumber slots.
- **Walk-ins.** `whatif_walkin` only moves the parties that block the chosen
  tables and re-seats each with a best fit; it does not re-optimise the whole
  service. The walk-in's id must not clash with a party id in the plan.
- **Exact solvers are for small services.** Branch and bound grows
  exponentially; CP-SAT proved optimality on all our 60-party services within
  about 1.5 s, but that is a measurement on our generator, not a guarantee.
- **Unverified literature claims** are marked in section 2.
