"""Database engine, sessions and small helpers shared by every module.

One engine per process. Routers receive a Session through the get_session
dependency; background code (the live stream, the seed command) opens its own
with new_session().
"""

from collections.abc import Iterator
from typing import Annotated, Any

from fastapi import Depends
from sqlalchemy import Engine, create_engine, event, text
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.models import Base

_engine: Engine | None = None
_session_factory: sessionmaker[Session] | None = None


def _enable_sqlite_foreign_keys(dbapi_connection: Any, _record: Any) -> None:
    # SQLite ignores FOREIGN KEY clauses unless this is switched on for every
    # new connection, and we want the same safety locally as on Postgres.
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def make_engine(database_url: str) -> Engine:
    """Create an engine suited to the database behind the URL."""
    if database_url.startswith("sqlite"):
        # timeout=30: a writer waits for the file lock instead of failing at
        # once, which matters when many requests try to take the same seat.
        # check_same_thread=False: FastAPI may use a connection from a worker
        # thread different from the one that opened it.
        engine = create_engine(
            database_url,
            connect_args={"timeout": 30, "check_same_thread": False},
        )
        event.listen(engine, "connect", _enable_sqlite_foreign_keys)
        return engine
    # Serverless functions are frozen between requests, so a pool of open
    # connections would only hold idle sockets. NullPool opens one connection
    # per session and closes it afterwards.
    return create_engine(database_url, poolclass=NullPool, pool_pre_ping=True)


def init_engine(database_url: str) -> Engine:
    """Create the process-wide engine and the session factory that uses it."""
    global _engine, _session_factory
    if _engine is not None:
        _engine.dispose()
    _engine = make_engine(database_url)
    _session_factory = sessionmaker(bind=_engine, expire_on_commit=False)
    return _engine


def get_engine() -> Engine:
    if _engine is None:
        raise RuntimeError("init_engine() has not been called yet")
    return _engine


# Any fixed number works; every migrate run asks Postgres for the same lock.
_SCHEMA_LOCK_ID = 73102026


def create_all() -> list[str]:
    """Create missing tables, then add the listed new columns and indexes.

    Existing rows are left alone. Returns one line per column or index step
    (seed/migrate.py prints them).

    Two runs at once would both try CREATE TABLE and one would crash, so each
    run first takes a lock that lasts until the end of its transaction; the
    second run waits, then finds the tables already there. On Postgres that
    is an advisory lock. On SQLite it is "BEGIN IMMEDIATE", which takes the
    file's write lock at once (a writer waits up to 30 s, see make_engine).
    """
    # Imported here, not at the top: seed/migrate.py imports this module.
    from app.seed.migrate import upgrade_schema

    with get_engine().begin() as connection:
        if connection.dialect.name == "postgresql":
            connection.execute(text("SELECT pg_advisory_xact_lock(:id)"), {"id": _SCHEMA_LOCK_ID})
        else:
            connection.exec_driver_sql("BEGIN IMMEDIATE")
        Base.metadata.create_all(connection)
        return upgrade_schema(connection)


def new_session() -> Session:
    if _session_factory is None:
        raise RuntimeError("init_engine() has not been called yet")
    return _session_factory()


def get_session() -> Iterator[Session]:
    """FastAPI dependency: one session per request, always closed afterwards."""
    session = new_session()
    try:
        yield session
    finally:
        session.close()


# Routers write "session: SessionDep" to receive the request's session.
SessionDep = Annotated[Session, Depends(get_session)]


def insert_ignoring_duplicates(session: Session, table: Any, values: dict[str, Any]) -> None:
    """INSERT one row, or do nothing when a unique key already exists.

    Both SQLite and Postgres understand "ON CONFLICT DO NOTHING", but
    SQLAlchemy builds it through the dialect module of each database, so we
    pick the right one here once instead of in every caller.
    """
    if session.get_bind().dialect.name == "postgresql":
        statement = postgres_insert(table).values(**values)
    else:
        statement = sqlite_insert(table).values(**values)
    session.execute(statement.on_conflict_do_nothing())
