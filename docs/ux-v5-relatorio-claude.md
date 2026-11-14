# UX v5, Claude's half (20-screen redesign): report

Branch `claude/ux-v5`, on top of `martim/restaurantes-impl` (feb90b1). Nothing is pushed.
The other half (lot 2 discovery and times: 001, 004, 021, 024, 026, 031, 034, 054; lot 5 staff: 088, 090, 091) is Codex's.
References: `SeatPlan_Redesign_20/mockups/*.png` (layout) and its `PROMPT_CODEX.md` (behaviour).

## Base

| What | Where |
|---|---|
| Ivory, dark green and terracotta look, serif headings (DM Serif Text, then Georgia), 8 px controls and 14 px surfaces. Only on Restaurants routes. Contrast: 172 checks, 0 failures. | `design/restaurant-theme.css` |
| Three stages on the booking pages: When, Table, Details. The confirmation ends them. A held table or a chair request already counts as Details. | `restaurant/BookingPage.tsx` |

## My nine screens

| ID | Screen | Captured at | Path checked | Material differences from the mockup |
|---|---|---|---|---|
| 027 | Table, phone | 390x844 | Link with a time -> plan, selected table and "Hold R1 & continue" in the first view; Map / List switch; room tabs; key; light as one line with "Explore" | The plan shows the neighbourhood of the suggested table, not the whole room: the shared map keeps a minimum zoom so targets stay tappable (it is also used by Events, so it was not changed). The page's own "Book a table" heading above the stage bar belongs to the public page (Codex, 031). |
| 038 | Light, desktop | 1440x900 | Plan and light in one card, preview moves without touching the booking time ("Booking stays at 20:00", "Preview 21:15"), card with "Why this table" | The photo of the view sits under the action instead of beside the title. |
| 041 | Held table and details | 1440x900 | Hold -> "Your details" with "Held for 5:00", summary band, fields, optional chair row, "Confirm booking"; "Your table" card with the plan, "Choose a different table", "Change date or time" | Labels keep the words "Name for the booking" and "Email" (the mockup says Full name / Email address) so existing tests and screen-reader names did not change. |
| 044 | Chair request, phone | 390x844 | Details -> "Choose a chair" -> pick on the plan or the list -> "Save chair request" or "Continue without a request"; back to the details with what was typed | The table is the shared seat map (real geometry), not the large drawn table of the mockup. Chair names are the real ones (R1-1), not C1. |
| 047 | Booking confirmed | 1440x900 | Confirm -> "Booking confirmed." with date, arrival, table, chair request; "Manage booking"; "Get directions" (when the restaurant has a map link); private link below; restaurant card beside it | The restaurant card needs the public page of the restaurant (photo and address): when it cannot be loaded the card shows only the name and the booking facts. |
| 049 | Manage booking | 1440x900 | Status, "Reservation details", "Make a change" (one panel at a time), cancel with a confirmation that starts on "Keep booking" | No mini plan of the room: the booking link's API gives no room geometry. The reference is the start of the booking id. |
| 061 | My restaurants | 1440x900 | Side menu, cards with photo, status, "Live on SeatPlan" or "Next: ..." (from the setup checks), one main action per state | The site header stays above the side menu (the mockup has no header). On the list the menu shows only My restaurants and Sign out, because the other steps belong to one restaurant. |
| 067 | Review and publish | 1440x900 | Two cards: what to fix (each with its link) above completed checks, and "Public listing" with "Preview listing" and "Publish restaurant" | The capture is of a published restaurant (all demo restaurants are); the blocked state (draft, "N blockers", disabled publish) is covered by unit tests. |
| 072 | Room editor | 1440x900 | Seven tools above the plan, inspector beside it, "Show in plan" for the first problem, save state as a chip | The "Room" select and "Add room" sit above the card, not inside it. The tools and their rules are untouched. |

Captures: `C:\Users\marti\seatplan-screenshots-claude-v5\lote1\` (027, 038, 041, 044, 047, 049, 061, 067, 072).

## Checks

- Vitest: 64 files, 487 tests pass. Typecheck clean. Contrast: 172 checks, 0 failures.
- Protected event paths: unchanged (`scripts/check_forbidden_paths.py`).
- Playwright, whole suite: 82 passed and 1 failed in the run after the last behaviour change; the failure (phone journey from discovery) passes alone, twice. Two phone specs failed once with "Too many attempts" (the API's 120 reads a minute per address, shared by the whole suite) and pass alone.
- New or updated e2e: `restaurant-mobile`, `restaurant-journey-mobile` (phone, with and without a chair), helper `holdTable` in `restaurant-fixture.ts`; the owner, editor and booking specs follow the new words.

## Not done

- Whole-room fit on a phone (see 027) and a room plan on the manage page (see 049): both need changes outside this half (the shared map, the API).
- The photo and address of the restaurant on the confirmation come from the public page of the restaurant, so a restaurant without a public page shows a card without a photo.
- Fonts: no DM Serif Text / DM Sans file is loaded (the stack falls back to Georgia and system-ui), as the font setup of the project is unchanged.
