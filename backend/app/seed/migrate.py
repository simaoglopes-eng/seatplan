"""Create any missing tables: python -m app.seed.migrate

Run it from the backend/ folder, once before the first deploy and again after
a new table is added, with DATABASE_URL pointing at the production database.
The app itself never creates tables on Postgres: several serverless instances
starting at the same moment would all try CREATE TABLE and crash each other.

It only adds missing tables. A new column or constraint on a table that
already exists is not applied (there is no migration tool); see the README.
"""

from app import db
from app.config import get_settings


def main() -> None:
    settings = get_settings()
    db.init_engine(settings.database_url)
    db.create_all()
    print("Tables are ready.")


if __name__ == "__main__":
    main()
