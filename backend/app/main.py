"""The FastAPI application factory.

create_app() wires everything together: database, error handlers, CORS,
security headers and every router under /api. Run locally, from backend/:

    uvicorn app.main:create_app --factory --reload

There is deliberately no module-level `app` here, so importing this module
(for example in tests) never touches the real database. Vercel's entry point
api/index.py calls create_app() itself.
"""

from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import db
from app.config import APP_VERSION, Settings, get_settings
from app.core import live
from app.core.errors import ApiError
from app.routers import (
    attendee,
    auth,
    bookings,
    demo,
    emails,
    events,
    health,
    restaurants,
    staff,
    venues,
)

# Standard HTTP statuses mapped to the error codes of contract section 5.
# 400 (unreadable request) and 413 (body too large) both mean "fix what you
# sent", hence "validation". Any status missing here is one our API never
# plans to send, so it is reported as "internal" rather than guessed.
_CODE_FOR_STATUS = {
    400: "validation",
    401: "unauthorised",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    413: "validation",
    422: "validation",
    429: "rate_limited",
}

# Postgres error codes for "deadlock detected" and "could not serialize".
# Both mean: the database aborted this transaction, so nothing was saved, and
# the same request will work if sent again.
_RETRY_SQLSTATES = {"40P01", "40001"}
_BUSY_MESSAGE = "Many people are changing things right now. Nothing was saved; please try again."

_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}


def error_body(code: str, message: str) -> dict[str, dict[str, str]]:
    return {"error": {"code": code, "message": message}}


async def _api_error(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ApiError)
    return JSONResponse(error_body(exc.code, exc.message), status_code=exc.status)


async def _http_error(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    code = _CODE_FOR_STATUS.get(exc.status_code, "internal")
    return JSONResponse(error_body(code, str(exc.detail)), status_code=exc.status_code)


async def _validation_error(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    first = exc.errors()[0] if exc.errors() else {}
    # "body.seats.0.x: Input should be a valid number" tells the user which field.
    where = ".".join(str(part) for part in first.get("loc", ()))
    message = f"{where}: {first.get('msg', 'Invalid request')}".strip(": ")
    return JSONResponse(error_body("validation", message), status_code=422)


async def _database_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, OperationalError)
    # The request's session is closed (and rolled back) by db.get_session.
    if getattr(exc.orig, "sqlstate", None) in _RETRY_SQLSTATES:
        return JSONResponse(error_body("conflict", _BUSY_MESSAGE), status_code=409)
    return await _unexpected_error(request, exc)


async def _out_of_range(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, OverflowError)
    # Dates are accepted from year 1 to 9999. Near those ends, adding a day
    # (a stay that ends at midnight) or looking 90 days back leaves the
    # calendar Python can represent. That is a request we cannot serve, not a
    # crash: answer 422 instead of 500.
    message = "This date is too far in the past or the future."
    return JSONResponse(error_body("validation", message), status_code=422)


async def _unexpected_error(_request: Request, _exc: Exception) -> JSONResponse:
    # Never show a stack trace to the browser; the server log still has it.
    return JSONResponse(error_body("internal", "Something went wrong."), status_code=500)


async def _add_security_headers(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    response = await call_next(request)
    for name, value in _SECURITY_HEADERS.items():
        response.headers.setdefault(name, value)
    # API answers are personal (seat maps, bookings), so no shared caching.
    response.headers.setdefault("Cache-Control", "no-store")
    return response


def _register_routers(app: FastAPI) -> None:
    for module in (
        health,
        auth,
        venues,
        demo,
        events,
        attendee,
        restaurants,
        bookings,
        staff,
        emails,
    ):
        app.include_router(module.router, prefix="/api")
    app.include_router(live.router, prefix="/api")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    db.init_engine(settings.database_url)
    # Only the local SQLite file gets its tables at start-up, for convenience.
    # On Postgres several serverless instances can start at the same moment and
    # would race on CREATE TABLE, so tables come from "python -m app.seed.migrate".
    if not settings.is_postgres:
        db.create_all()
    app = FastAPI(
        title="SeatPlan API",
        version=APP_VERSION,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )
    app.add_exception_handler(ApiError, _api_error)
    app.add_exception_handler(StarletteHTTPException, _http_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(OperationalError, _database_error)
    app.add_exception_handler(OverflowError, _out_of_range)
    app.add_exception_handler(Exception, _unexpected_error)
    app.middleware("http")(_add_security_headers)
    # Only our own frontend may call the API from a browser.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Demo-Key"],
    )
    _register_routers(app)
    return app
