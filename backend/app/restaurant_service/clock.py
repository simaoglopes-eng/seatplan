"""Dates, times and 15-minute slots, always in the restaurant's own time zone.

A diner thinks in local wall-clock time ("dinner at 19:30 in Lisbon"). The
database stores moments in UTC. This module is the only place that converts
between the two, so every other module can speak in slots and local times.

A day is cut into 96 slots of 15 minutes: slot 0 is 00:00-00:15 local time,
slot 78 is 19:30-19:45. Slots follow the wall clock, so on the night the clocks
change a slot can be shorter or longer in real time; that is what a diner
expects ("my table is booked from 19:00 to 21:00").
"""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.models import Booking, Venue

SLOT_MINUTES = 15
SLOTS_PER_DAY = 24 * 60 // SLOT_MINUTES


def venue_zone(venue: Venue) -> ZoneInfo:
    return ZoneInfo(venue.timezone)


def slot_of(moment: time) -> int:
    """The slot a local time falls in: 19:30 -> 78, 19:40 -> 78."""
    return (moment.hour * 60 + moment.minute) // SLOT_MINUTES


def time_of_slot(slot: int) -> time:
    """Local start time of a slot: 78 -> 19:30. Slot 96 is the next midnight."""
    minutes = (slot % SLOTS_PER_DAY) * SLOT_MINUTES
    return time(minutes // 60, minutes % 60)


def slot_moment(venue: Venue, day: date, slot: int) -> datetime:
    """The aware local datetime at which a slot starts.

    Slot 96 (the end of the last slot) is midnight of the next day. We build
    the datetime from the wall-clock date and time instead of adding minutes,
    so a daylight saving change in between cannot shift it.
    """
    if slot >= SLOTS_PER_DAY:
        return datetime.combine(day + timedelta(days=1), time(0, 0), tzinfo=venue_zone(venue))
    return datetime.combine(day, time_of_slot(slot), tzinfo=venue_zone(venue))


def local_datetime(venue: Venue, day: date, at: time) -> datetime:
    return datetime.combine(day, at, tzinfo=venue_zone(venue))


def now_local(venue: Venue) -> datetime:
    return datetime.now(venue_zone(venue))


def is_past(venue: Venue, day: date, at: time) -> bool:
    """True when this local date and time has already started at the venue."""
    return local_datetime(venue, day, at) <= now_local(venue)


def booking_window(venue: Venue, booking: Booking) -> tuple[int, int]:
    """The half-open slot range [start, end) a booking occupies on its date."""
    zone = venue_zone(venue)
    start = booking.start_at.astimezone(zone)
    end = booking.end_at.astimezone(zone)
    start_slot = slot_of(start.time())
    if end.date() > booking.date:
        return start_slot, SLOTS_PER_DAY
    # Round a partial slot up: a booking ending at 21:10 still blocks 21:00-21:15.
    end_minutes = end.hour * 60 + end.minute
    end_slot = -(-end_minutes // SLOT_MINUTES)
    return start_slot, end_slot


def hhmm(moment: time) -> str:
    return moment.strftime("%H:%M")
