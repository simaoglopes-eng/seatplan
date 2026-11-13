"""Reject restaurant changes to event files, including uncommitted work."""

import argparse
import fnmatch
import subprocess
from pathlib import Path

PROTECTED = (
    "frontend/src/pages/events/*",
    "frontend/src/pages/editor/*",
    "frontend/src/pages/join/*",
    "frontend/src/pages/account/*",
    "backend/app/events_service/*",
    "backend/app/routers/events.py",
    "backend/app/routers/attendee.py",
    "backend/app/routers/guest_*.py",
    "backend/app/routers/visitor.py",
)


def git(repo: Path, *args: str) -> str:
    return subprocess.check_output(["git", "-C", str(repo), *args], text=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="main")
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    if git(args.repo, "branch", "--show-current").strip() in ("", "main"):
        print("Work on a task branch, never main or a detached HEAD.")
        return 1
    # Disable rename detection so both the old and new path are checked.
    paths = git(args.repo, "diff", "--no-renames", "--name-only", "-z", args.base).split("\0")
    paths += git(args.repo, "diff", "--cached", "--no-renames", "--name-only", "-z").split("\0")
    paths += git(args.repo, "ls-files", "--others", "--exclude-standard", "-z").split("\0")
    forbidden = sorted({p for p in paths if any(fnmatch.fnmatchcase(p, x) for x in PROTECTED)})
    for path in forbidden:
        print(f"Protected event path: {path}")
    if not forbidden:
        print("Protected event paths unchanged.")
    return int(bool(forbidden))


if __name__ == "__main__":
    raise SystemExit(main())
