# Running the floor: guide for restaurant staff

The staff pages need a login. Staff accounts can open every restaurant; an
organiser account only their own. All times are the restaurant's local time.

## Live floor

Pick a date and time (default: now). Every table shows one status:

| Status | Meaning |
|---|---|
| Free | Nobody has it at this time |
| Reserved | A confirmed booking has it; the guests have not arrived yet |
| Seated | The guests are at the table |
| Finishing | The guests are on dessert or paying; the table frees soon |

Below the map is the list of the day's open bookings with their tables.

## Changing a booking's status

For each booking choose: seated, finishing, completed, no-show or cancelled.

- **Completed**, **no-show** and **cancelled** give the table back at once, so
  it can be offered to someone else. After that the booking cannot be reopened.
- **Cancelled** also emails the diner and offers the table to the first
  matching person on the waitlist.

## Walk-ins

Enter the party size (and accessibility or high chairs if needed). SeatPlan
seats them at the best free table for their whole stay (it starts at the
current quarter hour). You may also pick the table yourself. If nothing is
free you get a message; use the what-if planner below.

## Moving a booking and combining tables

Choose one or more tables for a booking. SeatPlan checks the same rules as
for diners: the party must fit, tables can only be joined when they share a
combine group (at most three), accessibility and high-chair needs must be met,
and the tables must be free for the whole stay. Joining tables this way is how
you seat a large party.

## What-if for a walk-in

Ask "where would a party of 6 go at 20:00?" without changing anything. The
answer is either a free table, or the cheapest set of moves that makes room:
which bookings would move and to which tables, named by the guest's name and
the table labels. Bookings the diner chose themselves and parties already
seated are never moved.

## Re-plan a service

Over an evening, bookings that SeatPlan placed automatically can end up on
tables bigger than they need. "Re-plan" asks the optimiser to place again the
bookings of one service (for example Friday dinner) whose diners did not pick
a table:

1. **Preview.** You see who would move where, and covers seated and wasted
   seats before and after. Nothing changes yet.
2. **Apply.** A second, explicit click writes exactly the plan you saw. If
   something changed in the meantime (a new booking, a cancellation), you are
   asked to preview again.

Never moved: bookings whose diner chose the table, parties already seated or
finishing, bookings of another service, and tables a diner is holding right
now. The plan is used only if everyone keeps a table and it wastes fewer
seats; otherwise the preview says there is nothing to improve.

## How good is the planner? (exact check)

"Exact check" takes the first bookings of a service (8 by default, at most 12,
so it stays fast), plans them with the fast optimiser and with an exact solver
that proves the best possible plan, and shows both with the gap: covers and
wasted seats the fast plan loses compared with the best one. A gap of 0 means
the fast plan was optimal on that slice.

## Dashboard

For a chosen date:

- **Covers**: guests expected (confirmed, seated, finishing or completed),
  guests really seated (seated, finishing or completed: they came in),
  no-shows and cancellations. Each service also shows its covers seated.
- **Utilisation per service**: booked seat-minutes divided by available
  seat-minutes. A party of 4 sitting 90 minutes uses 360 seat-minutes; the
  available amount is all seats times the length of the service.
- **No-show rate**: over the 90 days before the date, no-shows divided by
  finished bookings (completed plus no-show).
- **Overbooking suggestion**: expected covers times the no-show rate, rounded
  down. With 40 guests booked and a 10 % no-show rate, about 4 seats will
  probably stay empty, so you could accept about 4 more. This is **only a
  suggestion**: SeatPlan never overbooks by itself.

## Schedule

The schedule has three parts, saved together:

- **Service periods** per weekday: name, start and end, the minutes between
  seating times (a multiple of 15), and the covers cap (how many guests may
  arrive at one seating time).
- **Turn times**: how long a party of up to N people stays.
- **Blackout dates**: days the restaurant is closed, with a reason diners see.

Changing the schedule does not move existing bookings.
