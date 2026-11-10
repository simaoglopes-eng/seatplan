"""Settings read from environment variables (contract section 9).

Every secret or deployment-specific value enters the program here and nowhere
else, so a reviewer only has to read one file to know what can be configured.
"""

import os
import secrets
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

APP_VERSION = "0.1.0"

# The local database lives next to the backend code so "python -m ..." works
# from the repository root without any setup.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DATABASE_URL = f"sqlite:///{_BACKEND_DIR / 'seatplan.db'}"
# secrets.token_hex(32) gives 64 characters; 32 is the least we accept.
MIN_SECRET_KEY_LENGTH = 32


@dataclass(frozen=True)
class Settings:
    database_url: str
    secret_key: str
    frontend_origin: str
    demo_mode: bool
    demo_key: str
    cron_secret: str
    email_provider: str
    resend_api_key: str
    email_from: str
    email_allowlist: tuple[str, ...]
    public_base_url: str
    # True only on Vercel, which writes X-Forwarded-For itself (see security.client_ip).
    trust_forwarded_for: bool = False

    @property
    def is_postgres(self) -> bool:
        return self.database_url.startswith("postgresql")


def _libpq_options() -> set[str]:
    """The connection options libpq itself understands (sslmode, connect_timeout, ...).

    Imported here, not at the top, so a SQLite-only run never loads psycopg.
    """
    from psycopg import pq

    return {option.keyword.decode() for option in pq.Conninfo.get_defaults()}


def _keep_libpq_options(url: str) -> str:
    """Drop query options that only make sense to another tool.

    Hosting integrations add options for their own pooler or for Prisma (for
    example "supa=..." or "pgbouncer=true"). libpq refuses any option it does
    not know, so every connection would fail; we ask libpq for its own list
    instead of guessing which extra names a provider might add next.
    """
    parts = urlsplit(url)
    if not parts.query:
        return url
    known = _libpq_options()
    kept = [
        (name, value)
        for name, value in parse_qsl(parts.query, keep_blank_values=True)
        if name in known
    ]
    return urlunsplit(parts._replace(query=urlencode(kept)))


def _normalise_database_url(raw: str) -> str:
    """Point Postgres URLs at the psycopg 3 driver and keep only libpq options.

    Hosting providers hand out "postgres://" or "postgresql://" URLs, but
    SQLAlchemy would then look for the older psycopg2 driver, which we do not
    install.
    """
    for prefix in ("postgres://", "postgresql://"):
        if raw.startswith(prefix):
            return _keep_libpq_options("postgresql+psycopg://" + raw[len(prefix) :])
    return raw


def _read_bool(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes")


def _read_list(name: str) -> tuple[str, ...]:
    raw = os.environ.get(name, "")
    return tuple(part.strip().lower() for part in raw.split(",") if part.strip())


def _choose_secret_key(is_postgres: bool) -> str:
    """Return SECRET_KEY, or refuse to start when it would be unsafe.

    Without a fixed key we fall back to a random one per process. That is fine
    on a laptop, but on any deployment (Postgres) each serverless instance
    would sign with its own key, so a login made on one instance would fail on
    the next. Demo mode changes nothing here: a demo deployment has the same
    instances.
    """
    key = os.environ.get("SECRET_KEY", "").strip()
    if is_postgres and len(key) < MIN_SECRET_KEY_LENGTH:
        # A short key such as "secret" can be guessed offline from one signed
        # session token, and then anyone could sign in as anyone.
        raise RuntimeError(
            f"SECRET_KEY is missing or shorter than {MIN_SECRET_KEY_LENGTH} characters. "
            "Set a long random one before running against Postgres."
        )
    if key:
        return key
    return secrets.token_hex(32)


def _choose_database_url() -> str:
    raw = os.environ.get("DATABASE_URL", "").strip()
    # Vercel sets VERCEL=1. Its file system is read-only, so the SQLite
    # fallback could never work there; say what is missing instead.
    if not raw and os.environ.get("VERCEL"):
        raise RuntimeError("DATABASE_URL is missing. Set it to the Postgres URL on Vercel.")
    return _normalise_database_url(raw or DEFAULT_DATABASE_URL)


def load_settings() -> Settings:
    """Build a fresh Settings object from the current environment."""
    database_url = _choose_database_url()
    is_postgres = database_url.startswith("postgresql")
    return Settings(
        database_url=database_url,
        secret_key=_choose_secret_key(is_postgres),
        frontend_origin=os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173"),
        demo_mode=_read_bool("DEMO_MODE"),
        demo_key=os.environ.get("DEMO_KEY", ""),
        cron_secret=os.environ.get("CRON_SECRET", ""),
        email_provider=os.environ.get("EMAIL_PROVIDER", "console"),
        resend_api_key=os.environ.get("RESEND_API_KEY", ""),
        email_from=os.environ.get("EMAIL_FROM", "SeatPlan <noreply@example.com>"),
        email_allowlist=_read_list("EMAIL_ALLOWLIST"),
        public_base_url=os.environ.get("PUBLIC_BASE_URL", "http://localhost:5173"),
        # Vercel sets VERCEL=1 in every function it runs.
        trust_forwarded_for=bool(os.environ.get("VERCEL")),
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Settings are read once per process; tests call get_settings.cache_clear()."""
    return load_settings()
