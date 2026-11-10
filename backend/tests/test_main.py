"""The app factory: no table creation on Postgres, and error codes from the contract."""

from dataclasses import replace

import pytest
from conftest import POSTGRES_SERVER
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import inspect
from sqlalchemy.exc import OperationalError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import db
from app.config import get_settings
from app.main import create_app
from app.seed import migrate

POSTGRES_URL = "postgresql+psycopg://user:pass@db.example.com:5432/seatplan"


def test_app_start_runs_no_ddl_on_postgres(
    database_url: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Several cold starts at once would race on CREATE TABLE. On Postgres the
    # tables come from "python -m app.seed.migrate", never from a cold start.
    calls: list[str] = []
    monkeypatch.setattr(db, "create_all", lambda: calls.append("create_all"))
    create_app(replace(get_settings(), database_url=POSTGRES_URL))
    assert calls == []


@pytest.mark.skipif(bool(POSTGRES_SERVER), reason="only meaningful on local SQLite")
def test_app_start_creates_tables_on_local_sqlite(
    database_url: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[str] = []
    monkeypatch.setattr(db, "create_all", lambda: calls.append("create_all"))
    create_app()
    assert calls == ["create_all"]


def test_migrate_creates_tables_and_can_run_twice(database_url: str) -> None:
    migrate.main()
    migrate.main()  # idempotent: the second run changes nothing and does not fail
    tables = set(inspect(db.get_engine()).get_table_names())
    assert {"plan_snapshots", "demo_links", "seat_assignments"} <= tables


def _raise(status: int) -> None:
    raise StarletteHTTPException(status_code=status, detail="test")


@pytest.mark.parametrize(
    ("status", "code"),
    [(400, "validation"), (413, "validation"), (409, "conflict"), (418, "internal")],
)
def test_http_statuses_map_to_contract_codes(app: FastAPI, status: int, code: str) -> None:
    # A status we did not plan for must not pretend to be a "conflict".
    app.add_api_route("/api/test-status", lambda: _raise(status))
    response = TestClient(app).get("/api/test-status")
    assert response.status_code == status
    assert response.json()["error"]["code"] == code


def test_wrong_method_has_its_own_code(client: TestClient) -> None:
    response = client.delete("/api/health")
    assert response.status_code == 405
    assert response.json()["error"]["code"] == "method_not_allowed"


def test_unexpected_exception_is_internal(app: FastAPI) -> None:
    def boom() -> None:
        raise RuntimeError("boom")

    app.add_api_route("/api/test-boom", boom)
    response = TestClient(app, raise_server_exceptions=False).get("/api/test-boom")
    assert response.status_code == 500
    assert response.json() == {"error": {"code": "internal", "message": "Something went wrong."}}


class _DatabaseGaveUp(Exception):
    def __init__(self, sqlstate: str) -> None:
        super().__init__(sqlstate)
        self.sqlstate = sqlstate  # psycopg puts the Postgres error code here


@pytest.mark.parametrize(
    ("sqlstate", "status", "code"),
    [("40P01", 409, "conflict"), ("40001", 409, "conflict"), ("08006", 500, "internal")],
)
def test_deadlock_on_any_route_is_a_calm_409(
    app: FastAPI, sqlstate: str, status: int, code: str
) -> None:
    # Postgres breaks a deadlock by aborting one transaction: nothing was saved
    # and the same request works when sent again. Any route can meet it, for
    # example two diners holding tables at the same moment.
    def deadlocked() -> None:
        raise OperationalError("UPDATE holds", {}, _DatabaseGaveUp(sqlstate))

    app.add_api_route("/api/test-deadlock", deadlocked)
    response = TestClient(app, raise_server_exceptions=False).get("/api/test-deadlock")
    assert response.status_code == status
    assert response.json()["error"]["code"] == code
