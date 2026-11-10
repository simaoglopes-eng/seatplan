"""Five-minute table holds for the diner flow, built on core/holds.py.

A table hold is one row in `holds` per table per 15-minute slot of the stay,
with the slot index as slot_key. That way a hold for 19:00-21:00 and another
for 20:00-22:00 on the same table really clash: both want slot 80 (20:00).

The diner receives a random hold_id. The holder_key we store is
"<client>:<choice>:<hash of hold_id>": who asked (see client_key), how the
table was picked ("chosen" by the diner or "auto" by the optimiser), and the
hash. Knowing the hold_id is what proves "this hold is mine".

Holds are free to take and need no login, so two caps stop one person from
holding a whole evening (both are counted from the holds table, so they work
across serverless instances):
- one client may have at most MAX_HOLDS_PER_CLIENT live holds per date;
- live holds may never cover more than half the tables at any one slot, so
  the other half always stays bookable, however many addresses an attacker uses.
These are soft limits against abuse: two requests at the very same moment may
both pass. Double booking is still impossible, because that is the job of the
UNIQUE constraints, not of these caps.
"""

import hashlib
import hmac
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.errors import ApiError, HoldExpired, SeatTaken
from app.core.holds import confirm_hold, release_hold, take_hold
from app.models import Hold, Venue, utc_now
from app.restaurant_service.occupancy import scope_for
from app.security import hash_token, new_token

MAX_HOLDS_PER_CLIENT = 3
# Share of the tables that live holds may cover in one slot (1/2 = half).
MAX_HELD_SHARE = 2


@dataclass(frozen=True)
class HeldTables:
    """What a hold_id stands for, read back from the hold rows."""

    day: date
    table_ids: tuple[int, ...]
    window: tuple[int, int]
    table_choice: str
    expires_at: datetime
    holder_key: str


def client_key(address: str) -> str:
    """A short keyed hash of the client address.

    We need to recognise "the same client again" but must not store IP
    addresses (personal data). A plain SHA-256 of an IPv4 address can be
    reversed by trying all 4 billion of them, so the hash is keyed with
    SECRET_KEY.
    """
    key = get_settings().secret_key.encode("utf-8")
    return hmac.new(key, address.encode("utf-8"), hashlib.sha256).hexdigest()[:16]


def _holder_key(client: str, hold_id: str, table_choice: str) -> str:
    return f"{client}:{table_choice}:{hash_token(hold_id)}"


def _live_holds(session: Session, venue: Venue, day: date) -> list[Hold]:
    query = select(Hold).where(
        (Hold.scope == scope_for(venue, day))
        & (Hold.resource_kind == "table")
        & (Hold.expires_at > utc_now())
    )
    return list(session.scalars(query))


def check_hold_caps(
    session: Session,
    venue: Venue,
    day: date,
    client: str,
    wanted: tuple[tuple[int, ...], tuple[int, int]],
    table_count: int,
) -> None:
    """429 when this new hold (tables, window) would break one of the two caps."""
    live = _live_holds(session, venue, day)
    own = {hold.holder_key for hold in live if hold.holder_key.startswith(f"{client}:")}
    if len(own) >= MAX_HOLDS_PER_CLIENT:
        raise ApiError(
            429,
            "rate_limited",
            "You are already holding tables for this date. Book or release one first.",
        )
    table_ids, window = wanted
    for slot in range(*window):
        held = {hold.resource_id for hold in live if hold.slot_key == str(slot)}
        if len(held | set(table_ids)) * MAX_HELD_SHARE > table_count:
            raise ApiError(
                429,
                "rate_limited",
                "Many tables are being chosen right now. Please try again in a few minutes.",
            )


def _release_all(
    session: Session, scope: str, taken: list[tuple[int, int]], holder_key: str
) -> None:
    for table_id, slot in taken:
        release_hold(
            session,
            scope=scope,
            resource_kind="table",
            resource_id=table_id,
            holder_key=holder_key,
            slot_key=str(slot),
        )
    session.commit()


def hold_tables(
    session: Session,
    venue: Venue,
    day: date,
    table_ids: tuple[int, ...],
    window: tuple[int, int],
    table_choice: str,
    client: str,
) -> tuple[str, datetime]:
    """Hold every slot of every table, or nothing. Returns (hold_id, expires_at).

    Everyone takes the slots in the same order (table id, then slot), so for
    the same table and time the very first slot already decides who wins.
    If any slot is taken we give back the ones we got and raise SeatTaken.
    """
    hold_id = new_token()
    holder_key = _holder_key(client, hold_id, table_choice)
    scope = scope_for(venue, day)
    taken: list[tuple[int, int]] = []
    expires_at: datetime | None = None
    for table_id in sorted(table_ids):
        for slot in range(*window):
            try:
                hold = take_hold(
                    session,
                    scope=scope,
                    resource_kind="table",
                    resource_id=table_id,
                    holder_key=holder_key,
                    slot_key=str(slot),
                )
            except SeatTaken:
                _release_all(session, scope, taken, holder_key)
                raise
            taken.append((table_id, slot))
            expires_at = hold.expires_at if expires_at is None else min(expires_at, hold.expires_at)
    assert expires_at is not None  # a window always has at least one slot
    return hold_id, expires_at


def _rows_for(session: Session, venue: Venue, hold_id: str) -> list[Hold]:
    # Matched on the hash alone: a diner whose phone changes network (and so
    # address) between holding and booking still owns the hold.
    query = select(Hold).where(
        Hold.holder_key.endswith(f":{hash_token(hold_id)}")
        & Hold.scope.startswith(f"venue-{venue.public_id}-", autoescape=True)
        & (Hold.resource_kind == "table")
    )
    return list(session.scalars(query))


def read_hold(session: Session, venue: Venue, hold_id: str) -> HeldTables:
    """What the hold covers, or HoldExpired if there is no such hold."""
    rows = _rows_for(session, venue, hold_id)
    if not rows:
        raise HoldExpired()
    slots = sorted(int(row.slot_key) for row in rows)
    # The scope ends with the date: "venue-<public id>-2026-11-20".
    day = date.fromisoformat(rows[0].scope[-10:])
    return HeldTables(
        day=day,
        table_ids=tuple(sorted({row.resource_id for row in rows})),
        window=(slots[0], slots[-1] + 1),
        table_choice=rows[0].holder_key.split(":")[1],
        expires_at=min(row.expires_at for row in rows),
        holder_key=rows[0].holder_key,
    )


def consume_hold(session: Session, venue: Venue, held: HeldTables) -> None:
    """Delete every hold row, checking each is still live. Does not commit."""
    scope = scope_for(venue, held.day)
    for table_id in held.table_ids:
        for slot in range(*held.window):
            confirm_hold(
                session,
                scope=scope,
                resource_kind="table",
                resource_id=table_id,
                holder_key=held.holder_key,
                slot_key=str(slot),
            )


def release_held_tables(session: Session, venue: Venue, hold_id: str) -> date:
    """Give back every table of a hold (the diner changed their mind). Does not commit.

    Returns the date, so the caller can refresh open maps. An unknown or
    already released hold is a 404, like every other unknown token.
    """
    rows = _rows_for(session, venue, hold_id)
    if not rows:
        raise ApiError(404, "not_found", "This hold does not exist any more.")
    for row in rows:
        session.delete(row)
    return date.fromisoformat(rows[0].scope[-10:])
