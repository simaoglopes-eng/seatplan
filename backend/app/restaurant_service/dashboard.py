"""The staff dashboard for one date: covers, utilisation, no-shows, a suggestion.

Every number is simple enough to count by hand from the bookings list:

- covers: guests per booking status on the date. "expected" counts every
  booking still coming or already here; "seated" counts only the guests who
  really arrived (seated, finishing or completed), so staff can compare the
  promise with what happened.
- utilisation per service: booked seat-minutes / available seat-minutes.
  A party of 4 sitting 90 minutes inside the service uses 4 x 90 = 360
  seat-minutes. Available = all seats of all tables x the service length.
- no-show rate: over the HISTORY_DAYS days before the date, no-shows divided
  by finished bookings (completed + no-show). Counted in bookings, not guests.
- overbooking SUGGESTION per service: expected covers x no-show rate, rounded
  down. If 1 in 10 parties usually does not come and 40 guests are booked,
  about 4 seats will be empty, so the venue could accept about 4 more covers.
  It is only a suggestion shown to staff; the system never overbooks by itself.
"""

from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Booking, ServicePeriod, Venue
from app.restaurant_service import occupancy, schedule
from app.restaurant_service.clock import hhmm, local_datetime

HISTORY_DAYS = 90
# Guests in these states are expected tonight (or already came).
EXPECTED_STATUSES = ("confirmed", "seated", "finishing", "completed")
# Guests in these states have actually come in and sat down.
SEATED_STATUSES = ("seated", "finishing", "completed")


def _bookings_on(session: Session, venue: Venue, day: date) -> list[Booking]:
    query = select(Booking).where((Booking.venue_id == venue.id) & (Booking.date == day))
    return list(session.scalars(query))


def _covers(bookings: list[Booking]) -> dict[str, int]:
    covers = {"expected": 0, "seated": 0, "no_show": 0, "cancelled": 0}
    for booking in bookings:
        if booking.status in EXPECTED_STATUSES:
            covers["expected"] += booking.party_size
        if booking.status in SEATED_STATUSES:
            covers["seated"] += booking.party_size
        if booking.status in ("no_show", "cancelled"):
            covers[booking.status] += booking.party_size
    return covers


def no_show_counts(session: Session, venue: Venue, day: date) -> tuple[int, int]:
    """(no-shows, finished bookings) over the HISTORY_DAYS days before `day`."""
    query = (
        select(Booking.status, func.count())
        .where(
            (Booking.venue_id == venue.id)
            & (Booking.date < day)
            & (Booking.date >= day - timedelta(days=HISTORY_DAYS))
            & Booking.status.in_(("completed", "no_show"))
        )
        .group_by(Booking.status)
    )
    counts: dict[str, int] = {}
    for status, count in session.execute(query):
        counts[status] = count
    no_shows = counts.get("no_show", 0)
    return no_shows, counts.get("completed", 0) + no_shows


def _overlap_minutes(start: datetime, end: datetime, low: datetime, high: datetime) -> float:
    return max(0.0, (min(end, high) - max(start, low)).total_seconds() / 60)


def _service_row(
    venue: Venue,
    day: date,
    period: ServicePeriod,
    bookings: list[Booking],
    seats: int,
    history: tuple[int, int],
) -> dict[str, Any]:
    opens = local_datetime(venue, day, period.start_time)
    closes = local_datetime(venue, day, period.end_time)
    in_service = [
        b for b in bookings if b.status in EXPECTED_STATUSES and opens <= b.start_at < closes
    ]
    used = sum(
        b.party_size * _overlap_minutes(b.start_at, b.end_at, opens, closes) for b in in_service
    )
    available = seats * (closes - opens).total_seconds() / 60
    covers = sum(b.party_size for b in in_service)
    no_shows, finished = history
    # Whole-number maths (covers x no-shows // finished) avoids float rounding
    # turning 4.0 into 3.999 and then into 3.
    extra = covers * no_shows // finished if finished else 0
    return {
        "service": period.name,
        "start": hhmm(period.start_time),
        "end": hhmm(period.end_time),
        "covers": covers,
        "covers_seated": sum(b.party_size for b in in_service if b.status in SEATED_STATUSES),
        "utilisation_percent": round(100 * used / available, 1) if available else 0.0,
        "overbooking_suggestion": {
            "is_suggestion": True,
            "extra_covers": extra,
            "formula": "expected covers x no-show rate, rounded down",
        },
    }


def dashboard(session: Session, venue: Venue, day: date) -> dict[str, Any]:
    bookings = _bookings_on(session, venue, day)
    seats = sum(table.max_party for table in occupancy.venue_tables(session, venue))
    no_shows, finished = no_show_counts(session, venue, day)
    services = [
        _service_row(venue, day, period, bookings, seats, (no_shows, finished))
        for period in schedule.periods_for_day(session, venue, day)
    ]
    return {
        "date": day.isoformat(),
        "covers": _covers(bookings),
        "bookings": len(bookings),
        "seats": seats,
        "no_show_rate": round(no_shows / finished, 3) if finished else 0.0,
        "no_show_based_on": finished,
        "services": services,
    }
