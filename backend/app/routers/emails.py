"""Outbox processing endpoint and email log (/internal/email/process, /emails/log).

POST /internal/email/process is called every 15 minutes by the GitHub Actions
workflow .github/workflows/email-cron.yml. It is not for browsers: the caller
proves itself with the X-Cron-Secret header.
"""

from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Header, Query, Request
from pydantic import BaseModel
from sqlalchemy import select

from app import db
from app.config import get_settings
from app.core.errors import ApiError
from app.core.privacy import mask_email
from app.mail.outbox import process_due, redact_links, scrub_expired
from app.mail.providers import provider_from_settings
from app.models import EmailOutbox, utc_now
from app.security import CurrentOrganiser, client_ip, rate_limit, tokens_match

router = APIRouter(tags=["emails"])


class ProcessResult(BaseModel):
    sent: int
    skipped: int
    retrying: int
    failed: int


class EmailLogItem(BaseModel):
    id: int
    kind: str
    to: str
    subject: str
    status: str
    attempts: int
    next_attempt_at: datetime
    sent_at: datetime | None
    last_error: str | None


def _check_cron_secret(given: str | None) -> None:
    expected = get_settings().cron_secret
    # An empty CRON_SECRET must never mean "anyone may call": refuse instead.
    # tokens_match uses hmac.compare_digest, which takes the same time however
    # many characters are right, so timing reveals nothing about the secret.
    if not expected or not given or not tokens_match(given, expected):
        raise ApiError(401, "unauthorised", "Wrong or missing cron secret.")


@router.post("/internal/email/process")
def process_outbox(
    request: Request,
    session: db.SessionDep,
    x_cron_secret: Annotated[str | None, Header()] = None,
) -> ProcessResult:
    """Send the emails that are due. Called by the scheduled workflow."""
    # Limits guessing of the secret; the real cron calls 4 times an hour.
    rate_limit(session, f"cron-email:{client_ip(request)}", limit=30, window_s=60)
    _check_cron_secret(x_cron_secret)
    provider = provider_from_settings(get_settings())
    now = utc_now()
    report = process_due(session, provider, now)
    # Retention (S9): old finished rows lose their words and invite.
    scrub_expired(session, now)
    return ProcessResult(
        sent=report.sent, skipped=report.skipped, retrying=report.retrying, failed=report.failed
    )


@router.get("/emails/log")
def email_log(
    session: db.SessionDep,
    # Not used in the body: asking for it is what makes this organisers-only.
    user: CurrentOrganiser,
    status: Literal["queued", "sending", "sent", "failed", "skipped"] | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[EmailLogItem]:
    """The newest outbox rows, with recipients partly hidden. Organisers only.

    The log is for checking that emails went out, not for collecting
    addresses, so organisers see just enough to recognise a guest. Subject and
    error pass through redact_links(): a queued row still holds the raw link
    in its body, and a provider error may quote it (S9).
    """
    query = select(EmailOutbox)
    if status is not None:
        query = query.where(EmailOutbox.status == status)
    query = query.order_by(EmailOutbox.id.desc()).limit(limit)
    return [
        EmailLogItem(
            id=row.id,
            kind=row.kind,
            to=mask_email(row.to_email),
            subject=redact_links(row.subject),
            status=row.status,
            attempts=row.attempts,
            next_attempt_at=row.next_attempt_at,
            sent_at=row.sent_at,
            last_error=redact_links(row.last_error) if row.last_error else None,
        )
        for row in session.scalars(query)
    ]
