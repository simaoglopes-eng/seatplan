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
| `templates.py` | `account_seat_email(AccountSeat)`, `account_code`, `password_code`, `account_exists` | Guest account emails: the seat email with the picture (`cid:seatmap`) and the three code emails. None carries a secret link |
| `seat_picture.py` | `render_seat_picture(room, my_seat_id, seat_label, table_label)` | PNG of the room from above with the guest's seat marked. Pure; its inputs have no field for a person |
| `restaurant_picture.py` | `render_restaurant_picture(room, tables, seats, table_key, seat_key, room_name)`, `header_text`, `restaurant_layout` | PNG of a restaurant room from above for the confirmation email: real outline (curved or L-shaped), windows as a light blue line, doors as a gap, fixed items with their name, every table alike except the booked one (amber), the chosen chair marked. Inputs are the ambience engine's values (`app.ambience.models`), which have no field for a person. Reuses the event picture's canvas and marker; `seat_picture.py` is unchanged |
| `restaurant_templates.py` | `booking_email(kind, RestaurantBooking)`, `seat_line`, `picture_alt` | The restaurant booking emails (confirmed, changed, reminder): cover photo (remote image), "You're booked at ...", date/time/party, "Table 4 · Seat 2 (facing the window)", ambience sentences, the mini-map (`cid:seatmap`), address with map link, phone, manage link. Pure: every value arrives formatted from `restaurant_service/email_facts.py` |
| `png.py` | `encode_indexed(width, height, pixels, palette)`, `png_width(png)` | A tiny PNG writer (zlib, struct, binascii); no new dependency. `png_width` reads the width back, so the email's `<img width>` is never wider than the picture |
| `pixel_font.py` | `can_write`, `text_width`, `inked_pixels` | A 5 x 7 pixel font for the picture's labels |
| `templates.py` | `format_when(moment, timezone)` | UTC datetime to "Sat 14 Mar 2027, 19:30" in the venue's time |
| `ics.py` | `build_invite(...)`, `make_uid(kind, public_id)` | The `.ics` calendar invite text |
| `invites.py` | `calendar_invite(...)` | The invite every seat and booking email carries: sender from `EMAIL_FROM`, SEQUENCE that always grows |
| `outbox.py` | `enqueue(session, ...)` | Queue one email (does not commit) |
| `outbox.py` | `process_due(session, provider, now, batch=20)` | Send what is due; allowlist, retries, give-up; a finished row loses its personal links |
| `outbox.py` | `redact_links(text)` | Replace every `/b/`, `/e/`, `/a/` and `/j/` link with `[personal link removed]` (S9) |
| `outbox.py` | `send_now(session, provider, key, now)` | Send one row at once (code emails), with the same claim as the cron, so it never goes twice |
| `outbox.py` | `scrub_expired(session, now)` | Retention: blank words, invite and picture of finished rows older than `RETENTION_DAYS` (30) |
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
   A row that ends `sent`, `skipped` or `failed` has every personal link in
   its words, invite and error replaced by `[personal link removed]` (S9);
   a `queued` row keeps it, because the email still has to work.
4. The same cron call runs `scrub_expired()`: 30 days after `sent_at` (or
   after `next_attempt_at` when never sent) a finished row keeps only subject,
   recipient, status and times.
5. Organisers read the result at `GET /api/emails/log` (subject and error
   also pass through `redact_links()`).

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

**How is the seat picture made without an image library?**
`seat_picture.py` keeps one byte per pixel (an index into 8 colours) and fills
shapes one pixel row at a time; `png.py` packs the rows into a PNG with
`zlib`. Measured on 2026-11-10 (best of 5, a developer laptop): the demo
wedding took 10.3 ms and 3740 bytes, the demo conference 6.8 ms and 2635
bytes. `tests/test_seat_picture.py` allows 150 ms and 60 KB. PNG, not SVG,
because Gmail and Outlook do not show SVG in emails.

**Could the demo email a real stranger by accident?**
No. Only addresses listed in `EMAIL_ALLOWLIST` are ever handed to a provider;
every other row is marked `skipped`. An empty allowlist means nobody gets email.
That includes the sign-up codes of guest accounts (docs/guest-accounts.md, D7).
Once a code email is finished its words become `[code removed]`.
