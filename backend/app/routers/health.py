"""GET /health: is the API up and can it reach the database?"""

from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app import db
from app.config import APP_VERSION
from app.models import utc_now

router = APIRouter(tags=["health"])


@router.get("/health")
def health(session: db.SessionDep) -> JSONResponse:
    database = "ok"
    try:
        # A fixed statement with no user input, so text() is safe here.
        session.execute(text("SELECT 1"))
    except SQLAlchemyError:
        database = "error"
    body: dict[str, Any] = {
        "status": "ok" if database == "ok" else "degraded",
        "database": database,
        "version": APP_VERSION,
        "time": utc_now().isoformat(),
    }
    # 503 lets an uptime monitor notice a broken database without parsing JSON.
    return JSONResponse(body, status_code=200 if database == "ok" else 503)
