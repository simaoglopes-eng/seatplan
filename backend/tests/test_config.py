"""Settings: safe defaults locally, hard failure when production is unsafe."""

import pytest

from app.config import load_settings

POSTGRES_URL = "postgres://user:pass@db.example.com:5432/seatplan"


def test_missing_secret_with_postgres_and_no_demo_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", POSTGRES_URL)
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.setenv("DEMO_MODE", "0")
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        load_settings()


def test_postgres_url_uses_psycopg_driver(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", POSTGRES_URL)
    monkeypatch.setenv("SECRET_KEY", "k" * 40)
    monkeypatch.setenv("DEMO_MODE", "0")
    settings = load_settings()
    assert settings.database_url.startswith("postgresql+psycopg://")
    assert settings.is_postgres


def test_local_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("DATABASE_URL", "SECRET_KEY", "EMAIL_PROVIDER", "DEMO_MODE"):
        monkeypatch.delenv(name, raising=False)
    settings = load_settings()
    assert settings.database_url.startswith("sqlite:///")
    assert settings.email_provider == "console"
    assert len(settings.secret_key) >= 32
    assert not settings.demo_mode


def test_allowlist_is_split_and_lowercased(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EMAIL_ALLOWLIST", " Ana@Example.com, rui@example.com ,")
    assert load_settings().email_allowlist == ("ana@example.com", "rui@example.com")


def test_missing_secret_with_postgres_fails_even_in_demo_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # A demo deployment is DEMO_MODE=1 on Postgres. A random key per serverless
    # instance would log people out whenever a request lands on another one.
    monkeypatch.setenv("DATABASE_URL", POSTGRES_URL)
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.setenv("DEMO_MODE", "1")
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        load_settings()


def test_provider_only_query_options_are_dropped(monkeypatch: pytest.MonkeyPatch) -> None:
    # Pooled URLs from hosting integrations carry options that libpq refuses
    # ("invalid connection option"); real libpq options such as sslmode stay.
    monkeypatch.setenv(
        "DATABASE_URL", POSTGRES_URL + "?sslmode=require&supa=base-pooler.x&pgbouncer=true"
    )
    monkeypatch.setenv("SECRET_KEY", "k" * 40)
    url = load_settings().database_url
    assert url == "postgresql+psycopg://user:pass@db.example.com:5432/seatplan?sslmode=require"


def test_postgresql_scheme_and_plain_url_are_kept(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:p%40ss@db.example.com/seatplan")
    monkeypatch.setenv("SECRET_KEY", "k" * 40)
    assert (
        load_settings().database_url == "postgresql+psycopg://user:p%40ss@db.example.com/seatplan"
    )


def test_vercel_without_database_url_fails_clearly(monkeypatch: pytest.MonkeyPatch) -> None:
    # On Vercel the file system is read-only, so falling back to SQLite would
    # only fail later with a confusing error.
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("VERCEL", "1")
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        load_settings()
