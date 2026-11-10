"""The waitlist: join it, estimate the wait, and offer a freed table.

How the estimated wait works (also explained in docs/user-guide-diner.md):

1. Find every table, or allowed combination of tables, that could seat the
   party (size, accessibility). Call their number k.
2. Each of those tables frees up about once per turn time, the time a party of
   its size usually stays. We take the average of those turn times, T.
3. With k tables each freeing up every T minutes, on average one of them frees
   up every T / k minutes. Being number p in the queue, you wait about
   p x T / k minutes. We round up to the next 5 minutes.

Example: 4 tables fit a party of 2, their turn time is 90 minutes, and you are
second in line: 2 x 90 / 4 = 45 minutes.
"""

import math
from datetime import date, time

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Booking, Venue, WaitlistEntry
from app.optimiser.restaurant_model import candidate_choices
from app.restaurant_service import emails, occupancy, schedule
from app.restaurant_service.availability import PartyNeeds, table_specs_for
from app.restaurant_service.clock import booking_window, hhmm, is_past

ROUND_TO_MINUTES = 5


def estimate_wait(session: Session, venue: Venue, party_size: int, position: int) -> int | None:
    """Minutes of waiting, or None when no table could ever seat this party."""
    specs = {spec.id: spec for spec in table_specs_for(session, venue)}
    choices = candidate_choices(list(specs.values()), PartyNeeds(party_size).spec((0, 1)))
    if not choices:
        return None
    turn_times = [
        schedule.turn_minutes(session, venue, sum(specs[t].max_party for t in choice))
        for choice in choices
    ]
    average_turn = sum(turn_times) / len(turn_times)
    minutes = position * average_turn / len(choices)
    return math.ceil(minutes / ROUND_TO_MINUTES) * ROUND_TO_MINUTES


def position_of(session: Session, entry: WaitlistEntry) -> int:
    """1 + the number of people still waiting for the same date who joined earlier."""
    earlier = session.scalar(
        select(func.count())
        .select_from(WaitlistEntry)
        .where(
            (WaitlistEntry.venue_id == entry.venue_id)
            & (WaitlistEntry.date == entry.date)
            & (WaitlistEntry.status == "waiting")
            & (WaitlistEntry.id < entry.id)
        )
    )
    return (earlier or 0) + 1


def join(
    session: Session, venue: Venue, day: date, at: time, party_size: int, name: str, email: str
) -> WaitlistEntry:
    """Add an entry. Does not commit."""
    entry = WaitlistEntry(
        venue_id=venue.id,
        date=day,
        wanted_time=at,
        party_size=party_size,
        name=name,
        email=email,
        status="waiting",
    )
    session.add(entry)
    session.flush()
    return entry


def _waiting(session: Session, venue: Venue, day: date) -> list[WaitlistEntry]:
    query = (
        select(WaitlistEntry)
        .where(
            (WaitlistEntry.venue_id == venue.id)
            & (WaitlistEntry.date == day)
            & (WaitlistEntry.status == "waiting")
        )
        .order_by(WaitlistEntry.id)
    )
    return list(session.scalars(query))


def offer_freed_tables(
    session: Session, venue: Venue, freed: Booking, table_ids: tuple[int, ...]
) -> WaitlistEntry | None:
    """Offer the tables a cancelled booking gave back to the first matching entry.

    "Matching" means: same date, the wanted time has not passed yet, the
    entry's own stay (wanted time plus its turn time) overlaps the time the
    cancellation freed (otherwise the cancellation did not create this space,
    and an offer would use up the person's place for nothing), and that stay
    fits on the freed tables and is free there now. We do not book for them;
    we email them a link to book it themselves. Does not commit.
    """
    freed_specs = [spec for spec in table_specs_for(session, venue) if spec.id in table_ids]
    freed_window = booking_window(venue, freed)
    busy = occupancy.merge(
        occupancy.booked_slots(session, venue, freed.date),
        occupancy.held_slots(session, venue, freed.date),
    )
    for entry in _waiting(session, venue, freed.date):
        if is_past(venue, entry.date, entry.wanted_time):
            continue
        minutes = schedule.turn_minutes(session, venue, entry.party_size)
        window = schedule.window_for(entry.wanted_time, minutes)
        if not _overlaps(window, freed_window):
            continue
        party = PartyNeeds(entry.party_size).spec(window)
        if any(occupancy.is_free(c, busy, window) for c in candidate_choices(freed_specs, party)):
            entry.status = "offered"
            link = _booking_link(venue, entry)
            emails.queue_waitlist_offer(session, venue, entry, freed, link)
            return entry
    return None


def _overlaps(first: tuple[int, int], second: tuple[int, int]) -> bool:
    """Two half-open slot ranges [start, end) share at least one slot."""
    return first[0] < second[1] and second[0] < first[1]


def _booking_link(venue: Venue, entry: WaitlistEntry) -> str:
    base = get_settings().public_base_url
    when = f"date={entry.date.isoformat()}&time={hhmm(entry.wanted_time)}"
    return f"{base}/r/{venue.public_id}?{when}&party={entry.party_size}"
