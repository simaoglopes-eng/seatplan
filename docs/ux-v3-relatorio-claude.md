# UX v3, Claude's half: report

Branch `claude/ux-v3` (on top of `claude/ux-v2`). Nothing is pushed. The other half (discovery and the staff floor) is Codex's, on `codex/ux-v3-discovery-ops`.
Capture numbers are the ones in `SeatPlan_Prompt_Redesign_UX.md` and the `seatplan-screenshots` folder.

## What is done

| Group | Captures | What changed |
|---|---|---|
| Base | all Restaurants routes | `design/restaurant-theme.css`: white page, petrol blue action, amber for sun, one sans family, 12 px cards, 10 px buttons. Switched on by route in `PageShell`; events keep the linen look. Contrast check covers both looks (172 checks, 0 failures). |
| Public page | 031, 032, 055-057 | Name, price, place and a "Book a table" button first; the booking right after; then About, Hours, Find us. Short cover and one row of thumbnails on a phone. (033, the photo dialog, was not changed.) |
| Time | 034 | When the time asked for in a link is gone, the closest bookable times are marked "Closest". |
| Table | 020, 027, 028, 035-040 | One card per table (Recommended, room, reasons, light, view) with "Hold table R1 & continue" and a quiet "Choose for me"; "Use suggested table" and "Suggested: table X in <room>" links; key Available / Selected / Unavailable, then "Held for you"; the light preview under the plan ("Light preview at 21:30. Booking at 20:00."); the list marks the table on the card. On a phone the card stays at the bottom with its one action. |
| Details | 041-046 | After the hold, the form has a summary line, the countdown, "Request a chair (optional)" (Choose / Change / Remove request) and Confirm booking. The chair request no longer opens a separate step; the step indicator stays on "Your details". On a phone the form comes before the plan. |
| Confirmation | 047, 048 | "Booking confirmed" first, summary ("Chair requested"), "Manage booking" as the main action, "Copy private link" quiet with the address folded away. |
| Manage | 049-053, 059 | Summary first; three actions that open one section at a time; "Chair request" with "Chair request updated."; the cancel dialog says what is cancelled and starts on "Keep booking". |
| Owner | 016-018, 060, 061, 067-069, 083, 084, 086 | Owner sign-in words, Show password, create-account link; sign-up errors beside each field with a summary; My restaurants with one main action per state; Review and publish with Ready / Needs attention / Published, done checks folded, Unpublish asks first; cuisines "N of 3 selected"; "Step N of 6" on a phone. |
| Editor | 072, 073, 085 (chrome only) | A taller plan on a wide screen, the problem counters always in view, all seven tools reachable on a phone. The seven tools and their rules are untouched. |
| Photos | 064 | "Add photos" is a real button. |

## Not done, and why

- **062, 063 (profile page):** only the cuisine counter and the reading width. Grouping "Contact and links" and the slug's URL and locked state needs the profile page split in two, which was left for a later pass.
- **065, 066 (opening hours):** the hours editor is `StaffSchedule`, shared with the staff Schedule tab. That file is Codex's (captures 096, 097), so it is not changed here. When Codex stacks the rows on a phone and adds a save bar, the owner's page gets the same.
- **074-082 (editor tools):** the tool panels are untouched on purpose (the seven tools must not change). Suggestions in the doc that need new editor behaviour (a "Show in plan" button, a placement palette with silhouettes, numeric north, a miniature in "Add room") are not done. The existing problem list already selects the objects it names.
- **060 (show password):** done on the owner entry only; the events sign-in is unchanged.
- **083, 084 (phone):** the owner home buttons stack on a phone; the toast position was not changed.
- **Instrument Sans** is not added (needs a font file and a CSP change); the stack stays `system-ui`.
- **Table list (036):** the plan, card and list agree on the table in front of the diner, but there is no Map / List switch.

## Checks

- Vitest, typecheck, contrast: see the last lines of the run below.
- Playwright: whole suite.
- `scripts/check_forbidden_paths.py --base main`: "Protected event paths unchanged."
- Two root causes found on the way: dialogs faded their whole panel (opacity), so axe saw half-faded text in the filters drawer; and a few e2e specs depended on old words (they were updated with the change).
