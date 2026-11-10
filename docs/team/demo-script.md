# Six-minute demo script

| Item | Value |
|---|---|
| Presentation date | ______ (not set yet) |
| Deployed URL | ______ (no deployment done yet, see issue 1 in `issues.md`) |
| Who holds `DEMO_KEY` for a reset | ______ |
| Who brings the backup laptop with the local run ready | ______ |
| Rehearsed (date, time taken) | ______ |

The demo uses the seed data from `backend/app/seed/`. It is the same every
time (one `random.Random(2026)`), except the secret links and the venue ids,
which are new after every reset. So **always open links from the home page**,
never from a bookmark.

What the seed contains (checked by running `python -m app.seed.run` into a
temporary database on 2026-11-10):

- "Ana and Bruno's wedding" at "Quinta do Lago Azul": 10 round tables (T1 to
  T10), 80 seats, 72 guests, 43 already seated, names shown as "first name
  plus last initial". T1 is reserved for family, two seats of T2 for VIPs, the
  first two seats of T9 and T10 are accessible, one seat of T5 is blocked.
- "Lisbon Data Summit" at "Nova Auditorium": rows A to J, each cut into three
  sections of 5 seats, 150 seats, 116 guests, 58 seated, row A for speakers.
- "Casa Lumen" restaurant: 18 tables in Window, Quiet room, Terrace and Bar,
  lunch Tuesday to Sunday 12:00 to 15:00, dinner every day 19:00 to 23:00,
  bookings for today and the next three days, a closed day 21 days ahead
  ("Private event").

Home page link names (from `frontend/src/pages/demoLinks.ts`): Wedding
Organiser, Wedding Guest Choosing, Wedding Guest Seated, Wedding Guest
Accessible, Conference Organiser, Conference Guest Choosing, Conference Guest
Seated, Conference Speaker, Restaurant Booking, Restaurant Staff.

## Before you go on stage (10 minutes before)

1. Reset the demo so every link is fresh (deployed site; the key is private):

   ```bash
   curl -X POST -H "X-Demo-Key: <the key>" https://<deployed URL>/api/demo/reset
   ```

   Locally, use the backup plan below instead.
2. Open the home page. Open these in separate browser windows, signed in where
   needed (the session is kept per tab, so sign in inside the tab you will
   use):
   - Window 1: **Wedding Guest Choosing** (Simao)
   - Window 2: **Wedding Guest Accessible** (Simao)
   - Window 3: **Wedding Organiser**, signed in as `organiser@example.com` (Federico)
   - Window 4: **Restaurant Booking** (Sergio)
   - Window 5: **Restaurant Staff**, signed in as `staff@example.com` (Martim)
3. Zoom the browser to 125 % so the room can read it.
4. Locally the demo passwords are the public defaults in
   `backend/app/seed/run.py`. On a deployment they are private: never type
   them on a projected screen, sign in before you start.

## The script

### 0:00 to 0:30, introduction (Simao)

Say: "SeatPlan lets people choose their own seat on a live map. One core, two
uses: events and restaurants. The database makes double booking impossible,
and an optimiser fills the gaps and explains why."

Click: nothing yet. Show the home page with the demo cards.

### 0:30 to 1:45, an attendee picks a seat (Simao)

Window 1 (Wedding Guest Choosing; in today's seed this is Zeca Queiroz, group
"Family 1").

1. Click **Yes, I will be there**.
2. People step: type `Alice` in "Search by name", tick **Alice N.**, click
   **Continue with 1 person**. Say: "names are shortened because the
   organiser chose that privacy mode".
3. Seat step: point at **Recommended for you** and read one reason aloud. In
   the seed, Alice Neves (same family group) sits at T2; check the suggestion
   in rehearsal.
4. Click the first recommendation, then **Hold this seat for 5 minutes**.
   Point at the countdown.
5. Click **Confirm this seat**.

Say: "the seat is mine now. If two people confirm at once, the database lets
only one in."

### 1:45 to 2:15, two people want one seat (Simao)

Window 2 (Wedding Guest Accessible, needs a step-free seat). In today's seed
the only free accessible seat is T9 seat 1.

1. In window 2, click T9 seat 1, then **Hold this seat for 5 minutes**.
2. Switch to window 1 (or 3): within a second or two the seat shows as held.

Say: "the hold is a row in the database with a UNIQUE rule. Our test sends 30
requests for one seat at the same moment: exactly one wins, 29 get 'seat
taken'." (`backend/tests/test_holds.py`, line 209.)

### 2:15 to 3:15, the organiser fills the rest (Federico)

Window 3 (Wedding Organiser, signed in).

1. Show the map with real names and the list of guests who have not chosen.
2. Open the **Optimise** tab, click **Preview auto-fill**. Point at the score
   table. Say: "this is only a preview, nothing moved".
3. Click **Apply this plan**, then click **Undo**. Say: "undo never touches a seat a
   guest chose themselves."
4. If time allows: **Run exact check**. Say: "on one table we compare with the
   proven best plan and show the gap".

Say: "same data and same seed always give the same plan, because all
randomness comes from one seeded generator and we stop after a fixed number
of iterations."

### 3:15 to 4:30, a diner books a table (Sergio)

Window 4 (Restaurant Booking, Casa Lumen).

1. Date: tomorrow. Party size: 2. Click **See free times**.
2. Click a dinner time marked **Available** (19:00 to 23:00).
3. Map: point at the recommended table and its reason (for example "Exact fit
   for 2"). Click **Choose for me** (or **Hold table ...** on a free table).
   Point at the 5-minute countdown.
4. Details: name `Demo Diner`, email `demo.diner@example.com`. Click
   **Confirm booking**.
5. Show the confirmation and the manage link. Say: "we store only a hash of
   this link, so even we cannot read it back."

### 4:30 to 5:30, staff run the floor (Martim)

Window 5 (Restaurant Staff, signed in).

1. **Floor** tab: point at the statuses (free, reserved, seated, finishing).
   The booking Sergio just made is in the list (pick its date and time if the
   floor shows now).
2. Click **New walk-in**, party size 4, **Find a table**, then
   **Seat at ...**. Say: "the walk-in gets the best free table for its whole
   stay."
3. **Dashboard** tab: covers, utilisation, no-show rate. Say: "the overbooking
   number is only a suggestion".
4. If time allows: **Optimise** tab, **Preview moves**.

### 5:30 to 6:00, close (Federico)

Say: "443 backend tests, 133 frontend unit tests and 12 browser tests passed
when we ran them on 10 November (re-run before the presentation). What we have not done yet: a real
deployment, real email sending, screen reader and usability tests. They are
in our issue list."

## If something goes wrong

| Problem | What to do | Who |
|---|---|---|
| A link says "This link does not work" | Someone reset the demo. Go back to the home page and open the link again | speaker |
| "That seat was just taken" in step 0:30 | Good: say "this is the conflict handling" and pick another recommendation | Simao |
| No dinner time is Available tomorrow | Pick the day after, or a lunch time (Tuesday to Sunday) | Sergio |
| Walk-in says no table is free | Use party size 2, or show the what-if answer instead | Martim |
| Sign-in fails | Use the other prepared tab, or switch to the local backup | speaker |
| The deployed site or the network fails | Switch to the backup laptop (below). Say what happened in one sentence, do not debug on stage | backup holder |

## Backup plan: run everything locally

Prepare this the day before on the backup laptop, while you still have
network (`npm ci` and `pip install` need the internet; after that the demo
runs offline on `localhost`).

One-time setup (from the repository root):

```bash
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt -r backend/requirements-dev.txt
cd frontend && npm ci
```

On the day, terminal 1 (backend):

```bash
cd backend
rm -f seatplan.db
export DEMO_MODE=1
export DEMO_KEY=local-demo-key
../.venv/bin/python -m app.seed.run
../.venv/bin/uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000
```

Expect "Demo data ready." and the list of links, then uvicorn saying it is
running on `http://127.0.0.1:8000`. Undo: press Ctrl+C; the database is the
file `backend/seatplan.db` (ignored by git), delete it to start again.

Check it (terminal 3):

```bash
curl http://127.0.0.1:8000/api/health
```

Expect `{"status":"ok","database":"ok",...}`.

Terminal 2 (frontend):

```bash
cd frontend
npm run dev
```

Open <http://localhost:5173>. The home page lists the demo links.

Reset between rehearsals without restarting (terminal 3):

```bash
curl -X POST -H "X-Demo-Key: local-demo-key" http://127.0.0.1:8000/api/demo/reset
```

Local demo accounts: `organiser@example.com` and `staff@example.com`, with the
public default passwords written in `backend/app/seed/run.py` (they only work
on local SQLite with `DEMO_MODE=1`).

### Last resort: no working browser at all

Show the tests instead, from `backend/`:

```bash
../.venv/bin/python -m pytest tests/test_e2e_slice.py -v
```

This walks both verticals through the real HTTP API, starting from a demo
reset (2 tests). Then open `backend/tests/test_holds.py` at line 209 and
explain the 30-thread race.

A recorded video of the demo would be a third backup: not made yet.
