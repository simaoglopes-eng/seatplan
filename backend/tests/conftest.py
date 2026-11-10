"""Shared test fixtures.

Every test gets its own SQLite file inside pytest's tmp_path, so tests never
share data and can run in any order.

Opt-in: set SEATPLAN_TEST_POSTGRES to a Postgres server URL (for example
postgresql://user@127.0.0.1:5432/postgres) and every test gets its own fresh
Postgres database on that server instead, dropped again afterwards.
"""

import os
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import psycopg
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import db
from app.config import get_settings
from app.models import Organiser
from app.security import create_session_token, hash_password
from app.seed.run import DEFAULT_DEMO_PASSWORDS

TEST_PASSWORD = "correct horse battery"


POSTGRES_SERVER = os.environ.get("SEATPLAN_TEST_POSTGRES", "")


@contextmanager
def fresh_postgres_database(server_url: str) -> Iterator[str]:
    """Create an empty database on the server, yield its URL, then drop it."""
    name = f"seatplan_test_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(server_url, autocommit=True) as admin:
        admin.execute(f'CREATE DATABASE "{name}"')
    try:
        yield server_url.rsplit("/", 1)[0] + f"/{name}"
    finally:
        # FORCE closes any connection a test left open.
        with psycopg.connect(server_url, autocommit=True) as admin:
            admin.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')


@pytest.fixture
def database_url(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    """Point the settings at a fresh database (SQLite file by default) and a known secret key."""
    if POSTGRES_SERVER:
        with fresh_postgres_database(POSTGRES_SERVER) as url:
            yield from _use_database(url, monkeypatch)
    else:
        yield from _use_database(f"sqlite:///{tmp_path / 'test.db'}", monkeypatch)


def _use_database(url: str, monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-not-used-anywhere-else")
    monkeypatch.setenv("DEMO_MODE", "1")
    monkeypatch.setenv("FRONTEND_ORIGIN", "http://localhost:5173")
    for name in ("DEMO_KEY", "DEMO_ORGANISER_PASSWORD", "DEMO_STAFF_PASSWORD"):
        monkeypatch.delenv(name, raising=False)
    if url.startswith("postgresql"):
        # On Postgres the seed never falls back to the public demo passwords,
        # so give it the same values the tests expect from local SQLite.
        for name, password in DEFAULT_DEMO_PASSWORDS.items():
            monkeypatch.setenv(name, password)
    get_settings.cache_clear()
    yield url
    # Settings are cached per process; clear them so the next test re-reads.
    get_settings.cache_clear()


@pytest.fixture
def app(database_url: str) -> FastAPI:
    # Imported here, not at the top: main.py pulls in every router, and a
    # half-written router elsewhere should not break pure optimiser tests.
    from app.main import create_app

    app = create_app()
    if get_settings().is_postgres:
        db.create_all()  # on Postgres the app never creates tables itself (app.seed.migrate does)
    return app


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app)


@pytest.fixture
def session(app: FastAPI) -> Iterator[Session]:
    """A database session on the same test database the app uses."""
    with db.new_session() as s:
        yield s


def make_user(session: Session, email: str, role: str = "organiser") -> Organiser:
    user = Organiser(
        email=email, name="Test Person", role=role, password_hash=hash_password(TEST_PASSWORD)
    )
    session.add(user)
    session.commit()
    return user


def auth_header(user: Organiser) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_session_token(user.id)}"}


@pytest.fixture
def organiser(session: Session) -> Organiser:
    return make_user(session, "rita.organiser@example.com")


@pytest.fixture
def staff(session: Session) -> Organiser:
    return make_user(session, "tomas.staff@example.com", role="staff")
