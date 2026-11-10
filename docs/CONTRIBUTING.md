# Contributing to SeatPlan

This guide is for the four of us: Sergio and Martim (restaurants), Simao and
Federico (events), and anyone who joins later. It repeats the rules of
[`CONTRACT.md`](CONTRACT.md) that matter when you change code.

## 1. Before you write code

- Read the part of the contract your change touches, and the
  `READ_ME_FIRST.md` in the folder you are about to edit.
- **Edit only the files your task owns** (contract section 3). If you need a
  change in someone else's file, ask them, or open a pull request they review.
- If your change disagrees with the contract, fix one of the two in the same
  pull request and add an entry to [`decisions-log.md`](decisions-log.md):
  date, what changed, why.

## 2. Branches

- `main` is what gets deployed. Once a Vercel project exists (not done yet,
  see [`deployment.md`](deployment.md)), every push to `main` deploys.
- Never push straight to `main`. Make a short-lived branch from an up-to-date
  `main`, one topic per branch:

```bash
git switch main
git pull
git switch -c restaurants/waitlist-offer-text
```

- Branch names: `<area>/<short-topic>`, where area is `events`,
  `restaurants`, `core`, `frontend`, `docs` or `ci`.
- Keep a branch small enough to review in one sitting. Rebase or merge `main`
  into it before asking for review.

## 3. Commits

- One logical change per commit, with a message in the imperative that says
  what and why: `Refuse a hold after the change deadline (contract 5)`.
- Never commit `.env`, databases (`*.db`), logs or screenshots. `.gitignore`
  already blocks most of them; CI also runs a gitleaks secret scan.

## 4. Pull request checklist

Copy this into the pull request description and tick each line.

```markdown
- [ ] I changed only files my task owns (or the owner reviewed this PR)
- [ ] `cd backend && ../.venv/bin/ruff check .` passes
- [ ] `cd backend && ../.venv/bin/ruff format --check .` passes
- [ ] `cd backend && ../.venv/bin/python -m pytest` passes
- [ ] `cd frontend && npm run typecheck && npm test && npm run build` pass
- [ ] `cd frontend && npm run contrast` passes (if I changed colours)
- [ ] New behaviour has a test that would fail without my change
- [ ] Any change to an endpoint: docs/openapi.json exported again (docs/api.md)
- [ ] Any change to models.py: docs/data-model.md updated, and I wrote down
      how existing Postgres databases get the change (migrate adds only new tables)
- [ ] Any deviation from CONTRACT.md is in docs/decisions-log.md
- [ ] No secrets, real names or real emails (fake names, @example.com only)
- [ ] READ_ME_FIRST.md of the folder still tells the truth
```

CI (`.github/workflows/ci.yml`) runs all the checks above plus `pip-audit`,
`npm audit --audit-level=high` and gitleaks on every pull request. A pull
request is merged only when CI is green and one other team member approved it.

## 5. Code style (contract section 8)

- **Small modules with one job.** Functions under about 40 lines.
- **Type hints everywhere** in Python; strict TypeScript in the frontend.
- **Comments explain why, not what.** The code already says what.
- **No dead code, no clever one-liners.** Every line must be explainable in the
  live code walkthrough.
- **Each package has a `READ_ME_FIRST.md`:** purpose, key functions, data flow,
  three likely walkthrough questions with answers.
- Python formatting and lint are decided by ruff (`backend/pyproject.toml`:
  line length 100, target Python 3.12). Do not argue with the formatter.

## 6. Rules that protect users (contract section 7)

- Secrets come only from environment variables through `config.py`.
- Only SQLAlchemy queries with bound parameters. No SQL built from strings.
- Every request body is a Pydantic model with length limits; unknown fields are
  refused.
- Public endpoints call `security.rate_limit(...)` first.
- Compare token hashes; a wrong and a revoked token give the same 404.
- Other attendees never receive email, dietary or accessibility data. Names
  pass through `core/privacy.py`.
- Never use `dangerouslySetInnerHTML` in React.
- **Double booking is the database's job.** If you add a new kind of booking,
  add a UNIQUE constraint and catch the violation as 409; never "check, then
  insert" without the constraint behind it.
- The optimiser stays pure: no database and no FastAPI imports in
  `backend/app/optimiser/`.

## 7. Adding a dependency

The allowed backend runtime dependencies are listed in contract section 2.
Ask the team before adding another, pin its exact version in
`requirements.txt` (or `frontend/package.json`), and say why in the decisions
log.

## 8. Writing docs

Plain British English that a first-year student can read aloud. Every number
must come from the code or from a command you ran, with the date. If something
was not done (for example the Vercel deploy), write "not done yet".
