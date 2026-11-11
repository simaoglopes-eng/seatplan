"""Migrate brings a database made with the OLD schema (before guest accounts) up to date.

tests/fixtures/schema_2026_11_10.*.sql is the schema exactly as production had
it before this change, saved from models.py before models.py was touched.
These files are frozen: never regenerate them.

Each test loads the old schema into an empty database (SQLite by default,
Postgres when SEATPLAN_TEST_POSTGRES is set, see conftest.py), adds sample
rows with bound parameters, runs the migrate command and checks the result.
"""

import threading
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, MetaData, inspect, select, text
from sqlalchemy.exc import IntegrityError

from app import db
from app.models import Base
from app.security import create_session_token
from app.seed import migrate

FIXTURES = Path(__file__).parent / "fixtures"
NOW = datetime(2026, 11, 10, 12, 0)

SAMPLE: dict[str, dict[str, Any]] = {
    "organisers": {
        "id": 1,
        "email": "olga.owner@example.com",
        "name": "Olga Owner",
        "password_hash": "scrypt$not-used",
        "role": "organiser",
    },
    "venues": {
        "id": 1,
        "public_id": "venueSample1",
        "organiser_id": 1,
        "kind": "event",
        "name": "Old Hall",
        "timezone": "Europe/Lisbon",
        "width": 800.0,
        "height": 600.0,
    },
    "tables": {
        "id": 1,
        "venue_id": 1,
        "zone_id": None,
        "label": "T1",
        "shape": "round",
        "x": 100.0,
        "y": 100.0,
        "w": 80.0,
        "h": 80.0,
        "rotation": 0.0,
        "min_party": 1,
        "max_party": 4,
        "is_accessible": False,
        "high_chair_ok": False,
        "combine_group": None,
    },
    "seats": {
        "id": 1,
        "venue_id": 1,
        "table_id": 1,
        "label": "1",
        "x": 140.0,
        "y": 80.0,
        "is_accessible": False,
        "is_blocked": False,
        "reserved_tag": None,
    },
    "events": {
        "id": 1,
        "public_id": "eventSample1",
        "venue_id": 1,
        "organiser_id": 1,
        "name": "Old party",
        "starts_at": datetime(2030, 5, 1, 18, 0),
        "ends_at": datetime(2030, 5, 1, 23, 0),
        "privacy_mode": "first_initial",
        "change_deadline": None,
    },
    "guests": {
        "id": 1,
        "event_id": 1,
        "name": "Ines Old",
        "email": "ines.old@example.com",
        "token_hash": "a" * 64,
        "token_revoked_at": None,
        "group_id": None,
        "wants_anonymous": False,
        "needs_accessible": False,
        "dietary_note": None,
        "reserved_tag": None,
        "rsvp": "yes",
    },
    "seat_assignments": {
        "id": 1,
        "event_id": 1,
        "seat_id": 1,
        "guest_id": 1,
        "source": "self",
        "created_at": NOW,
    },
    "email_outbox": {
        "id": 1,
        "idempotency_key": "seat-seat_confirmed:1:1:1",
        "to_email": "ines.old@example.com",
        "kind": "seat_confirmed",
        "subject": "Your seat for Old party is confirmed",
        "body_text": "Hello Ines Old,",
        "body_html": "<p>Hello Ines Old,</p>",
        "ics": None,
        "status": "sent",
        "attempts": 1,
        "next_attempt_at": NOW,
        "sent_at": NOW,
        "provider_message_id": "console-1",
        "last_error": None,
    },
}


def _load_old_schema(engine: Engine) -> None:
    """Run the frozen CREATE statements, then insert the sample rows."""
    dialect = "postgres" if engine.dialect.name == "postgresql" else "sqlite"
    sql = (FIXTURES / f"schema_2026_11_10.{dialect}.sql").read_text()
    with engine.begin() as connection:
        for statement in sql.split(";\n"):
            if statement.strip():
                connection.exec_driver_sql(statement)
    old = MetaData()
    old.reflect(engine)
    with engine.begin() as connection:
        for table, row in SAMPLE.items():
            connection.execute(old.tables[table].insert(), row)  # bound parameters


def _old_rows(engine: Engine) -> dict[str, list[tuple[Any, ...]]]:
    """Every sample table's rows, reading only the columns the old schema had."""
    old = MetaData()
    old.reflect(engine, only=list(SAMPLE))
    found = {}
    with engine.connect() as connection:
        for table, row in SAMPLE.items():
            columns = [old.tables[table].c[name] for name in row]
            found[table] = [tuple(found_row) for found_row in connection.execute(select(*columns))]
    return found


@pytest.fixture
def old_database(database_url: str) -> Engine:
    engine = db.init_engine(database_url)
    _load_old_schema(engine)
    return engine


def _run_migrate(capsys: pytest.CaptureFixture[str]) -> list[str]:
    migrate.main()
    return capsys.readouterr().out.splitlines()


def test_migrate_upgrades_the_old_schema_twice_safely(
    old_database: Engine, capsys: pytest.CaptureFixture[str]
) -> None:
    before = _old_rows(old_database)
    first = _run_migrate(capsys)
    second = _run_migrate(capsys)
    for table, column, _ddl in migrate.NEW_COLUMNS:
        assert f"Added column {table}.{column}" in first
    assert not any(line.startswith("Added column") for line in second)
    assert first[-1] == second[-1] == "Tables are ready."

    engine = db.get_engine()
    inspector = inspect(engine)
    for table, column, _ddl in migrate.NEW_COLUMNS:
        assert column in {c["name"] for c in inspector.get_columns(table)}
    indexes = {i["name"] for t in ("events", "guests") for i in inspector.get_indexes(t)}
    assert {name for name, _ in migrate.NEW_INDEXES} <= indexes
    assert {"guest_accounts", "email_codes"} <= set(inspector.get_table_names())
    assert _old_rows(engine) == before
    with engine.connect() as connection:
        event = connection.execute(text("SELECT share_enabled, share_version FROM events")).one()
        source = connection.execute(text("SELECT source, account_id FROM guests")).one()
    assert (bool(event[0]), event[1]) == (False, 0)
    assert tuple(source) == ("invited", None)


def test_upgraded_database_enforces_one_row_per_account_and_event(
    old_database: Engine, capsys: pytest.CaptureFixture[str]
) -> None:
    _run_migrate(capsys)
    # Explicit ids: the sample rows were also written with explicit ids, and
    # Postgres does not move a table's id counter past those, so letting it
    # pick would give id 1 again.
    insert_guest = text(
        "INSERT INTO guests (id, event_id, name, token_hash, wants_anonymous, needs_accessible, "
        "rsvp, account_id) VALUES (:id, 1, :name, :hash, false, false, 'yes', :account)"
    )
    with db.get_engine().begin() as connection:
        connection.execute(
            text(
                "INSERT INTO guest_accounts (id, public_id, email, name, password_hash, "
                "session_version, consent_at, consent_version, created_at) VALUES "
                "(7, 'acc7', 'kai@example.com', 'Kai', 'x', 0, :now, '2026-11-10', :now)"
            ),
            {"now": NOW},
        )
        # Two invited guests without an account never clash (NULLs differ).
        connection.execute(
            insert_guest, {"id": 101, "name": "No account 1", "hash": "b" * 64, "account": None}
        )
        connection.execute(
            insert_guest, {"id": 102, "name": "No account 2", "hash": "c" * 64, "account": None}
        )
        connection.execute(insert_guest, {"id": 103, "name": "Kai", "hash": "d" * 64, "account": 7})
    with pytest.raises(IntegrityError), db.get_engine().begin() as connection:
        connection.execute(
            insert_guest, {"id": 104, "name": "Kai again", "hash": "e" * 64, "account": 7}
        )


def test_the_app_works_on_the_upgraded_database(
    old_database: Engine, capsys: pytest.CaptureFixture[str]
) -> None:
    from app.main import create_app

    _run_migrate(capsys)
    client = TestClient(create_app())
    headers = {"Authorization": f"Bearer {create_session_token(1)}"}
    page = client.get("/api/events/eventSample1", headers=headers)
    assert page.status_code == 200, page.text
    assert [s["occupant"] for s in page.json()["map"]["seats"]] == ["Ines Old"]
    guests = client.get("/api/events/eventSample1/guests", headers=headers).json()
    assert [(g["name"], g["source"], g["has_account"]) for g in guests] == [
        ("Ines Old", "invited", False)
    ]
    share = client.get("/api/events/eventSample1/share", headers=headers).json()
    assert (share["enabled"], share["link"]) == (False, None)


def _migrate_in_two_threads() -> list[Exception]:
    errors: list[Exception] = []
    start = threading.Barrier(2)

    def run() -> None:
        start.wait()
        try:
            db.create_all()
        except Exception as error:  # noqa: BLE001 (collected and checked by the caller)
            errors.append(error)

    threads = [threading.Thread(target=run) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    return errors


def test_two_migrate_runs_at_once(old_database: Engine) -> None:
    assert _migrate_in_two_threads() == []
    columns = {c["name"] for c in inspect(db.get_engine()).get_columns("guests")}
    assert {"account_id", "source"} <= columns


def test_two_migrate_runs_at_once_on_an_empty_database(database_url: str) -> None:
    # Without the schema lock (an advisory lock on Postgres, BEGIN IMMEDIATE on
    # SQLite) both runs try CREATE TABLE and one fails with "already exists".
    db.init_engine(database_url)
    assert _migrate_in_two_threads() == []
    assert {"guest_accounts", "email_codes"} <= set(inspect(db.get_engine()).get_table_names())


def _shape(engine: Engine) -> dict[str, Any]:
    """Columns (type, nullable, default), indexes, unique constraints and foreign keys."""
    inspector = inspect(engine)
    shape = {}
    for table in sorted(Base.metadata.tables):
        columns = [
            (c["name"], str(c["type"]), c["nullable"], c.get("default"))
            for c in inspector.get_columns(table)
        ]
        indexes = sorted(
            (i["name"], tuple(i["column_names"]), bool(i["unique"]))
            for i in inspector.get_indexes(table)
        )
        uniques = sorted(tuple(u["column_names"]) for u in inspector.get_unique_constraints(table))
        foreign = sorted(
            (tuple(f["constrained_columns"]), f["referred_table"])
            for f in inspector.get_foreign_keys(table)
        )
        shape[table] = {"columns": columns, "indexes": indexes, "uniques": uniques, "fk": foreign}
    return shape


def test_fresh_and_upgraded_databases_have_the_same_shape(
    old_database: Engine, capsys: pytest.CaptureFixture[str], tmp_path: Path
) -> None:
    _run_migrate(capsys)
    upgraded = _shape(db.get_engine())
    if db.get_engine().dialect.name == "postgresql":
        from conftest import POSTGRES_SERVER, fresh_postgres_database

        with fresh_postgres_database(POSTGRES_SERVER) as url:
            fresh_engine = db.make_engine(url.replace("postgresql://", "postgresql+psycopg://"))
            Base.metadata.create_all(fresh_engine)
            fresh = _shape(fresh_engine)
            fresh_engine.dispose()
    else:
        fresh_engine = db.make_engine(f"sqlite:///{tmp_path / 'fresh.db'}")
        Base.metadata.create_all(fresh_engine)
        fresh = _shape(fresh_engine)
    assert upgraded == fresh
