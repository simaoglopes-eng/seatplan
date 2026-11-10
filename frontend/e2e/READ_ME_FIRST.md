# e2e: browser tests

**Purpose.** Drive the real app in headless Chromium, the way a guest, an
organiser, a diner and a member of staff would use it.

**How a run works.** `npm run e2e` (from `frontend/`) starts Playwright with
`playwright.config.ts`, which first starts two servers:

1. `servers/backend.mjs` makes a temporary folder, seeds a new SQLite database
   there with the demo data (`python -m app.seed.run`) and starts uvicorn on
   port 8765. When the run ends it deletes the folder.
2. `servers/frontend.mjs` builds the frontend into another temporary folder and
   serves it on port 4317 with the `vercel.json` security headers, forwarding
   `/api` to the backend.

Then the tests run one at a time. Results and traces go to the system
temporary folder, never into the repository.

**Files.**

| File | What it checks |
|---|---|
| `attendee.spec.ts` | Pick, hold and confirm a seat; a second attendee cannot take it |
| `mobile.spec.ts` | The attendee flow at 390 x 844 with touch (the `mobile` project) |
| `organiser.spec.ts` | Auto-fill preview, apply, undo |
| `restaurant.spec.ts` | Diner books and cancels through the manage link; staff seat a walk-in |
| `accessibility.spec.ts` | axe-core scan (WCAG 2.1 A and AA) of six main pages |
| `fixtures.ts` | Demo links, sign-in, and the rule that fails a test on a page error or a CSP violation |
| `attendee-steps.ts` | Attendee steps shared by the desktop and phone tests |

**Likely questions.**

- *Why one test at a time?* All tests share one database. Running them in a
  fixed order keeps every run the same.
- *Why not `vite preview`?* Its `/api` proxy always points at port 8000, which
  a developer's own backend may be using. Our small server lets the tests use
  their own ports and also sends the production security headers.
- *Where do the demo links come from?* `GET /api/demo/links`, which only
  answers when `DEMO_MODE=1`, as it is for this temporary backend.
