"""Owner sign-up codes use their own purpose and atomic consumption."""

import secrets
from datetime import timedelta
from html import escape
from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core import audit
from app.core.errors import ApiError
from app.events_service import accounts
from app.mail import templates
from app.mail.outbox import CODE_REMOVED, enqueue
from app.models import EmailCode, EmailOutbox, Organiser, utc_now
from app.security import create_session_token, hash_password, keyed_hash, new_token, tokens_match

EXPIRED = "This code has expired or was already used. Please ask for a new code."


def _email_key(row: EmailCode) -> str:
    return f"owner-code:{row.signup_hash}"


def _retire_email(session: Session, row: EmailCode) -> None:
    session.execute(
        update(EmailOutbox)
        .where(EmailOutbox.idempotency_key == _email_key(row), EmailOutbox.status == "queued")
        .values(status="skipped", body_text=CODE_REMOVED, body_html=CODE_REMOVED)
    )


def register(session: Session, name: str, email: str, password: str) -> dict[str, Any]:
    """Always answer 202 with the same shape, including for an existing account."""
    signup_id = new_token()
    signup_hash = keyed_hash(f"owner-signup:{signup_id}")
    password_hash = hash_password(password)
    code = f"{secrets.randbelow(10**6):06d}"
    show = accounts.may_show_code(session, email)
    existing = session.scalar(select(Organiser).where(Organiser.email == email))
    link = f"{get_settings().public_base_url}/owner/sign-in"
    if existing:
        parts = templates.account_exists(existing.name, "SeatPlan restaurants", link)
        key = f"owner-exists:{keyed_hash(email)}:{utc_now():%Y%m%d%H}"
    else:
        old = session.scalar(
            select(EmailCode).where(EmailCode.email == email, EmailCode.purpose == "owner")
        )
        if old:
            _retire_email(session, old)
            session.delete(old)
            session.flush()
        row = EmailCode(
            email=email,
            purpose="owner",
            code_hash=keyed_hash(f"owner:{email}:{code}"),
            expires_at=utc_now() + timedelta(minutes=15),
            name=name,
            password_hash=password_hash,
            signup_hash=signup_hash,
            code_shown=show,
        )
        session.add(row)
        key = _email_key(row)
        parts = templates.EmailParts(
            "Your SeatPlan owner verification code",
            f"Your code is {code}. It expires in 15 minutes. Sign in at {link}",
            f'<p>Your code is <strong>{code}</strong>. It expires in 15 minutes.</p><p><a href="{escape(link, quote=True)}">Sign in</a></p>',
        )
    enqueue(
        session,
        idempotency_key=key,
        to_email=email,
        kind="account_code",
        subject=parts.subject,
        body_text=parts.body_text,
        body_html=parts.body_html,
    )
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise ApiError(409, "conflict", "Please try again.") from None
    accounts.send_at_once(session, key)
    response: dict[str, Any] = {"signup_id": signup_id}
    if show:
        response["code_shown"] = code
    return response


def verify(session: Session, email: str, code: str, signup_id: str) -> dict[str, Any]:
    """Hold the code row's write lock through account creation and consumption."""
    row = session.scalar(
        select(EmailCode).where(EmailCode.email == email, EmailCode.purpose == "owner")
    )
    if (
        row is None
        or row.expires_at <= utc_now()
        or not tokens_match(row.signup_hash or "", keyed_hash(f"owner-signup:{signup_id}"))
    ):
        raise ApiError(404, "not_found", EXPIRED)
    attempts = session.scalar(
        update(EmailCode)
        .where(
            EmailCode.id == row.id,
            EmailCode.signup_hash == row.signup_hash,
            EmailCode.code_hash == row.code_hash,
            EmailCode.attempts < 5,
            EmailCode.expires_at > utc_now(),
        )
        .values(attempts=EmailCode.attempts + 1)
        .returning(EmailCode.attempts)
    )
    if attempts is None:
        exists = session.scalar(
            select(EmailCode.id).where(
                EmailCode.id == row.id,
                EmailCode.signup_hash == row.signup_hash,
                EmailCode.code_hash == row.code_hash,
                EmailCode.expires_at > utc_now(),
            )
        )
        raise ApiError(
            404 if exists is None else 422, "not_found" if exists is None else "validation", EXPIRED
        )
    if not tokens_match(row.code_hash, keyed_hash(f"owner:{email}:{code}")):
        if attempts >= 5:
            _retire_email(session, row)
            session.execute(delete(EmailCode).where(EmailCode.id == row.id))
        session.commit()
        raise ApiError(
            422, "validation", "That code is not right. Please check it or request a new one."
        )
    user = Organiser(
        email=row.email,
        name=row.name or "",
        password_hash=row.password_hash or "",
        role="organiser",
    )
    session.add(user)
    try:
        session.flush()
        _retire_email(session, row)
        session.execute(delete(EmailCode).where(EmailCode.id == row.id))
        audit.record(
            session,
            actor=user.email,
            action="owner.register",
            entity="organiser",
            entity_id=str(user.id),
            detail={"consent_version": "2026-11-13"},
        )
        session.commit()
    except IntegrityError:
        session.rollback()
        raise ApiError(409, "conflict", "Please sign in or try again.") from None
    return {
        "token": create_session_token(user.id),
        "user": {"id": user.id, "name": user.name, "email": user.email, "role": user.role},
    }
