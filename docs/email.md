# Email

How SeatPlan sends confirmations, changes, cancellations, reminders and
waitlist offers, and why it is built this way. Code: `backend/app/mail/` and
`backend/app/routers/emails.py`. Tests: `backend/tests/test_mail_*.py`.

Labels used below: **[verified 2026-11-10]** means we read it in the official
documentation on that date (link given). **[not verified]** means it comes from
general knowledge and should be checked before relying on it.

## 1. Architecture

```
route (booking, seat, waitlist)
   |  enqueue(): INSERT into email_outbox, same transaction as the booking
   v
email_outbox table  <---- GET /api/emails/log (organisers, masked recipients)
   ^
   |  every 15 min: GitHub Actions -> POST /api/internal/email/process (X-Cron-Secret)
   |
process_due()  -> allowlist check -> Provider.send() -> Resend HTTP API (or console log)
```

- **templates.py**: pure functions, plain values in, `EmailParts(subject,
  body_text, body_html)` out. Every user value is HTML-escaped in the HTML
  version; both versions carry the manage-or-cancel link, the sender name
  ("SeatPlan") and a footer saying why the person received the email and how
  to stop. The HTML is one column, max 560 px wide, inline styles only, no
  images, and the link is also printed as text in case the button does not work.
- **ics.py**: the calendar invite (section 4).
- **providers.py**: `Provider` protocol with `send(message) -> provider id`;
  `ConsoleProvider` (logs one line, never the body, because the body holds a
  secret link) and `ResendProvider` (httpx, 10 s timeout, key never logged).
- **outbox.py**: `enqueue()` and `process_due()` (section 2).

Why an outbox instead of sending inside the request: a booking must not fail or
hang because the email service is slow, and a stored row can be retried,
logged and shown to organisers. Because `enqueue()` does not commit, a booking
that rolls back leaves no email behind.

## 2. Idempotency and retries

**One row per email.** Every email has an `idempotency_key` such as
`booking-confirmed-<public id>`. The column is UNIQUE and `enqueue()` uses
`INSERT ... ON CONFLICT DO NOTHING`, so calling it twice adds one row.

**One send per row, even with two processors.** Status flow:

```
queued --claim--> sending --ok--------------> sent
                     |----not on allowlist--> skipped
                     |----error, tries left-> queued (later)
                     |----error, 5th try----> failed
```

`_claim()` runs `UPDATE email_outbox SET status='sending', next_attempt_at=now+10min
WHERE id=:id AND status IN ('queued','sending') AND next_attempt_at <= :now`
and commits. Two processors that picked the same row both send this UPDATE;
the database applies them one after the other, the first moves
`next_attempt_at` into the future, so the second matches 0 rows and moves on.
Only the processor whose UPDATE changed 1 row sends. Tested with two threads,
real sessions and a file SQLite database (`test_two_processors_at_once_send_each_email_once`);
removing the `next_attempt_at` condition makes that test fail (checked).

**Crash safety.** The 10 minute lease means a row left in `sending` by a
crashed processor is picked up again later. That one case could send twice
(the crash may have happened after the provider accepted the email), so we
also pass the idempotency key to Resend as the `Idempotency-Key` header, which
Resend remembers for 24 hours **[verified 2026-11-10]**.

**Backoff.** After a failed try, `attempts` goes up by one and the row waits
5, 10, 20, then 40 minutes (`5 min * 2^(attempts-1)`). The fifth failure marks
it `failed` and stops. `last_error` keeps the reason (max 500 characters,
never the API key). Because the cron runs every 15 minutes, the real gaps are
rounded up to the next run.

**Reminders.** A reminder is a row whose `next_attempt_at` is in the future:
a day before the start, or two hours before when that has passed, or none.
Restaurant reminders use `restaurant_service/emails.py`; event reminders use
`mail/reminders.py`, where `sync_event_reminder()` keeps one row per guest per
event (key `event-reminder-<event public id>-<guest id>`). A seat change
rewrites that row while it is still waiting; a release or an erase marks it
`skipped`; a sent reminder is never touched.

## 3. Demo-safety rules

1. **Allowlist.** Only addresses listed in `EMAIL_ALLOWLIST` (comma-separated,
   case-insensitive) are ever passed to a provider. Every other row becomes
   `skipped` with the reason in `last_error`. An empty list means nobody gets
   email. The rule holds for the console provider too (one rule, no exceptions).
2. **Fake people only.** Seed data uses `@example.com` addresses, which can
   never receive mail. For a live demo, add the presenters' own addresses to
   the allowlist, or Resend's test addresses such as `delivered@resend.dev`
   **[verified 2026-11-10, https://resend.com/docs/dashboard/emails/send-test-emails]**.
3. **Console by default.** `EMAIL_PROVIDER` defaults to `console`; real
   sending needs `EMAIL_PROVIDER=resend` and `RESEND_API_KEY` set on purpose.
4. **The process endpoint is secret.** `X-Cron-Secret` is compared with
   `hmac.compare_digest` (same time whatever the input). An empty
   `CRON_SECRET` rejects every call. 30 calls per minute per IP at most.
5. **The log hides addresses.** `/emails/log` shows `an***@example.com`.

## 4. Calendar invites (RFC 5545 and RFC 5546)

Rules checked in the RFC text on 2026-11-10 (https://www.rfc-editor.org/rfc/rfc5545.txt,
https://www.rfc-editor.org/rfc/rfc5546.txt):

| Rule | Section | How `ics.py` follows it |
|---|---|---|
| Lines SHOULD NOT be longer than 75 octets; fold with CRLF + one space | RFC 5545 3.1 | `fold_line()` counts UTF-8 bytes, never cuts a character in half |
| TEXT escapes: `\\` for backslash, `\;`, `\,`, `\n` for a line break | RFC 5545 3.3.11 | `escape_text()` (backslash first) |
| UTC times end in `Z`; no TZID on UTC values | RFC 5545 3.3.5 (form 2) | `format_utc()`; naive datetimes are refused |
| VEVENT needs DTSTAMP and UID exactly once | RFC 5545 3.6.1 | always written |
| VEVENT STATUS is TENTATIVE, CONFIRMED or CANCELLED | RFC 5545 3.8.1.11 | CONFIRMED, or CANCELLED for a cancellation |
| METHOD names the iTIP method of the object | RFC 5545 3.7.2 | PUBLISH, or CANCEL |
| PUBLISH requires ORGANIZER | RFC 5546 3.2.1 | ORGANIZER always written |
| CANCEL requires DTSTAMP, ORGANIZER, SEQUENCE, UID (UID of the original); STATUS must be CANCELLED to cancel the whole event | RFC 5546 3.2.5 | same UID, higher SEQUENCE, STATUS:CANCELLED, ATTENDEE included |

UID is `<kind>-<public id>@seatplan.example.com` (`make_uid`), stable per
booking or seat, so a calendar app updates the existing entry instead of
adding a new one. The domain on the right follows the recommendation of RFC
5545 3.8.4.7 **[not re-read on 2026-11-10]**. How each calendar app (Gmail,
Outlook, Apple Calendar) treats a METHOD:PUBLISH or CANCEL attachment was
**[not verified]** on real clients.

## 5. Provider choice

We use **Resend** over plain HTTPS with `httpx` (contract section 2: no vendor SDK).

What we verified about Resend on 2026-11-10:

- `POST https://api.resend.com/emails`, header `Authorization: Bearer <key>`;
  body fields `from`, `to` (string or list, max 50), `subject`, `html`, `text`;
  answer `{"id": "..."}`. Optional `Idempotency-Key` header, max 256
  characters, kept 24 hours. (https://resend.com/docs/api-reference/emails/send-email)
- Every request needs a `User-Agent` header, otherwise 403; default rate limit
  10 requests per second per team; 429 when exceeded.
  (https://resend.com/docs/api-reference/introduction)
- Attachments: a list of objects with `filename` and `content` (Base64), or
  `path` for a hosted file; at most 40 MB per email after Base64.
  (https://resend.com/docs/dashboard/emails/attachments and the send-email page).
  The send-email page says the content type is derived from the filename when
  not set; the exact name of the field that would set it was **[not verified]**,
  so we do not send one and name the file `invite.ics`.
- Free plan: 100 emails per day and 3,000 per month; the daily quota resets at
  midnight UTC. (https://resend.com/docs/knowledge-base/account-quotas-and-limits)
- "You must add and verify at least one domain to send emails with Resend",
  and the domain must be one you own. (https://resend.com/docs/dashboard/domains/introduction)
  Whether an account without a domain can still send test emails to its own
  address from a shared Resend sender was **[not verified]**.

Short comparison (only what we checked):

| Provider | Free tier | Checked |
|---|---|---|
| Resend | 100/day, 3,000/month; simple JSON API; idempotency header | **[verified 2026-11-10]** |
| Postmark | "Test your integration with 100 emails/month" | **[verified 2026-11-10]** postmarkapp.com/pricing |
| Brevo | free plan exists; daily limit | **[not verified]**: pricing page did not load |
| SendGrid | free offer | **[not verified]**: pricing page redirected without content |
| SMTP (e.g. a university or Gmail account) | depends on the account | **[not verified]**; also needs a long-lived connection and stored password, a poor fit for a serverless function |

Why Resend: the most free volume of the options we could verify, a one-call
JSON API that a beginner can read in `providers.py`, and a built-in
idempotency header that matches our outbox design.

## 6. SPF, DKIM and DMARC

- **SPF** (TXT record on the sender domain): lists which servers may send mail
  for the domain. Receivers compare the sending server with that list.
- **DKIM** (TXT or CNAME record with a public key): the provider signs each
  email; receivers check the signature with the public key in DNS, which
  proves the email was not changed and really comes from the domain.
- **DMARC** (TXT record at `_dmarc.<domain>`): tells receivers what to do when
  SPF or DKIM fail (nothing, spam folder, reject) and where to send reports.

Resend's domain page lists an SPF TXT record, a DKIM TXT record and an MX
record for bounce feedback, and says domains created after August 2026 may get
CNAME records instead **[verified 2026-11-10, https://resend.com/docs/dashboard/domains/manage-domains]**.

What the team **can** do without owning a domain: run everything with the
console provider, see every email in the outbox and `/emails/log`, run all
tests, and show the confirmation page with its link. What it **cannot** do:
pass SPF, DKIM or DMARC for an address like `noreply@example.com`, because
only the owner of a domain can publish its DNS records. Sending real email
with Resend needs a verified domain (above). A cheap domain, or a subdomain
the university lends us, would fix this; buying one is a decision for the
team, not for the code.

## 7. When email fails: the fallback

Email is a convenience, never the only way to reach a booking:

- The booking or seat confirmation page always shows the manage link with a
  copy button, so a guest who never receives the email still has it.
- A failed email does not undo the booking: the outbox row is saved with the
  booking and retried 5 times; `last_error` and `/emails/log` show what happened.
- The organiser can generate a new personal link for a guest
  (`POST /events/{eid}/guests/{gid}/new-link`) and pass it on by hand.

The confirmation pages belong to the frontend and routers owned by colleagues;
this section records the agreement, the code is theirs.

## 8. Scheduler

`process_due()` needs something to call it regularly, including for reminders
that are due at a set time.

What we verified in the Vercel documentation on 2026-11-10
(https://vercel.com/docs/cron-jobs/usage-and-pricing, now at
`/docs/schedules/cron-jobs/usage-and-pricing`, last updated 2026-07-15):

- Hobby (free) plan: 100 cron jobs per project, **minimum interval once per
  day**, scheduling precision per hour (plus or minus 59 minutes).
  "Cron expressions that would run more frequently will fail during deployment."
- Pro: once per minute. Cron Jobs are described as a legacy feature that will
  be migrated to Vercel Schedules.

So a Vercel cron on the free plan could send reminders up to a day late. We use
a **GitHub Actions scheduled workflow** instead (`.github/workflows/email-cron.yml`):
every 15 minutes plus a manual "Run workflow" button, calling
`POST /api/internal/email/process` with `SEATPLAN_URL` and `CRON_SECRET` from
repository secrets. What we verified in the GitHub docs on 2026-11-10
(https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows):

- the shortest interval is once every 5 minutes;
- runs "can be delayed during periods of high loads";
- scheduled workflows only run on the default branch;
- in a public repository they are disabled after 60 days without activity.

Whether GitHub Actions minutes are free for this repository depends on whether
it is public or private and on the account plan **[not verified]**; each run
takes a few seconds.

## 9. Environment variables used

`CRON_SECRET`, `EMAIL_PROVIDER` (`console` or `resend`), `RESEND_API_KEY`,
`EMAIL_FROM` (for example `SeatPlan <noreply@your-domain>`), `EMAIL_ALLOWLIST`,
`PUBLIC_BASE_URL` (for links built by the callers).
