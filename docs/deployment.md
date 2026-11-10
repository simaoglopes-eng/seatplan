# Deployment

**Status on 2026-11-10: not done yet.** SeatPlan has never been deployed. No
Vercel project, no Neon database and no Resend account exist for it. Every
step below is a plan, marked "not done yet". When a step is done, change its
status line to the date and the name of the team member who did it, and note
anything that differed from this page.

The target is the one described in the contract (section 2):

- **one Vercel project** that serves the static frontend and runs
  `api/index.py` as one Python function,
- **one hosted Postgres database** from Neon, added through the Vercel
  Marketplace,
- **Resend** for real email, only after a sending domain is verified,
- **GitHub Actions** for the email cron (already in
  `.github/workflows/email-cron.yml`).

What the repository already contains for this (checked in the code today):
`vercel.json` (build command `cd frontend && npm ci && npm run build`, output
`frontend/dist`, function `api/index.py` with `maxDuration` 30, rewrites for
`/api/*` and the single-page app, security headers), `requirements.txt` (the
pinned runtime packages the function installs) and `api/index.py`.

## Step 0. Before you start

Status: **not done yet**

- [ ] All checks in [`runbook.md`](runbook.md), section 7, pass on `main`, and
      CI is green.
- [ ] One person owns the deploy and has access to the GitHub repository, a
      Vercel account and (for real email) a domain whose DNS they can edit.
- [ ] Decide the demo passwords, `SECRET_KEY`, `DEMO_KEY` and `CRON_SECRET`
      now and keep them in a password manager, never in the repository or a
      chat. Make each secret with:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

## Step 1. Create the Vercel project from the GitHub repository

Status: **not done yet**

1. In Vercel, add a new project and import the SeatPlan GitHub repository.
2. Leave the root directory as the repository root. `vercel.json` sets the
   build command and output folder, so the framework settings are not needed.
3. Node version: CI uses Node 22; choose 22 in the project settings.
   `frontend/package.json` has no `engines` field, so the project setting
   decides (not checked on a real project yet).
4. Python version: there is no `.python-version` file and no
   `requires-python`. Vercel's Python docs (checked today with the Vercel
   documentation search) say it then uses Python 3.12, which is what the
   project needs.
5. Do not press deploy yet, or let the first deploy fail: the database is not
   there, and `config.py` stops the app with
   `DATABASE_URL is missing. Set it to the Postgres URL on Vercel.`

## Step 2. Add Neon Postgres through the Vercel Marketplace

Status: **not done yet**

1. In the Vercel project, open the Storage or Marketplace section and add
   **Neon** (Postgres). With the Vercel CLI the same thing is
   `vercel integration add neon` (from the Vercel CLI docs, checked today).
2. Connect it to the project for the environments you use (at least
   Production). The CLI docs show that the integration creates a variable
   called `DATABASE_URL` (its `--prefix` example turns it into
   `NEON2_DATABASE_URL`). Other variables it may add were not checked.
3. Check in the project's environment variables that `DATABASE_URL` exists
   for Production.
4. Nothing to change in the code for a pooled URL: `config.py` turns
   `postgres://` into the psycopg 3 driver and drops query options that libpq
   does not know (such as `pgbouncer=`). This was tested against a local
   Postgres 16.2 with such a URL (README test report), not against Neon.

## Step 3. Set the environment variables in Vercel

Status: **not done yet**

Set these for **Production** in the Vercel project. Every name is read by
`backend/app/config.py`, except the two demo passwords, which are read by
`backend/app/seed/run.py`.

| Variable | Value to use | Why it matters |
|---|---|---|
| `DATABASE_URL` | Set by the Neon integration (step 2) | Without it the app refuses to start on Vercel |
| `SECRET_KEY` | A new 64-character hex secret (step 0) | Signs login sessions. Required on Postgres, and the app refuses to start with fewer than 32 characters. Must be the same on every instance, otherwise people are logged out at random |
| `FRONTEND_ORIGIN` | The site address, for example `https://seatplan-demo.vercel.app` (no trailing slash) | CORS allows only this origin |
| `PUBLIC_BASE_URL` | The same site address | Links inside emails start with it |
| `DEMO_MODE` | `1` for the graded demo, otherwise leave unset | Turns on `/api/demo/links` and `/api/demo/reset` |
| `DEMO_KEY` | A new secret | The only way to call `POST /api/demo/reset` (header `X-Demo-Key`). Empty means nobody can reset |
| `DEMO_ORGANISER_PASSWORD` | A private password | The public local defaults never apply on Postgres |
| `DEMO_STAFF_PASSWORD` | A private password | Same as above |
| `CRON_SECRET` | A new secret | The email cron sends it as `X-Cron-Secret`. Empty rejects every call |
| `EMAIL_PROVIDER` | `console` until step 6, then `resend` | `console` only writes one log line per email |
| `RESEND_API_KEY` | Empty until step 6 | Needed only for `resend` |
| `EMAIL_FROM` | Until step 6: `SeatPlan <noreply@example.com>`; after: an address on your verified domain | Resend sends only from a verified domain |
| `EMAIL_ALLOWLIST` | Comma-separated addresses of the team's own test inboxes | Everyone else is stored as `skipped`, so a demo never mails a stranger |

Variables you set in Vercel apply to the next deployment, so redeploy after
changing one.

## Step 4. Create the tables and seed the demo (from your own computer)

Status: **not done yet**

The app never creates tables on Postgres, so this must be done once before the
first real use, from a laptop with the repository and the `.venv`:

```bash
cd backend
DATABASE_URL='PASTE THE NEON URL HERE' SECRET_KEY='PASTE THE SAME SECRET_KEY AS ON VERCEL' ../.venv/bin/python -m app.seed.migrate
```

Expected output: `Tables are ready.` Safe to run again.

Then, for the demo only:

```bash
cd backend
DATABASE_URL='PASTE THE NEON URL HERE' SECRET_KEY='PASTE THE SAME SECRET_KEY AS ON VERCEL' DEMO_MODE=1 DEMO_ORGANISER_PASSWORD='PASTE IT' DEMO_STAFF_PASSWORD='PASTE IT' ../.venv/bin/python -m app.seed.run
```

It prints the demo links (`/e/...`, `/organiser/...`, `/r/...`, `/staff/...`).
They contain secret tokens: share them only with the people who need them.
Type the values in your own terminal; do not paste them into chats or files
that get committed.

## Step 5. Deploy and check

Status: **not done yet**

1. Deploy (push to `main`, or press Redeploy in Vercel). Vercel builds the
   frontend with `vercel.json` and installs `requirements.txt` for the function.
2. Check, replacing the address with yours:

```bash
curl -i https://seatplan-demo.vercel.app/api/health
```

   Expect HTTP 200 and `"status":"ok","database":"ok"`. HTTP 503 with
   `"degraded"` means the function runs but cannot reach the database.
3. In a browser: open the home page, follow one attendee link to a confirmed
   seat, make one restaurant booking, open the staff floor. Open the same map
   in two windows and check that a change in one shows in the other.
4. Record whether the live stream arrives at once or late. This is the open
   question "does Vercel buffer the stream?" (see [`risk-log.md`](risk-log.md)).
   If changes arrive late, nothing breaks; the page still polls when the
   stream fails.
5. Check the security headers: `curl -I` on the home page should show
   `Content-Security-Policy`, `X-Frame-Options: DENY`,
   `Referrer-Policy: no-referrer` and `Strict-Transport-Security`.

## Step 6. Real email with Resend

Status: **not done yet**

Until this step is done, keep `EMAIL_PROVIDER=console`. Bookings still work;
emails are written to the outbox and logged in one line each.

1. Create a Resend account (free plan: 100 emails a day and 3,000 a month,
   checked on 2026-11-10 in [`email.md`](email.md)).
2. Add a sending domain you own. Resend shows the DNS records to add (an SPF
   TXT record, a DKIM record and an MX record for bounces, or CNAME records for
   newer domains; see [`email.md`](email.md)). Add them at your DNS provider
   and wait until Resend says the domain is verified. Without a domain of our
   own this step cannot be done.
3. Create a Resend API key with sending access only.
4. In Vercel set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY=<the key>`,
   `EMAIL_FROM=SeatPlan <noreply@your-domain>` and keep `EMAIL_ALLOWLIST` to
   the team's own inboxes. Redeploy.
5. Make one booking to an address on the allowlist and run the cron by hand
   (step 7). Check the email arrives and `GET /api/emails/log` shows `sent`.

## Step 7. Turn on the email cron

Status: **not done yet**

The workflow file is already in the repository and runs every 15 minutes. It
does nothing until two **repository secrets** exist (GitHub: Settings,
Secrets and variables, Actions):

| Secret | Value |
|---|---|
| `SEATPLAN_URL` | The deployed site, for example `https://seatplan-demo.vercel.app` (no trailing slash) |
| `CRON_SECRET` | Exactly the same value as `CRON_SECRET` in Vercel |

Then press "Run workflow" on `email-cron` in the Actions tab once. A green run
means the endpoint answered 2xx; a red run usually means a wrong secret (401)
or a wrong URL. Why GitHub Actions and not a Vercel cron: `email-cron.yml`
explains that on the Hobby plan a Vercel cron may run at most once a day.

## Step 8. After the deploy

Status: **not done yet**

- Write the result in the README test report and in
  [`CHANGELOG.md`](CHANGELOG.md): date, address, what was checked, what failed.
- Change every "not done yet" above that is now done.

## Rolling back

Status: **not done yet** (never needed so far)

- **Code:** in Vercel, promote the previous working deployment back to
  Production, or revert the commit on `main` and let it deploy again.
- **Database:** tables are only ever added, never changed by the app, so an
  older deployment still works with a newer database. There is no automatic
  backup set up by this project; check what the Neon plan offers before the
  demo.
- **Demo data:** `POST /api/demo/reset` with the `X-Demo-Key` header wipes all
  data except accounts and rate-limit counters, and seeds the demo again.

## What will still be unverified after a first deploy

Write these down honestly in the report even after deploying: real touch
devices, screen readers, how many people the database plan can serve at once,
and the gitleaks scan (it runs only in CI).
