"""Live updates without shared memory: a change counter per scope.

Every write bumps the version of the scope it touches (one event, or one
restaurant on one date). Browsers either poll GET /live/{scope}/version or
open GET /live/{scope}/stream, a server-sent event stream that re-reads the
counter about once a second and closes after about 25 seconds. The browser's
EventSource reconnects by itself, so a serverless function never runs long.

The frontend opens the stream first. When it fails, or we refuse it (one
address opens too many, or this instance already serves many), the frontend
polls instead. A platform that buffers the stream would only delay updates;
whether Vercel does is not checked.
"""

import re
import time
from collections.abc import AsyncIterator

import anyio.to_thread
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app import db
from app.core.errors import ApiError
from app.models import LiveVersion
from app.security import client_ip, rate_limit

router = APIRouter(prefix="/live", tags=["live"])

# event-{public id} or venue-{public id}-{yyyy-mm-dd}. Public ids are
# url-safe base64, so they may contain "-" and "_" themselves.
SCOPE_PATTERN = re.compile(
    r"^(event-[A-Za-z0-9_-]{12,32}|venue-[A-Za-z0-9_-]{12,32}-\d{4}-\d{2}-\d{2})$"
)
STREAM_SECONDS = 25.0
CHECK_EVERY_SECONDS = 1.0
# One browser tab reconnects about every 25 s, so 2 or 3 opens a minute. 30
# leaves room for a few tabs behind one address; more falls back to polling.
STREAMS_PER_IP_PER_MINUTE = 30
# Each open stream reads the database once a second. Beyond this many on one
# instance, new viewers poll instead (every few seconds) to spare connections.
MAX_OPEN_STREAMS = 50

# Streams open on this instance right now. Only the event loop thread changes
# it, one step at a time, so no lock is needed.
_open_streams = 0


def validate_scope(scope: str) -> str:
    if not SCOPE_PATTERN.match(scope):
        raise ApiError(404, "not_found", "Unknown live scope.")
    return scope


def bump(session: Session, scope: str) -> None:
    """Add one to the scope's version. Does not commit: the caller's write and
    the bump are committed together, so listeners never see a version for a
    change that was rolled back."""
    db.insert_ignoring_duplicates(session, LiveVersion.__table__, {"scope": scope, "version": 0})
    session.execute(
        update(LiveVersion)
        .where(LiveVersion.scope == scope)
        .values(version=LiveVersion.version + 1)
    )


def read_version(session: Session, scope: str) -> int:
    """Current version, or 0 for a scope nobody has written to yet."""
    version = session.scalar(select(LiveVersion.version).where(LiveVersion.scope == scope))
    return version or 0


def _read_fresh(scope: str) -> int:
    # A fresh short session each time, so we always read committed data and
    # never keep a database connection open while the stream waits.
    with db.new_session() as session:
        return read_version(session, scope)


def _count_stream_open(ip: str) -> None:
    with db.new_session() as session:
        rate_limit(session, f"live-stream:{ip}", STREAMS_PER_IP_PER_MINUTE, window_s=60)


async def _version_events(scope: str, last_seen: int) -> AsyncIterator[str]:
    """Yield one SSE "version" message per change until time runs out.

    An async generator: while it waits (asyncio sleep) it holds no worker
    thread, so open streams cannot starve the normal routes, which all run in
    the shared threadpool. Only the short database read borrows a thread.
    """
    global _open_streams
    _open_streams += 1
    try:
        yield "retry: 1000\n\n"
        deadline = time.monotonic() + STREAM_SECONDS
        while time.monotonic() < deadline:
            version = await anyio.to_thread.run_sync(_read_fresh, scope)
            if version != last_seen:
                last_seen = version
                yield f"event: version\ndata: {version}\n\n"
            await anyio.sleep(CHECK_EVERY_SECONDS)
    finally:
        _open_streams -= 1


@router.get("/{scope}/version")
def get_version(scope: str, session: db.SessionDep) -> dict[str, int]:
    return {"version": read_version(session, validate_scope(scope))}


@router.get("/{scope}/stream")
async def stream(scope: str, request: Request) -> StreamingResponse:
    validate_scope(scope)
    if _open_streams >= MAX_OPEN_STREAMS:
        raise ApiError(429, "rate_limited", "Too many live connections; the page will poll.")
    # rate_limit uses the (blocking) database, so it runs in a worker thread.
    await anyio.to_thread.run_sync(_count_stream_open, client_ip(request))
    # last_seen=-1 makes the first loop send the current version straight away.
    return StreamingResponse(
        _version_events(scope, last_seen=-1),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )
