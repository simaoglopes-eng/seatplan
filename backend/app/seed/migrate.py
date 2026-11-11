"""Bring the database up to date: python -m app.seed.migrate

Run it from the backend/ folder, once before the first deploy and again after
each release that changes the tables, with DATABASE_URL pointing at the
production database. The app itself never runs DDL on Postgres: several
serverless instances starting at the same moment would all try CREATE TABLE
and crash each other.

What it does, in one transaction (db.create_all):
1. creates every missing table;
2. adds each column in NEW_COLUMNS that the table does not have yet;
3. creates each index in NEW_INDEXES that does not exist yet.
Nothing else: there is no general migration tool, so a change to an existing
column is not applied (see the README). No data is rewritten; the new columns
get their defaults.

Every step checks the database first, so running it twice changes nothing
the second time, on SQLite and on Postgres alike.

The DDL below is fixed text written in this file, never built from input, so
contract section 7 ("no string-built SQL") still holds.
"""

from sqlalchemy import Connection, inspect, text

from app import db
from app.config import get_settings

# (table, column, the column's type and rules as ALTER TABLE wants them).
# Each server default must match the one in models.py word for word, so a new
# database (create_all) and an upgraded one (ALTER TABLE) come out the same.
NEW_COLUMNS: tuple[tuple[str, str, str], ...] = (
    ("events", "share_enabled", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("events", "share_version", "INTEGER NOT NULL DEFAULT 0"),
    ("events", "share_token_hash", "VARCHAR(64)"),
    ("events", "share_cap", "INTEGER"),
    ("guests", "account_id", "INTEGER REFERENCES guest_accounts (id)"),
    ("guests", "source", "VARCHAR(20) NOT NULL DEFAULT 'invited'"),
    ("email_outbox", "image_png", "TEXT"),
)

# (index name, statement). Both databases understand "IF NOT EXISTS" here.
NEW_INDEXES: tuple[tuple[str, str], ...] = (
    (
        "uq_events_share_token",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_events_share_token ON events (share_token_hash)",
    ),
    (
        "uq_guests_event_account",
        (
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_guests_event_account "
            "ON guests (event_id, account_id)"
        ),
    ),
    (
        "ix_guests_account_id",
        "CREATE INDEX IF NOT EXISTS ix_guests_account_id ON guests (account_id)",
    ),
)


def _add_missing_columns(connection: Connection) -> list[str]:
    """ALTER TABLE ... ADD COLUMN for each NEW_COLUMNS entry the table lacks."""
    changes = []
    for table, column, ddl in NEW_COLUMNS:
        # A fresh inspector each time: it caches what it has read.
        existing = {found["name"] for found in inspect(connection).get_columns(table)}
        if column in existing:
            continue
        # SQLite has no "ADD COLUMN IF NOT EXISTS", hence the check above on
        # both databases. On Postgres the clause is a second guard.
        guard = "IF NOT EXISTS " if connection.dialect.name == "postgresql" else ""
        connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {guard}{column} {ddl}"))
        changes.append(f"Added column {table}.{column}")
    return changes


def upgrade_schema(connection: Connection) -> list[str]:
    """Steps 2 and 3 of the module docstring. Returns one line per change.

    Run after Base.metadata.create_all(), because guests.account_id refers to
    the guest_accounts table that create_all makes.
    """
    changes = _add_missing_columns(connection)
    for name, statement in NEW_INDEXES:
        connection.execute(text(statement))
        changes.append(f"Index {name} is ready")
    return changes


def main() -> None:
    settings = get_settings()
    db.init_engine(settings.database_url)
    for line in db.create_all():
        print(line)
    print("Tables are ready.")


if __name__ == "__main__":
    main()
