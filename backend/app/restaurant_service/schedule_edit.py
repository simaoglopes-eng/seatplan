"""Read and replace a restaurant's schedule (staff only).

The schedule is small configuration (a few rows per weekday), so saving
replaces it completely: delete the old rows, insert the new ones, one commit.
Existing bookings are not touched; they keep the times they were given.
"""

from dataclasses import asdict, dataclass
from datetime import date, time
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models import BlackoutDate, ServicePeriod, TurnTime, Venue
from app.restaurant_service.clock import SLOT_MINUTES, hhmm, now_local


@dataclass(frozen=True)
class PeriodRow:
    name: str
    weekday: int
    start_time: time
    end_time: time
    slot_minutes: int
    max_covers_per_slot: int


@dataclass(frozen=True)
class TurnRow:
    max_party: int
    minutes: int


@dataclass(frozen=True)
class BlackoutRow:
    date: date
    reason: str


def read_schedule(session: Session, venue: Venue, upcoming_only: bool = False) -> dict[str, Any]:
    periods = session.scalars(
        select(ServicePeriod)
        .where(ServicePeriod.venue_id == venue.id)
        .order_by(ServicePeriod.weekday, ServicePeriod.start_time)
    )
    turns = session.scalars(
        select(TurnTime).where(TurnTime.venue_id == venue.id).order_by(TurnTime.max_party)
    )
    blackouts = select(BlackoutDate).where(BlackoutDate.venue_id == venue.id)
    if upcoming_only:
        blackouts = blackouts.where(BlackoutDate.date >= now_local(venue).date())
    return {
        "timezone": venue.timezone,
        "service_periods": [_period_dict(p) for p in periods],
        "turn_times": [{"max_party": t.max_party, "minutes": t.minutes} for t in turns],
        "blackout_dates": [
            {"date": b.date.isoformat(), "reason": b.reason}
            for b in session.scalars(blackouts.order_by(BlackoutDate.date))
        ],
    }


def _period_dict(period: ServicePeriod) -> dict[str, Any]:
    return {
        "name": period.name,
        "weekday": period.weekday,
        "start_time": hhmm(period.start_time),
        "end_time": hhmm(period.end_time),
        "slot_minutes": period.slot_minutes,
        "max_covers_per_slot": period.max_covers_per_slot,
    }


def _check_period(row: PeriodRow) -> None:
    """Seating times must land on the 15-minute grid that table_slots uses."""
    if row.start_time >= row.end_time:
        raise ApiError(422, "validation", f"{row.name}: the end must be after the start.")
    if row.start_time.minute % SLOT_MINUTES or row.end_time.minute % SLOT_MINUTES:
        raise ApiError(422, "validation", f"{row.name}: times must be on the quarter hour.")
    if row.slot_minutes % SLOT_MINUTES:
        raise ApiError(422, "validation", f"{row.name}: slot length must be a multiple of 15.")


def replace_schedule(
    session: Session,
    venue: Venue,
    periods: list[PeriodRow],
    turns: list[TurnRow],
    blackouts: list[BlackoutRow],
) -> None:
    """Swap in the new schedule. Does not commit."""
    for row in periods:
        _check_period(row)
    if len({t.max_party for t in turns}) != len(turns):
        raise ApiError(422, "validation", "Two turn times have the same party size.")
    for model in (ServicePeriod, TurnTime, BlackoutDate):
        session.execute(delete(model).where(model.venue_id == venue.id))
    session.add_all(ServicePeriod(venue_id=venue.id, **asdict(row)) for row in periods)
    session.add_all(TurnTime(venue_id=venue.id, **asdict(row)) for row in turns)
    session.add_all(BlackoutDate(venue_id=venue.id, **asdict(row)) for row in blackouts)
    from app.restaurant_service.publishing import recheck_after_edit

    recheck_after_edit(session, venue)
