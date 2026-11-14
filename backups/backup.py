"""Copy every SeatPlan table to one JSON file: python backups/backup.py

Reads DATABASE_URL (and SECRET_KEY, which the app requires on Postgres) from
the environment. Writes backups/dumps/seatplan-<UTC time>.json and never
changes the database. The dumps hold personal data (guest names and emails),
so backups/dumps/ is in .gitignore: the repository is public.
"""

import base64
import json
import sys
from datetime import UTC, date, datetime, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backend"))

from _env import prepare
from app import db
from app.config import load_settings
from app.models import Base
from sqlalchemy import select


def to_json(value):
    if isinstance(value, datetime | date | time):
        return value.isoformat()
    if isinstance(value, bytes):
        return base64.b64encode(value).decode()
    return value


def main() -> int:
    prepare()
    settings = load_settings()
    engine = db.make_engine(settings.database_url)
    out = {
        "made_at": datetime.now(UTC).isoformat(),
        "database": settings.database_url.split("@")[-1].split("?")[0],
        "tables": {},
    }
    with engine.connect() as conn:
        for table in Base.metadata.sorted_tables:
            rows = conn.execute(select(table)).mappings().all()
            out["tables"][table.name] = [{k: to_json(v) for k, v in row.items()} for row in rows]
            print(f"{table.name}: {len(rows)} rows")
    dumps = HERE / "dumps"
    dumps.mkdir(exist_ok=True)
    path = dumps / f"seatplan-{datetime.now(UTC):%Y%m%d-%H%M%S}.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print(f"Saved {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
