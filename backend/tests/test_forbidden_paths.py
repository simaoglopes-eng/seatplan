"""The restaurant guard checks the complete change against main."""

import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "check_forbidden_paths.py"


def git(folder: Path, *args: str) -> None:
    subprocess.run(["git", "-C", str(folder), *args], check=True, capture_output=True)


def test_guard_includes_untracked_staged_and_committed_changes(tmp_path: Path) -> None:
    git(tmp_path, "init", "-b", "main")
    git(tmp_path, "config", "user.name", "Guard test")
    git(tmp_path, "config", "user.email", "guard@example.com")
    (tmp_path / "README.md").write_text("base")
    git(tmp_path, "add", ".")
    git(tmp_path, "commit", "-m", "base")
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--repo", str(tmp_path)], check=False, capture_output=True
    )
    assert result.returncode == 1
    git(tmp_path, "switch", "-c", "martim/test")
    protected = tmp_path / "backend/app/routers/guest_example.py"
    protected.parent.mkdir(parents=True)
    protected.write_text("protected")
    command = [sys.executable, str(SCRIPT), "--repo", str(tmp_path)]
    for stage in ("untracked", "staged", "committed"):
        if stage == "staged":
            git(tmp_path, "add", ".")
        elif stage == "committed":
            git(tmp_path, "commit", "-m", "protected")
        result = subprocess.run(command, check=False, capture_output=True, text=True)
        assert result.returncode == 1
        assert "guest_example.py" in result.stdout
    git(tmp_path, "mv", "backend/app/routers/guest_example.py", "allowed.py")
    assert subprocess.run(command, check=False, capture_output=True).returncode == 1


def test_guard_accepts_restaurant_changes(tmp_path: Path) -> None:
    git(tmp_path, "init", "-b", "main")
    git(tmp_path, "config", "user.name", "Guard test")
    git(tmp_path, "config", "user.email", "guard@example.com")
    git(tmp_path, "commit", "--allow-empty", "-m", "base")
    git(tmp_path, "switch", "-c", "martim/test")
    (tmp_path / "restaurant.py").write_text("allowed")
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--repo", str(tmp_path)], check=False, capture_output=True
    )
    assert result.returncode == 0
