"""Opening hours: service periods, seating times, turn times and blackout dates.

Answers three questions for the rest of the vertical:
- which seating times exist on a date (start_times),
- how long a party of this size keeps its table (turn_minutes),
- may a diner book this date and time at all (check_bookable)?
"""

from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models import BlackoutDate, ServicePeriod, TurnTime, Venue
from app.restaurant_service.clock import SLOT_MINUTES, SLOTS_PER_DAY, is_past, slot_of

# Used only when a restaurant has not set any turn times yet.
DEFAULT_TURN_MINUTES = 120


def periods_for_day(session: Session, venue: Venue, day: date) -> list[ServicePeriod]:
    query = (
        select(ServicePeriod)
        .where((ServicePeriod.venue_id == venue.id) & (ServicePeriod.weekday == day.weekday()))
        .order_by(ServicePeriod.start_time)
    )
    return list(session.scalars(query))


def blackout_on(session: Session, venue: Venue, day: date) -> BlackoutDate | None:
    query = select(BlackoutDate).where(
        (BlackoutDate.venue_id == venue.id) & (BlackoutDate.date == day)
    )
    return session.scalars(query).first()


def times_between(start: time, end: time, step_minutes: int) -> list[time]:
    """start, start + step, ... while still before end."""
    times: list[time] = []
    # time objects cannot be added to, so we walk on a datetime of a fixed day.
    moment = datetime.combine(date.min, start)
    finish = datetime.combine(date.min, end)
    while moment < finish:
        times.append(moment.time())
        moment += timedelta(minutes=step_minutes)
    return times


def start_times(period: ServicePeriod) -> list[time]:
    """Every seating time of a period."""
    return times_between(period.start_time, period.end_time, period.slot_minutes)


def period_at(periods: list[ServicePeriod], at: time) -> ServicePeriod | None:
    """The period in which `at` is one of the seating times, if any."""
    for period in periods:
        if at in start_times(period):
            return period
    return None


def turn_minutes(session: Session, venue: Venue, party_size: int) -> int:
    """How long a party keeps its table.

    Turn times are rows like "up to 2 people: 90 minutes, up to 4: 105".
    We take the first row whose max_party is big enough; a party bigger than
    every row gets the longest time, because big groups stay longest.
    """
    rows = list(
        session.scalars(
            select(TurnTime).where(TurnTime.venue_id == venue.id).order_by(TurnTime.max_party)
        )
    )
    for row in rows:
        if party_size <= row.max_party:
            return row.minutes
    if rows:
        return max(row.minutes for row in rows)
    return DEFAULT_TURN_MINUTES


def window_for(at: time, minutes: int) -> tuple[int, int]:
    """Slot range [start, end) for a stay of `minutes` starting at local time `at`.

    A stay that would run past midnight is cut at midnight: the slots of one
    date never spill into the next date, which keeps table_slots simple.
    """
    start = slot_of(at)
    end = start + -(-minutes // SLOT_MINUTES)
    return start, min(end, SLOTS_PER_DAY)


def check_bookable(session: Session, venue: Venue, day: date, at: time) -> ServicePeriod:
    """Return the service period for this seating time, or refuse with 422."""
    blackout = blackout_on(session, venue, day)
    if blackout is not None:
        reason = f" ({blackout.reason})" if blackout.reason else ""
        raise ApiError(422, "validation", f"The restaurant is closed on this date{reason}.")
    period = period_at(periods_for_day(session, venue, day), at)
    if period is None:
        raise ApiError(422, "validation", "There is no seating at this time.")
    if is_past(venue, day, at):
        raise ApiError(422, "validation", "This time has already passed.")
    return period
