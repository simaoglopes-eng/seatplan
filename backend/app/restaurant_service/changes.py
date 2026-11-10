"""One call for "something changed": bump the live version and write the audit log.

Every write in the restaurants vertical calls record_change() before its
commit, so open maps refresh and the audit log always matches the data.
"""

from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app.core import audit, live
from app.models import Venue
from app.restaurant_service.occupancy import scope_for


def record_change(
    session: Session,
    venue: Venue,
    days: list[date],
    *,
    actor: str,
    action: str,
    entity: str,
    entity_id: str,
    detail: dict[str, Any] | None = None,
) -> None:
    """Does not commit. `days` lists every date the change touches (a booking
    moved from Friday to Saturday changes both evenings)."""
    for day in sorted(set(days)):
        live.bump(session, scope_for(venue, day))
    audit.record(
        session, actor=actor, action=action, entity=entity, entity_id=entity_id, detail=detail
    )
