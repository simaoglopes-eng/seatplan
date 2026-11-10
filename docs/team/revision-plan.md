# What to improve next

Ordered by **value for the grade and the users** first, then by **effort**
(small effort first when the value is the same). The issue numbers point to
`docs/team/issues.md`. Effort is our own rough guess, not a measurement:
small = an afternoon, medium = one or two days, large = more than that.

## Do first: high value

| # | What | Why it matters | Effort | Owner | Issue |
|---|---|---|---|---|---|
| 1 | Each member explains their files out loud and makes one small change with a test | The walkthrough is about us, not the code. We must own what an assistant helped write (`ai-use.md`) | medium | everyone | 27 |
| 2 | Re-run every check in `README.md` on the final commit and update the numbers | The test report must be true on the day; old numbers are not evidence | small | everyone, Martim collects | 25 |
| 3 | First real Vercel deployment, then check the live stream and both exact checks there | The app was never deployed. A working URL makes the demo safer and removes the biggest "not verified" | medium | Simao, Martim | 1, 2, 17 |
| 4 | Confirm CI is green on GitHub, gitleaks included | Proves the checks run outside one laptop | small | Martim | 14 |
| 5 | Rehearse `demo-script.md` twice, once with the local backup | Six minutes goes fast; the backup must be practised, not only written | small | everyone | 26 |
| 6 | Run the usability sessions with the kit in `docs/usability/` | We have design targets but no results with real people | medium | everyone | 12 |

## Next: medium value

| # | What | Why it matters | Effort | Owner | Issue |
|---|---|---|---|---|---|
| 7 | Fix the two stale decisions-log entries and add the map payload to the contract (done on 2026-11-10) | Examiners read the docs; a doc that contradicts the code costs trust | small | Sergio, Martim | 6, 21 |
| 8 | Retry the live stream after falling back to polling | One short network blip should not turn a page into a poller for good | small | Simao | 5 |
| 9 | Sweep expired holds in the email cron | Keeps the `holds` table small; easy test to write | small | Simao | 4 |
| 10 | Screen reader pass and a real phone and tablet | Accessibility is a stated goal; today it is only designed, not tested | medium | Martim, Simao | 10, 11 |
| 11 | Real email through Resend, and measure the cron delay | Emails are part of the product; needs a verified domain first | medium | Simao | 3, 23 |
| 12 | Let the restaurant local search sometimes accept worse plans | The gap report on 2026-11-10 showed it matched the optimal covers in only 4 of 8 demo-sized services | medium | Martim | 15 |
| 13 | Explain the one events instance with a 3.7 % gap | A clear finding in `docs/optimiser-events.md` is good walkthrough material | small | Federico | 16 |

## Later: lower value for this course, or large effort

| # | What | Why it waits | Effort | Owner | Issue |
|---|---|---|---|---|---|
| 14 | Refresh open diner pages when the schedule changes | Rare in a demo | small | Martim | 18 |
| 15 | Remove the pytest warning | Cosmetic; comes from a library | small | Sergio | 24 |
| 16 | Decide on the rate-limit window | Already documented as a known weak spot | small | Sergio | 8 |
| 17 | Send real neighbour ids to the attendee map | The browser guess works for round tables in the demo | medium | Simao | 20 |
| 18 | Offer a cancelled table to the next waitlisted person | Product decision first | medium | Sergio | 22 |
| 19 | Extend the browser tests (live updates, hold expiry, editor); the suite itself exists since 2026-11-10 | Each new test needs two pages or a long wait | medium | Martim | 13 |
| 20 | Database migrations | Only needed once the schema changes after the first deploy | large | Sergio | 7 |
| 21 | Many businesses on one install (venue checks, email log per organiser) | Out of scope for a single-team demo (`docs/product-spec.md` section 5) | large | Sergio, Simao | 9 |
| 22 | Stays that cross midnight | Needs slot renumbering across two dates | large | Sergio | 19 |

## Rules while improving

- One issue per branch, small pull requests, CI green before merging.
- Change code only together with a test that could fail.
- If a change departs from `docs/CONTRACT.md`, write a dated entry in
  `docs/decisions-log.md` in the same pull request.
- Never write a result we did not see. "Not done yet" is a fine answer.
