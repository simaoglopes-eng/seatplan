"""Audit log writer: who did what to which record, and when."""

from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog


def record(
    session: Session,
    *,
    actor: str,
    action: str,
    entity: str,
    entity_id: str,
    detail: dict[str, Any] | None = None,
) -> AuditLog:
    """Add one audit row. Does not commit: the row is saved together with the
    change it describes, so the log never mentions a change that failed.

    Never put passwords, tokens, emails or dietary notes in detail.
    """
    entry = AuditLog(
        actor=actor,
        action=action,
        entity=entity,
        entity_id=entity_id,
        detail=detail or {},
    )
    session.add(entry)
    return entry
