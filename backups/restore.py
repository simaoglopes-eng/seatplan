"""Put a backup back into an EMPTY database: python backups/restore.py <file.json>

Insert-only. It refuses to touch a table that already has rows, so it can never
overwrite or delete data: restore into a fresh database (run
`python -m app.seed.migrate` there first to create the tables), then point
DATABASE_URL on Vercel at it. Everything happens in one transaction: if any
row fails, nothing is written.
"""

import base64
import json
import sys
from datetime import date, datetime, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backend"))

from _env import prepare
from app import db
from app.config import load_settings
from app.models import Base
from sqlalchemy import (
    Date,
    DateTime,
    LargeBinary,
    Time,
    TypeDecorator,
    func,
    select,
    text,
)


def from_json(column, value):
    if value is None:
        return None
    # models.py wraps some types (UTC datetimes) in a TypeDecorator; look inside.
    kind = column.type.impl if isinstance(column.type, TypeDecorator) else column.type
    if isinstance(kind, DateTime):
        return datetime.fromisoformat(value)
    if isinstance(kind, Date):
        return date.fromisoformat(value)
    if isinstance(kind, Time):
        return time.fromisoformat(value)
    if isinstance(kind, LargeBinary):
        return base64.b64decode(value)
    return value


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python backups/restore.py backups/dumps/seatplan-....json")
        return 2
    data = json.loads(Path(sys.argv[1]).read_text())
    prepare()
    settings = load_settings()
    engine = db.make_engine(settings.database_url)
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if conn.execute(select(func.count()).select_from(table)).scalar():
                print(f"STOPPED: table {table.name} already has rows. Nothing was written.")
                raise SystemExit(1)
        for table in Base.metadata.sorted_tables:
            rows = [
                {c.name: from_json(c, row.get(c.name)) for c in table.columns if c.name in row}
                for row in data["tables"].get(table.name, [])
            ]
            if rows:
                conn.execute(table.insert(), rows)
            print(f"{table.name}: {len(rows)} rows")
        if conn.dialect.name == "postgresql":
            # Move each id counter past the restored ids, or the next insert
            # would reuse one. Table names come from models.py, never input.
            for table in Base.metadata.sorted_tables:
                if "id" in table.c and table.c.id.autoincrement:
                    conn.execute(
                        text(
                            "SELECT setval(pg_get_serial_sequence(:t, 'id'), "
                            f'COALESCE((SELECT MAX(id) FROM "{table.name}"), 0) + 1, false)'
                        ),
                        {"t": table.name},
                    )
    print("Restore done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
