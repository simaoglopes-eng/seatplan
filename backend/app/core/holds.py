"""Five-minute holds on a seat or a table, enforced by the database.

The flow for a person choosing a spot is: take_hold() -> (they look at the
details) -> confirm_hold() -> the caller writes the real assignment or booking
in the same transaction and commits.

Why the database decides: two requests can run at the very same moment on two
different serverless instances. Only a UNIQUE constraint sees both of them, so
we simply try to INSERT and treat the constraint violation as "taken".
"""

from datetime import datetime, timedelta

from sqlalchemy import ColumnElement, delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import HoldExpired, SeatTaken
from app.models import Hold, utc_now

HOLD_MINUTES = 5


def _same_resource(
    scope: str, resource_kind: str, resource_id: int, slot_key: str
) -> ColumnElement[bool]:
    """WHERE clause matching every hold on one resource in one slot."""
    return (
        (Hold.scope == scope)
        & (Hold.resource_kind == resource_kind)
        & (Hold.resource_id == resource_id)
        & (Hold.slot_key == slot_key)
    )


def take_hold(
    session: Session,
    *,
    scope: str,
    resource_kind: str,
    resource_id: int,
    holder_key: str,
    slot_key: str = "",
) -> Hold:
    """Hold a resource for HOLD_MINUTES and commit, or raise SeatTaken.

    In one transaction we (1) delete an expired hold on this resource, (2)
    delete this holder's own earlier hold on it so clicking twice refreshes
    the timer, and (3) insert the new hold. If another holder still has a live
    hold, step 3 breaks the unique constraint and we report SeatTaken.
    """
    now = utc_now()
    where = _same_resource(scope, resource_kind, resource_id, slot_key)
    session.execute(delete(Hold).where(where & (Hold.expires_at <= now)))
    session.execute(delete(Hold).where(where & (Hold.holder_key == holder_key)))
    hold = Hold(
        scope=scope,
        resource_kind=resource_kind,
        resource_id=resource_id,
        slot_key=slot_key,
        holder_key=holder_key,
        expires_at=now + timedelta(minutes=HOLD_MINUTES),
    )
    session.add(hold)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise SeatTaken() from None
    return hold


def release_hold(
    session: Session,
    *,
    scope: str,
    resource_kind: str,
    resource_id: int,
    holder_key: str,
    slot_key: str = "",
) -> bool:
    """Drop this holder's hold. Returns True when there was one. Does not commit."""
    where = _same_resource(scope, resource_kind, resource_id, slot_key)
    result = session.execute(delete(Hold).where(where & (Hold.holder_key == holder_key)))
    return result.rowcount > 0


def confirm_hold(
    session: Session,
    *,
    scope: str,
    resource_kind: str,
    resource_id: int,
    holder_key: str,
    slot_key: str = "",
    now: datetime | None = None,
) -> None:
    """Check the holder still has a live hold, then consume it.

    Does not commit: the caller inserts the seat assignment or table slots and
    commits once, so "hold gone" and "seat owned" happen together or not at all.
    Raises HoldExpired when there is no live hold for this holder.
    """
    moment = now or utc_now()
    where = _same_resource(scope, resource_kind, resource_id, slot_key)
    hold = session.scalars(select(Hold).where(where & (Hold.holder_key == holder_key))).first()
    if hold is None or hold.expires_at <= moment:
        raise HoldExpired()
    session.delete(hold)


def commit_or_seat_taken(session: Session) -> None:
    """Commit the confirmed seat assignment or table slots, or raise SeatTaken.

    A hold is only a polite reservation; the final say belongs to the UNIQUE
    constraints on seat_assignments and table_slots. If someone else already
    owns the spot (for example they confirmed just after our hold was taken
    over), the commit breaks that constraint and we report it the same way.
    """
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise SeatTaken() from None
