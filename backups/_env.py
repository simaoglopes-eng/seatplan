"""Fill in DATABASE_URL and SECRET_KEY before the app settings are read.

SECRET_KEY: when it is not set, it is read from .env.seatplan-secrets.local in
the repository root (untracked; the setup script wrote it).
DATABASE_URL: when it is not set (or is Vercel's "[SENSITIVE]" placeholder), it
is asked for without echo, so it never lands in the shell history.
"""

import os
from getpass import getpass
from pathlib import Path

SECRETS = Path(__file__).resolve().parent.parent / ".env.seatplan-secrets.local"


def prepare() -> None:
    if not os.environ.get("SECRET_KEY") and SECRETS.exists():
        for line in SECRETS.read_text().splitlines():
            name, sep, value = line.partition("=")
            if sep and name.strip() and not os.environ.get(name.strip()):
                os.environ[name.strip()] = value.strip()
    url = os.environ.get("DATABASE_URL", "")
    if not url or url == "[SENSITIVE]":
        url = clean(getpass("Neon connection string (postgresql://...), hidden: "))
        if not url.startswith(("postgres://", "postgresql://")):
            raise SystemExit(
                "STOPPED: that is not a Postgres URL (it should start with postgresql://). "
                "Nothing was read or written."
            )
        os.environ["DATABASE_URL"] = url


def clean(pasted: str) -> str:
    """Accept the URL as pasted from Neon/Vercel: bare, quoted, as a
    DATABASE_URL=... line, or inside the `psql '...'` command."""
    text = pasted.strip()
    start = text.find("postgresql://")
    if start < 0:
        start = text.find("postgres://")
    if start >= 0:
        text = text[start:]
    return text.split()[0].strip("'\"") if text else ""
