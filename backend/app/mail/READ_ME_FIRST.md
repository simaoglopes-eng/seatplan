# backend/app/mail: read me first

## Purpose

Everything about email. A route never talks to an email service directly: it
writes the email into the `email_outbox` table, and a scheduled job sends it
later. Longer design notes, RFC references and the provider comparison are in
`docs/email.md`.

## Key functions

| File | Function | Job |
|---|---|---|
| `templates.py` | `booking_confirmation(...)` and 8 others | Return `EmailParts(subject, body_text, body_html)` from plain values |
| `templates.py` | `format_when(moment, timezone)` | UTC datetime to "Sat 14 Mar 2027, 19:30" in the venue's time |
| `ics.py` | `build_invite(...)`, `make_uid(kind, public_id)` | The `.ics` calendar invite text |
| `invites.py` | `calendar_invite(...)` | The invite every seat and booking email carries: sender from `EMAIL_FROM`, SEQUENCE that always grows |
| `outbox.py` | `enqueue(session, ...)` | Queue one email (does not commit) |
| `outbox.py` | `process_due(session, provider, now, batch=20)` | Send what is due; allowlist, retries, give-up |
| `reminders.py` | `sync_event_reminder(session, event=, guest=, seat_label=, link=)` | The event guest's reminder: queued with a seat, rewritten when the seat changes, cancelled (`skipped`) when it goes |
| `providers.py` | `ConsoleProvider`, `ResendProvider`, `provider_from_settings` | Hand one email to the log or to Resend |

## How a colleague sends an email (for example from `routers/bookings.py`)

```python
from app.mail import templates
from app.mail.ics import build_invite, make_uid
from app.mail.outbox import enqueue

parts = templates.booking_confirmation(
    booking.name,
    venue.name,
    templates.format_when(booking.start_at, venue.timezone),
    booking.party_size,
    table.label,
    manage_link,
)
invite = build_invite(
    uid=make_uid("booking", booking.public_id),
    start=booking.start_at,
    end=booking.end_at,
    summary=f"Dinner at {venue.name}",
    location=venue.name,
    description=manage_link,
    organizer_name="SeatPlan",
    organizer_email="noreply@example.com",
    attendee_email=booking.email,
)
enqueue(
    session,
    idempotency_key=f"booking-confirmed-{booking.public_id}",
    to_email=booking.email,
    kind="booking_confirmed",
    subject=parts.subject,
    body_text=parts.body_text,
    body_html=parts.body_html,
    ics=invite,
)
session.commit()  # the booking and its email are saved together
```

Reminders use the same call with a `send_after` time chosen by a "when" rule:
a day before the start; if that moment has already passed, two hours before;
if that has passed too, no reminder at all. Both verticals use the one
function that holds this rule, `reminder_time()` in `reminders.py`.
A change or cancellation email needs a new idempotency key (for example
`booking-changed-<public id>-<n>`), otherwise it counts as "already sent".

Event reminders work differently: one row per guest per event, key
`event-reminder-<event public id>-<guest id>`. The events code calls
`sync_event_reminder()` after every seat change; while the row is still
waiting it is rewritten in place (new seat, new time) instead of adding rows.

## Data flow

1. A route calls `enqueue()`, then commits together with its own change.
2. Every 15 minutes GitHub Actions calls `POST /api/internal/email/process`
   with the `X-Cron-Secret` header.
3. `process_due()` picks due rows, claims each one (`queued` to `sending`),
   skips addresses not on `EMAIL_ALLOWLIST`, sends the rest and records the
   result: `sent`, `queued` again with a later time, or `failed` after 5 tries.
4. Organisers read the result at `GET /api/emails/log`.

## Three likely walkthrough questions

**What stops a guest receiving the same confirmation twice?**
Two things. The `idempotency_key` column is UNIQUE, so a second `enqueue()` for
the same booking adds nothing. And before sending, a processor must win a
conditional UPDATE (`_claim`): the database applies competing UPDATEs one after
the other, and only the first still matches the WHERE clause.
`test_two_processors_at_once_send_each_email_once` runs two threads to prove it.

**What happens when Resend is down?**
`send()` raises, the row goes back to `queued` with `attempts + 1` and waits
5, 10, 20, then 40 minutes. After the fifth failure it becomes `failed` and the
error is kept in `last_error`. The booking itself was already saved, and the
confirmation page shows the manage link, so the guest is never stuck.

**Could the demo email a real stranger by accident?**
No. Only addresses listed in `EMAIL_ALLOWLIST` are ever handed to a provider;
every other row is marked `skipped`. An empty allowlist means nobody gets email.
