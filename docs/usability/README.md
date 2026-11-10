# Usability test kit

Status on 2026-11-10: **no session has been run yet.** Everything in this
folder is a plan and a set of blank forms. Nothing here is a result.

## What is in the folder

| File | Use it for |
|---|---|
| `script.md` | What the facilitator says and the tasks, one block per persona |
| `consent.md` | Read and sign before each session |
| `observer-sheet.md` | One copy per task per tester, filled in by the note-taker |
| `sus.md` | The System Usability Scale questionnaire, given after the tasks |
| `results-template.md` | EMPTY. To be filled after real sessions |

## Plan

- **Who:** 2 testers per persona (8 people in total) is the target. Personas
  are in `docs/personas.md`. Testers must not be on the team and must not have
  seen the app before.
- **Roles:** one facilitator (talks), one note-taker (only writes). Swap roles
  between sessions so all four of us (Sergio, Martim, Simao, Federico) do both.
- **Length:** about 30 minutes per tester.
- **Device:** a phone for the attendee and diner tasks, a laptop for the
  organiser and staff tasks, as in the personas.
- **What we measure:** task success (yes, with help, no), time on task, number
  of errors, what the tester said, and the SUS score.

## Before each session

1. Start the backend and the frontend as in `README.md` (Quick start), with
   `DEMO_MODE=1`.
2. Reset the demo so every tester starts from the same data:
   `POST /api/demo/reset` with the `X-Demo-Key` header (see `README.md`,
   Demo accounts). It returns fresh links.
3. Open the home page and copy the link the task needs (for example "Wedding
   Guest Choosing", "Wedding Organiser", "Restaurant Booking", "Restaurant
   Staff"). These labels come from `frontend/src/pages/demoLinks.ts`.
4. For organiser and staff tasks, sign in first with the demo account, so the
   tester does not have to type a password (sign-in is not what we test).
5. Print one consent form, one SUS form and enough observer sheets.

## Rules for the facilitator

- Do not help unless the tester is stuck for 2 minutes or asks to stop. Write
  down every hint you give.
- Answer questions with a question: "What would you expect?"
- Ask the tester to think aloud.
- Never record a name in the results; use a code such as P1, P2.

## After the sessions

Fill `results-template.md` with what really happened. If a session did not
happen, leave its row empty. Do not copy numbers from the design targets in
`docs/ux-events.md` or `docs/ux-restaurant.md` into the results.
