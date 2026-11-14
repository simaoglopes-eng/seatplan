# UX v3, Claude's half: report

Branch `claude/ux-v3` (on top of `claude/ux-v2`). Nothing is pushed. The other half (discovery and the staff floor) is Codex's, on `codex/ux-v3-discovery-ops`.
Capture numbers are the ones in `SeatPlan_Prompt_Redesign_UX.md` and the `seatplan-screenshots` folder.

## What is done

| Group | Captures | What changed |
|---|---|---|
| Base | all Restaurants routes | `design/restaurant-theme.css`: white page, petrol blue action, amber for sun, one sans family, 12 px cards, 10 px buttons. Switched on by route in `PageShell`; events keep the linen look. Contrast check covers both looks (172 checks, 0 failures). |
| Public page | 031, 032, 055-057 | Name, price, place and a "Book a table" button first; the booking right after; then About, Hours, Find us. Short cover and one row of thumbnails on a phone. (033, the photo dialog, was not changed.) |
| Time | 034 | When the time asked for in a link is gone, the closest bookable times are marked "Closest". |
| Table | 020, 027, 028, 035-040 | One card per table (Recommended, room, reasons, light, view) with "Hold table R1 & continue" and a quiet "Choose for me"; a "Use suggested table" link; when the suggestion is in another room the card says so and offers "Show table R1 in River hall", never a hold from the wrong room; key Available / Selected / Unavailable, then "Held for you"; the light preview under the plan ("Light preview at 21:30. Booking at 20:00."); the list marks the table on the card. On a phone the card comes first and holds the only main action (no second, disabled "continue" bar); "Change time" sits next to the date line. |
| Details | 041-046 | After the hold, the form has a summary line, the countdown, "Request a chair (optional)" (Choose / Change / Remove request) and Confirm booking. The step indicator and the heading say "Your details" from the moment a table is held, and stay there while a chair is requested (the chair picker is "Request a chair (optional)" with "Back to your details"). On a phone the form comes before the plan. |
| Confirmation | 047, 048 | "Booking confirmed" first, summary ("Chair requested"), "Manage booking" as the main action, "Copy private link" quiet with the address folded away. |
| Manage | 049-053, 059 | Summary first; three actions that open one section at a time; "Chair request" with "Chair request updated."; the cancel dialog says what is cancelled and starts on "Keep booking". |
| Owner | 016-018, 060, 061, 067-069, 083, 084, 086 | Owner sign-in words, Show password, create-account link; sign-up errors beside each field with a summary; My restaurants with one main action per state; Review and publish with Ready / Needs attention / Published, done checks folded, Unpublish asks first; cuisines "N of 3 selected"; "Step N of 6" on a phone. |
| Editor | 072, 073, 085 (chrome only) | A taller plan on a wide screen, the problem counters always in view, all seven tools reachable on a phone. The seven tools and their rules are untouched. |
| Photos | 064 | "Add photos" is a real button. |

## Review round (after the first report)

An outside review of the updated captures asked for four fixes; all four are in:
1. **027** one action on a phone: the bottom bar with "Pick a table to continue" is gone; the card's "Hold table R1 & continue" is the only main action, "Change time" is beside the date.
2. **037** the card follows the room on screen: in another room it offers "Show table R1 in River hall" (switches room), never a hold.
3. **041-046** Your details is the current step as soon as the hold starts (heading and indicator), including while the chair picker is open.
4. **060 / 083** the owner's sign-in has the Restaurants look on both paths: `/login?next=/owner...` (and `/staff...`) is now a Restaurants route, as `/owner/sign-in` already was; organiser sign-ins keep the Events look.
Also: capture 018 was a script mistake (it looked for the wrong button name), so the validation messages never showed; fixed in `take_screenshots.cjs`.
Still not done from that review: a one-screen chair picker inside the form (it is still its own view, but under the same step), and a more compact time block on the staff floor (Codex's half).

## Integration check (throwaway)

`claude/ux-v3` + `codex/ux-v3-discovery-ops` were merged in a separate worktree/branch (`claude/integration-check`, never pushed, `martim/restaurantes-impl` untouched). The merge is clean (no conflicts). On the merged tree: typecheck clean, vitest 487 pass, contrast 172/0, protected event paths unchanged, Playwright 83 pass (includes the events specs, Codex's discovery/staff specs, and a phone journey from a discovery time to confirmation with and without a chair request).
Codex's requests to Claude (`docs/ux-v3-pedidos-ao-claude.md`) were done on this branch: staff sign-in title ("Sign in to open the service floor"), "Chair requested: ..." in the staff panel, "at the selected time" in the what-if answer. The cumulative "Too many attempts" flake did not appear in two full runs of 83.

## Not done, and why

- **062, 063 (profile page):** only the cuisine counter and the reading width. Grouping "Contact and links" and the slug's URL and locked state needs the profile page split in two, which was left for a later pass.
- **065, 066 (opening hours):** the hours editor is `StaffSchedule`, shared with the staff Schedule tab. That file is Codex's (captures 096, 097), so it is not changed here. When Codex stacks the rows on a phone and adds a save bar, the owner's page gets the same.
- **074-082 (editor tools):** the tool panels are untouched on purpose (the seven tools must not change). Suggestions in the doc that need new editor behaviour (a "Show in plan" button, a placement palette with silhouettes, numeric north, a miniature in "Add room") are not done. The existing problem list already selects the objects it names.
- **060 (show password):** done on the owner entry only; the events sign-in is unchanged.
- **083, 084 (phone):** the owner home buttons stack on a phone; the toast position was not changed.
- **Instrument Sans** is not added (needs a font file and a CSP change); the stack stays `system-ui`.
- **Table list (036):** the plan, card and list agree on the table in front of the diner, but there is no Map / List switch.

## Checks

- Vitest: 63 files, 473 tests pass. Typecheck clean. Contrast: 172 checks, 0 failures.
- Playwright (whole suite): 75 passed after the review round; the new phone booking test `restaurant-mobile.spec.ts` passes too (76 in all).
- "After" captures: `C:\Users\marti\seatplan-screenshots-claude\` (102, same names as the originals; the script is `seatplan-screenshots\take_screenshots.cjs`).
- `scripts/check_forbidden_paths.py --base main`: "Protected event paths unchanged."
- Two root causes found on the way: dialogs faded their whole panel (opacity), so axe saw half-faded text in the filters drawer; and a few e2e specs depended on old words (they were updated with the change).
