"""Export the actual API schema using a temporary database, from the repo root."""

import json
import sys
import tempfile
from dataclasses import replace
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(root / "backend"))
    from app import db
    from app.config import get_settings
    from app.main import create_app

    with tempfile.TemporaryDirectory(prefix="seatplan-openapi-") as directory:
        path = Path(directory).resolve()
        path.relative_to(Path(tempfile.gettempdir()).resolve())
        settings = replace(
            get_settings(), database_url=f"sqlite:///{path / 'schema.db'}"
        )
        try:
            schema = create_app(settings).openapi()
            target = root / "docs" / "openapi.json"
            target.write_text(
                json.dumps(schema, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
        finally:
            db.get_engine().dispose()
    operations = sum(
        method in {"get", "post", "put", "patch", "delete"}
        for path in schema["paths"].values()
        for method in path
    )
    print(
        f"{len(schema['paths'])} paths, {operations} operations, {len(schema['components']['schemas'])} schemas"
    )


if __name__ == "__main__":
    main()
