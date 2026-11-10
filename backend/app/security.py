"""Passwords, secret tokens, signed sessions and rate limiting.

Only the Python standard library is used (hashlib, hmac, secrets), so every
step can be read and explained without a crypto package.
"""

import hashlib
import hmac
import secrets
import time
from typing import Annotated

from fastapi import Depends, Header, Request
from sqlalchemy import delete, update
from sqlalchemy.orm import Session

from app import db
from app.config import get_settings
from app.core.errors import ApiError
from app.models import Organiser, RateLimit

# scrypt cost settings. n=2**14 takes a few tens of milliseconds: slow enough
# to make guessing passwords expensive, fast enough for a login request.
SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
SESSION_HOURS = 12

# ---------------------------------------------------------------- passwords


def _scrypt(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(password.encode("utf-8"), salt=salt, n=n, r=r, p=p, dklen=32)


def hash_password(password: str) -> str:
    """Return "scrypt$n$r$p$salt$hash". Storing the settings with the hash lets
    us raise the cost later without breaking old passwords."""
    salt = secrets.token_bytes(16)
    digest = _scrypt(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        name, n, r, p, salt_hex, digest_hex = stored.split("$")
        if name != "scrypt":
            return False
        digest = _scrypt(password, bytes.fromhex(salt_hex), int(n), int(r), int(p))
    except ValueError:
        return False
    # compare_digest takes the same time whether the first or last byte
    # differs, so response timing reveals nothing about the hash.
    return hmac.compare_digest(digest.hex(), digest_hex)


# ---------------------------------------------------------------- tokens


def new_token() -> str:
    """A secret for a personal link: 32 random bytes, url-safe."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """What we store instead of the token, so a database leak reveals no links.
    SHA-256 is enough here because the token is random, not a human password."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def tokens_match(given: str, expected: str) -> bool:
    return hmac.compare_digest(given.encode("utf-8"), expected.encode("utf-8"))


# ---------------------------------------------------------------- sessions


def _sign(message: str) -> str:
    key = get_settings().secret_key.encode("utf-8")
    return hmac.new(key, message.encode("utf-8"), hashlib.sha256).hexdigest()


def create_session_token(user_id: int, now: float | None = None) -> str:
    """Token format: "<user id>.<expiry unix time>.<signature>".

    The signature proves the server wrote the first two parts; nobody can
    change the user id or extend the expiry without knowing SECRET_KEY.
    """
    issued = time.time() if now is None else now
    expires = int(issued + SESSION_HOURS * 3600)
    message = f"{user_id}.{expires}"
    return f"{message}.{_sign(message)}"


def verify_session_token(token: str, now: float | None = None) -> int | None:
    """Return the user id, or None if the token is malformed, forged or expired."""
    parts = token.split(".")
    if len(parts) != 3 or not parts[0].isdigit() or not parts[1].isdigit():
        return None
    user_id, expires, signature = parts
    if not tokens_match(signature, _sign(f"{user_id}.{expires}")):
        return None
    current = time.time() if now is None else now
    if int(expires) < current:
        return None
    return int(user_id)


def require_user(
    session: db.SessionDep,
    authorization: Annotated[str | None, Header()] = None,
) -> Organiser:
    """FastAPI dependency: the logged-in organiser or staff member, or 401."""
    token = ""
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
    user_id = verify_session_token(token) if token else None
    user = session.get(Organiser, user_id) if user_id is not None else None
    if user is None:
        raise ApiError(401, "unauthorised", "Please log in again.")
    return user


def require_organiser(user: Annotated[Organiser, Depends(require_user)]) -> Organiser:
    """Like require_user, but staff accounts get 403."""
    if user.role != "organiser":
        raise ApiError(403, "forbidden", "Only organisers can do this.")
    return user


# Routers write "user: CurrentUser" (anyone logged in) or
# "user: CurrentOrganiser" (organisers only) to require a login.
CurrentUser = Annotated[Organiser, Depends(require_user)]
CurrentOrganiser = Annotated[Organiser, Depends(require_organiser)]


# ---------------------------------------------------------------- rate limit


def client_ip(request: Request) -> str:
    """The caller's address, used as the key of every per-address rate limit.

    Vercel overwrites X-Forwarded-For with the real client address (its
    request-headers documentation says so), so there we read that header.
    Anywhere else the header is whatever the caller typed: trusting it would
    let one person claim a new address on every request and never hit a
    limit. So off Vercel we use the socket address only.
    """
    if get_settings().trust_forwarded_for:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _stored_key(key: str) -> str:
    """Turn "login:203.0.113.5" into "login:<keyed hash>".

    Callers name the limit, then who is counted (usually an IP address). An IP
    address is personal data, so the table keeps only a keyed hash of that
    part: enough to count the same caller again, useless to anyone reading
    the table. The key is SECRET_KEY, because a plain SHA-256 of an IPv4
    address can be reversed by trying all 4 billion of them.
    """
    name, _, who = key.partition(":")
    secret = get_settings().secret_key.encode("utf-8")
    digest = hmac.new(secret, who.encode("utf-8"), hashlib.sha256).hexdigest()[:32]
    return f"{name}:{digest}"


def rate_limit(session: Session, key: str, limit: int, window_s: int) -> None:
    """Allow at most `limit` calls per `window_s` seconds for `key`, else 429.

    The counter lives in the database (not in memory) because every serverless
    instance has its own memory. This commits straight away so the count
    survives even if the request fails later; call it before any other write.

    The window is fixed to the clock (for 60 s: each calendar minute), not
    sliding. That is one row per key and window, easy to read, but calls at
    the end of one minute and the start of the next are counted apart, so up
    to twice `limit` can pass in a short burst. Enough to slow down password
    guessing; not a precise quota.
    """
    key = _stored_key(key)
    window_start = int(time.time()) // window_s * window_s
    # Old windows are never needed again; removing them keeps the table small.
    session.execute(
        delete(RateLimit).where((RateLimit.key == key) & (RateLimit.window_start < window_start))
    )
    db.insert_ignoring_duplicates(
        session, RateLimit.__table__, {"key": key, "window_start": window_start, "count": 0}
    )
    count = session.scalar(
        update(RateLimit)
        .where((RateLimit.key == key) & (RateLimit.window_start == window_start))
        .values(count=RateLimit.count + 1)
        .returning(RateLimit.count)
    )
    session.commit()
    if count is not None and count > limit:
        raise ApiError(429, "rate_limited", "Too many attempts. Please wait a moment.")
