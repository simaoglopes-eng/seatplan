"""Upgrade the frozen pre-restaurant-platform schema without rewriting rows."""

from pathlib import Path

from sqlalchemy import MetaData, inspect, select

from app import db


def test_restaurant_upgrade_preserves_old_rows_and_is_repeatable(database_url: str) -> None:
    engine = db.init_engine(database_url)
    dialect = "postgres" if engine.dialect.name == "postgresql" else "sqlite"
    fixture = Path(__file__).parent / "fixtures" / f"schema_2026_11_13.{dialect}.sql"
    with engine.begin() as connection:
        for statement in fixture.read_text(encoding="utf-8").split(";\n"):
            if statement.strip():
                connection.exec_driver_sql(statement)
    old = MetaData()
    old.reflect(engine)
    with engine.begin() as connection:
        connection.execute(
            old.tables["organisers"].insert(),
            {
                "id": 1,
                "email": "old@example.com",
                "name": "Old owner",
                "password_hash": "x",
                "role": "organiser",
            },
        )
        connection.execute(
            old.tables["venues"].insert(),
            {
                "id": 1,
                "public_id": "oldRestaurant",
                "organiser_id": 1,
                "kind": "restaurant",
                "name": "Old room",
                "timezone": "Europe/Lisbon",
                "width": 1000,
                "height": 700,
            },
        )
    first = db.create_all()
    second = db.create_all()
    assert any("venues.slug" in line for line in first)
    assert not any(line.startswith("Added column") for line in second)
    from app.models import Room, Venue

    with db.new_session() as session:
        venue = session.get(Venue, 1)
        assert venue.name == "Old room"
        assert venue.status == "published"
        assert venue.slug is None
        assert venue.layout_version == 0
        assert venue.cuisines == []
        assert venue.features == {}
        assert not venue.is_demo
        assert session.scalars(select(Room)).all() == []
    inspector = inspect(engine)
    assert {"rooms", "room_openings", "room_fixtures", "venue_photos"} <= set(
        inspector.get_table_names()
    )
    assert any(
        i["name"] == "uq_venues_slug" and i["unique"] for i in inspector.get_indexes("venues")
    )
