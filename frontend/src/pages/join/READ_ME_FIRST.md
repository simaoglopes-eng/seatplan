# Shared event link: READ ME FIRST

## Purpose

The pages behind an event's shared link `/j/:token`
(`docs/guest-accounts.md`, sections 7 and 10). Anyone with the link is a
**visitor**: they see the event and the live seat map, with names filtered by
the server exactly as attendees see them, but they cannot hold or confirm a
seat. To choose a seat they create a guest account, or sign in to one.

| Route | Page | Who |
|---|---|---|
| `/j/:token` | `JoinPage.tsx` | Visitor, or a signed-in account holder ("Join this event") |
| `/j/:token/register` | `RegisterPage.tsx`: the form, then the 6-digit code | Visitor |
| `/j/:token/sign-in` | `JoinSignInPage.tsx`: sign in, then `POST /j/{token}/join` | Account holder |

## Key files

| File | Job |
|---|---|
| `JoinPage.tsx` | Loads `GET /j/{token}` (no session sent), shows every state: loading, open, full (with "I was invited: create my account"), deadline passed, link off (403), link wrong (404), too many requests (429), network error. Refreshes with `useLive`; a failed refresh says "The map may be out of date" |
| `JoinPanel.tsx` | Opens under the map when a free seat is picked. It never holds the seat; its heading takes focus and Escape closes it |
| `RegisterPage.tsx` | Step 1 `POST /j/{token}/register`, step 2 `POST /guest/verify` with the `signup_id` the register answer gave (the code works only with it). `validateRegister` checks the form first; errors sit next to each field and in a focused summary box. `demo_code` may be missing even in the demo |
| `JoinSignInPage.tsx` | The shared sign-in form, then the join call |
| `joinOutcome.ts` | Pure: after a join, which page to open and what to say (`joined`, `linked`, `already_member`, `event_full`, `link_closed`, `deadline_passed`, `removed`; a 403 `forbidden` from the join call means `removed`) |
| `wantedSeat.ts` | Keeps the seat a visitor picked (sessionStorage, per event), so the seat page can offer it after sign-up |
| `join.css` | Layout of the status panel and the seat panel; colours and sizes from `tokens.css` |

Shared pieces live in `pages/account/` (sign-in form, problem box, privacy
text, password toggle) and `pages/events/` (event header, map frame).

## Data flow

```
GET /j/{token} --> JoinPage --> SeatMap (selectable: free seats, only while joining is open)
                                   | pick a free seat
                                   v
                   JoinPanel + rememberWantedSeat()     (no hold, no write)
                                   |
        "Create an account" -> RegisterPage -> POST /j/{token}/register (202, same answer for everyone)
                                            -> POST /guest/verify (account + session + join)
                                            -> joinOutcome -> /my/{event} or /my with a message
```

## Three likely walkthrough questions

**Why can a visitor not hold a seat?**
Holding a seat would let anyone with a forwarded link block seats without
saying who they are. The visitor page never calls a hold route, and the
backend has none under `/j/`. The seat a visitor picks is only remembered in
this tab, and the seat page checks it is still free before offering it.

**Why does the code step say "or we sent a sign-in reminder instead"?**
The register answer is the same whether or not the address already has an
account, so nobody can use the form to find out who has one. The page cannot
know which email went out, so it says both.

**How does the form help someone using a screen reader?**
Every field has a visible label and a hint tied with `aria-describedby`. On
submit, the problems appear next to their fields and in a box with
`role="alert"` that takes focus. When the step changes, focus moves to the new
`h1`. The "Send a new code" countdown is not read out every second; only "You
can ask for a new code now" is announced when it ends.
