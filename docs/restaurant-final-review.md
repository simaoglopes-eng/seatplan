# Restaurant integration review and rehearsal — 2026-11-13

Review scope: `git diff main...HEAD`, with main at `767fbb6`, the integrated
Claude work at `31cc829`, and Codex verification/corrections on
`martim/restaurantes-impl`. The approved restaurant spec and AGENTS.md are the
reference; [Claude's notes](claude-ambiente-notas.md) explain implemented scope.
Two read-only reviews used the code-review skill's Standards and Spec axes.
Findings below describe the reviewed snapshot; regression fixes followed.

Final verification after recovery: 837 pytest, 355 Vitest and 60 Playwright
passed, plus Ruff, typecheck, build and 86/0 contrast. Every measured 60-table
HTTP response was below 300 ms. The full spec remains incomplete as shown below.

## Standards

1. **P1, fixed: invalid opening references caused 500.** The request accepted
side 59 on a four-sided room; feature calculation then indexed outside the
outline. CONTRACT §10 requires invalid references to be refused. Structural
checks now cover existing side, wall span, glass coverage, overlap, view tags
and main-door type before persistence. Tests assert 422 and unchanged version.
2. **P2, fixed: malformed sunlight clocks caused 500.** Arbitrary strings
passed the schema and reached `time.fromisoformat`. Clock fields now accept
bounded HH:MM values; malformed values return the existing 422 envelope.

No additional heuristic smell was reported as a concrete violation. Protected
event paths were checked by the guard and changed-path inventory. Tool-enforced
formatting/lint issues were left to Ruff/typecheck.

Standards total: **2 findings**, worst P1 accepted reference causing 500; both
corrected and covered by HTTP regressions.

## Spec

1. **P1, fixed: opening constraints missing.** Spec §6.4 requires openings
within their walls without overlap. Same correction as Standards 1/2.
2. **P1, fixed: cross-room joins.** Spec §6.1 gives each room its own floor.
Identical combine-group labels in different rooms previously produced a joined
choice and overstated maximum party. The service adapter now scopes groups
by room; real diner maximum-party and hold tests reject that combination.
3. **P1, fixed: invalid published edits stayed bookable.** Spec §5.3 requires
an error-free plan and foundation decision 8 closes invalid configurations.
Invalid edits after explicit publication now save atomically as draft. Existing
booking view/cancellation still work; repair and publish are required to reopen.
4. **P2, fixed: missing server winding normalization.** Spec §6.1 explicitly
requires it. Reversing points now reverses curve signs and maps opening side
and offset, preserving physical windows; straight/semicircular cases are tested.
5. **P2, fixed: room area limits absent.** Spec §6.3 requires 4–5000 m².
Browser/server validators now test inclusive boundaries and report a draft
error outside them, preventing publication.

No additional feature was classified as unrelated scope creep. Missing discovery,
public profile, chair management and email/demo wiring remain incomplete.

Spec total: **5 findings**, worst P1 invalid public booking configuration; all
five corrected. This does not establish completion of the missing dependencies.

## Additional regressions discovered during rehearsal

- A one-table restaurant could publish but every hold received 429 because
half of one rounded down to zero. The allowance is now at least one; larger
venues retain the old cap. Existing cap tests remain intact.
- Damaged local draft shapes could crash the editor before the saved server
layout opened. They are now ignored safely. Storage denial remains tolerated.
- Invalid saves now explain the move to draft. The full phone editor workflow
uses real taps with touch enabled, including save and reload.

## Acceptance matrix

| Spec / plan area | Evidence | Status / remaining work |
|---|---|---|
| Owner identity, isolation, profile, photos (5–6,12–13) | Owner account/profile/photo pytest, Vitest and browser flows | Implemented; remote tile policy still requires real deployment check |
| Rooms, shapes, openings, north, fixtures, zones, tables (7–17) | Mirrored geometry/validation tests, owner rooms HTTP, editor browser suites | Implemented core, including version conflict, protected deletion and implicit legacy room |
| Recovery (18) | roomPersistence tests, two-tab browser save conflict | Implemented; key/debounce differ from spec; separate 30 s checkpoint pending |
| Hours / publish (19) | publishing pytest; owner-publish and owner browser suites | Implemented; invalid edits of explicitly published venues become draft |
| Mobile workspace (20) | 390×844 real-touch creation: 10×7 m, curve, two windows, north, bar, eight tables, save/reload | Acceptance flow passes; full-screen canvas/pullable property sheet and physical phone rehearsal pending |
| Solar / ambience / preview (21–24) | Known solar cases, pure ambience tests, API isolation, editor and diner day/night browser flows | Implemented; no deployment latency guarantee |
| Discovery and slug profile (25–26,29) | Source/route inventory | **Absent; blocks search journey, discovery axe and 100-restaurant <500 ms benchmark** |
| Booking rooms, wishes, chair (27–32) | Map/API tests, optimiser compatibility tests, browser day/night/chair/concurrent holds | Implemented core; staff-map chair marker pending; staff service-plan/what-if ignore time-specific wishes |
| Chair management (33) | Existing manage link shows chosen chair | `Change seat` UI/API absent |
| Email and demo integration (34–36) | Standalone restaurant PNG pixel tests | Renderer implemented; actual restaurant mail/profile/photo/ambience wiring and four new demo venues absent |
| Final editor/booking checks (37) | 60-table/120-chair HTTP benchmark; simultaneous 201/409 holds; 1440/390 booking | Complete for implemented journey; every measured response must be <300 ms |
| Owner/discovery checks (38) | 1440/390 publication/unpublish/manage/axe | Owner part verified; discovery part **blocked**, not approved |
| Final review/docs/rehearsal (39) | This matrix, current OpenAPI, full checks in night report | Review performed; whole platform is **not ready to call complete** |

## Rehearsal actually run

`npm run e2e` starts a fresh seeded backend and the built frontend with real
security headers. No response mocks or shared demo mutation are used by the new
restaurant fixture. The following directed rehearsal also passed:

```powershell
cd frontend
$env:E2E_PYTHON=(Resolve-Path '..\.venv\Scripts\python.exe').Path
npm run e2e -- e2e/owner.spec.ts e2e/room-editor.spec.ts
```

Six checks cover owner publication at 1440/390, preserving an existing booking
after unpublish, the invalid-edit explanation, complete touch room persistence,
two-tab conflict recovery and saved light preview. Separate diner tests cover
rooms, sun/night cursor, chair through confirmation/manage and competing real
holds with an available alternative. Screenshots were inspected at both sizes;
axe ran on review, room, map, chair, draft-not-found and management states.

For Martim's manual walkthrough, use `/owner`, then an owned restaurant's
profile/photos/hours/rooms/review. Open its working `/r/{public_id}` booking link,
select a date/time, inspect rooms/light, hold a table, choose/skip a chair and
confirm. Open the manage link, then unpublish from the owner screen and verify
the old booking remains accessible. Do not demonstrate `/restaurants/{slug}`
or claim the new email artwork is sent: those integrations are missing.

## Limits of this verification

SQLite and local Chromium only. PostgreSQL, a physical phone's compass/pinch
behaviour, remote OpenStreetMap tiles under production headers, deployed
cold-start/network latency and actual mail delivery were not verified. The
two explicitly authorized flaky tests are documented; no other isolated rerun
may be used to turn a full-suite failure green. No deployment, push or PR was
performed. Detailed commands, timings, commits and gaps are in the
[night report](superpowers/plans/relatorio-noite.md).
