# How we used AI, and how we own the result

Team: Sergio, Martim, Simao, Federico. Written on 2026-11-10.

## The short version

The code, tests and most documents in this repository were written with an
**AI coding assistant (Claude Code, by Anthropic)**, directed by our team. We
decided what to build, wrote down the rules it had to follow, split the work
into parts, and asked for reviews and fixes. The assistant typed most of the
code. We are responsible for all of it, and before the presentation each of
us must be able to explain, change and test our part without help.

If any of us also used another AI tool, add it here with what it was used for:

| Who | Tool | Used for |
|---|---|---|
| | | |

Check the course rules on AI use before submission. They are not stored in
this repository, so we have not checked this statement against them yet.

## What the team decided (direction)

- **The product and its limits:** two verticals on one core, the stack, the
  data model and the API, all written down first in `docs/CONTRACT.md`.
- **Rules for every part of the code**, also in the contract: the database
  decides double booking (section 4), optimisers are pure functions with a
  seed (section 6), security rules (section 7), small functions and comments
  that explain why (section 8), fake people only.
- **Splitting the work** into modules with clear owners, so parts could be
  built in parallel without editing each other's files (contract section 3).
- **Every change to the plan is written down** with a date and a reason in
  `docs/decisions-log.md`.

## How the work was reviewed

What the repository itself shows:

- **Adversarial reviews.** Two dated sections of the decisions log, "fixes
  after the adversarial review (platform)" and "(events, restaurants,
  frontend, verification)", list what reviews found and how it was fixed:
  for example the demo reset could be called with a public password, demo
  links with raw tokens sat in the audit log, and a lock-order deadlock gave
  a 500 instead of a calm 409.
- **Integration check.** The "integration" section of the decisions log
  records running the real backend, calling every endpoint the frontend uses
  and comparing the real JSON with the TypeScript types; the differences found
  are listed there.
- **Honest "not verified" notes** wherever something was not checked
  (`README.md`, `docs/email.md`, `docs/product-spec.md` section 6).

What is still missing: a review by each of us, line by line, of our own files.
That is the job of the next section.

## How it was tested

- 41 backend test files with pytest and hypothesis, including race tests with
  30 and 20 threads, and an end-to-end test through the real HTTP API
  (`backend/tests/test_e2e_slice.py`).
- 15 frontend test files with vitest, and 12 Playwright browser tests in
  `frontend/e2e/`.
- Gap reports that compare the heuristics with proven optima
  (`backend/scripts/`).
- CI runs lint, formatting, tests, build, colour contrast, dependency audits
  and a secret scan on every pull request (`.github/workflows/ci.yml`).

On 2026-11-10 (final verification) we ran: `pytest` gave `443 passed, 1
warning`; `ruff check .` gave `All checks passed!`; `npm test` gave
`Tests  133 passed (133)`; `npm run e2e` gave `12 passed`.

Tests show the code does what the tests ask. They do not show that we
understand it. Only we can show that.

## Why this matters for the walkthrough

An examiner can open any file and ask "why is this here?". "The assistant
wrote it" is not an answer. For every function in our list we need to say
what it does, why it is built that way, and what would break without it.

## What each member must do to own it

Do these for **your own file list** in `docs/team/tasks.md`. Tick them in the
GitHub issue "Each member does the 'own it' tasks" (issue 27 in
`docs/team/issues.md`).

1. **Read every file in your list**, top to bottom. Mark every line you cannot
   explain and ask the team (or look it up) until you can.
2. **Draw the data flow** of your main feature on paper: the click, the
   frontend function, the endpoint, the service function, the database rows.
   Keep the drawing for the presentation.
3. **Answer your questions** in `docs/team/walkthrough-qa.md` out loud without
   reading, then to a teammate who asks follow-ups.
4. **Break a test on purpose.** Pick one important rule in your files (for
   example the UNIQUE constraint, the hold expiry check, the seed, the score
   order), change it on a branch, run the tests, and see which test fails and
   why. Then undo the change.
5. **Make one small real change yourself**, without the assistant writing it:
   pick a small issue from `docs/team/issues.md` (for example 4, 5, 6 or 24),
   write the code and a test, open a pull request, and let a teammate review
   it.
6. **Run the tests for your files** and be ready to say what one of them
   proves.
7. **Be honest in the presentation.** If you are asked something you cannot
   answer, say so and say where in the code you would look. Do not invent.

### Per person, the one thing to master first

| Person | Master first | Where |
|---|---|---|
| Simao | How a hold becomes a seat, and why two holds cannot coexist | `backend/app/core/holds.py`, `backend/app/events_service/seating.py` lines 30 to 134 |
| Federico | How the events score is computed and how annealing changes it | `backend/app/optimiser/events_score.py`, `events_anneal.py` lines 77 to 160 |
| Sergio | How a table hold covers every slot, and how `table_slots` blocks double booking | `backend/app/restaurant_service/holding.py`, `diner_flow.py`, `models.py` lines 378 to 388 |
| Martim | Why the restaurant score is a tuple, and how the local search uses it | `backend/app/optimiser/restaurant_model.py` lines 77 to 84, `restaurant_assign.py` lines 259 to 309 |

## Data and privacy

- All people in the demo data and tests are invented; every email ends in
  `@example.com` (contract section 7).
- Each member should confirm here that they never gave the assistant real
  personal data: ______
- Secrets live in environment variables only; the repository holds none, and
  CI runs a secret scan.
