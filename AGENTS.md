# SeatPlan restaurant work

Never work on main. Use martim/restaurantes-impl for the approved overnight work.
One task and one verified commit at a time. No push or PR without Martim's instruction.

Spec: docs/superpowers/specs/2026-11-13-restaurantes-plataforma-design.md.
Plan: docs/superpowers/plans/2026-11-13-restaurantes-plano.md.
Update docs/superpowers/plans/relatorio-noite.md after each task.
Read each folder's READ_ME_FIRST.md before editing. Tests first for pure logic and security.

Never edit event paths: frontend/src/pages/events/, frontend/src/pages/editor/,
frontend/src/pages/join/, frontend/src/pages/account/, backend/app/events_service/,
backend/app/routers/events.py, attendee.py, guest_*.py and visitor.py.
Importing existing pure helpers is allowed. Preserve event behavior in shared modules.

Windows checks from backend: ..\.venv\Scripts\ruff.exe check .,
..\.venv\Scripts\ruff.exe format --check . and ..\.venv\Scripts\python.exe -m pytest -q.
From frontend: npm run typecheck, npm test, npm run build, npm run contrast, npm run e2e.
For e2e set E2E_PYTHON to the absolute .venv\Scripts\python.exe path.
From root: .\.venv\Scripts\python.exe scripts/check_forbidden_paths.py --base main.

Only the known concurrent guest verification test may be rerun in isolation to accept baseline.
For other baseline regressions, record the attempt, verify martim/restaurantes-impl,
recover the last green commit as authorized by Martim, restore the report and continue.
Never delete or weaken tests. Only new dependencies allowed: leaflet@1.9.4 and @types/leaflet.
