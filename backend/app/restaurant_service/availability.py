"""Which seating times are available, limited or full for one party.

A time is "full" when it has passed, when the covers cap for that seating
would be exceeded, or when no table (or allowed combination) is free for the
whole stay. It is "limited" when it is bookable but close to full.
"""

from collections.abc import Iterable
from dataclasses import dataclass, replace
from datetime import date, time
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models import ServicePeriod, Venue
from app.optimiser.restaurant_model import (
    PartySpec,
    TableSpec,
    candidate_choices,
    largest_party,
)
from app.restaurant_service import ambience_view, occupancy, schedule
from app.restaurant_service.clock import hhmm, is_past, slot_of

# Id used for a party that has no booking row yet. Real booking ids start at 1.
NEW_PARTY_ID = 0
# With this many table options or fewer left, the time is shown as "limited".
FEW_TABLES_LEFT = 2
# Even if tables could be joined for more, bigger groups call the restaurant.
MAX_ONLINE_PARTY = 30
# The ambience wishes a diner may tick (spec 8.1), at most this many at once.
PREF_KEYS = ("sun", "shade", "view", "quiet", "away_from_wc")
MAX_PREFS = 5


@dataclass(frozen=True)
class PartyNeeds:
    """What the diner told us about their party."""

    size: int
    needs_accessible: bool = False
    high_chairs: int = 0
    zone_pref: str | None = None
    prefs: frozenset[str] = frozenset()

    def spec(self, window: tuple[int, int], party_id: int = NEW_PARTY_ID) -> PartySpec:
        return PartySpec(
            id=party_id,
            size=self.size,
            start_slot=window[0],
            end_slot=window[1],
            needs_accessible=self.needs_accessible,
            high_chairs=self.high_chairs,
            zone_pref=self.zone_pref,
            fixed_tables=None,
            prefs=self.prefs,
        )


def clean_prefs(keys: Iterable[str]) -> frozenset[str]:
    """The wishes as a set, or 422: only known wishes, never sunny and shade
    together, and no more than MAX_PREFS."""
    wanted = list(keys)
    unknown = sorted({key for key in wanted if key not in PREF_KEYS})
    if unknown:
        raise ApiError(422, "validation", f"Unknown wish: {unknown[0]}.")
    if len(wanted) > MAX_PREFS:
        raise ApiError(422, "validation", f"Choose at most {MAX_PREFS} wishes.")
    if "sun" in wanted and "shade" in wanted:
        raise ApiError(422, "validation", "A table cannot be both sunny and in the shade.")
    return frozenset(wanted)


def max_party(session: Session, venue: Venue) -> int:
    """The biggest party that can ever book online here.

    Three limits, the smallest wins: the largest table or allowed combination
    of tables, the largest covers cap of any service (a party of 25 never fits
    under a cap of 20), and MAX_ONLINE_PARTY.
    """
    caps = session.scalars(
        select(ServicePeriod.max_covers_per_slot).where(ServicePeriod.venue_id == venue.id)
    )
    biggest_cap = max(caps, default=0)
    return min(largest_party(table_specs_for(session, venue)), biggest_cap, MAX_ONLINE_PARTY)


def check_party_size(session: Session, venue: Venue, size: int) -> None:
    """422 for a party no table can ever take, instead of an endless "full"."""
    limit = max_party(session, venue)
    if size > limit:
        raise ApiError(
            422,
            "validation",
            f"Online booking is for up to {limit} people. Please call the restaurant.",
        )


def _lock_period(session: Session, period: ServicePeriod) -> None:
    """Lock this service's row until our transaction ends.

    The cap is "read the covers, then insert the booking". Two confirms that
    both read before either writes would each see room and together break the
    cap. Updating the row (to the value it already has) makes the database
    lock it: on Postgres a second transaction waits at this line until the
    first commits, on SQLite the update takes the single write lock. So the
    second request reads the covers only after the first booking is saved.
    """
    session.execute(
        update(ServicePeriod)
        .where(ServicePeriod.id == period.id)
        .values(max_covers_per_slot=ServicePeriod.max_covers_per_slot)
    )


def check_covers_cap(
    session: Session,
    venue: Venue,
    day: date,
    period: ServicePeriod,
    at: time,
    party_size: int,
    ignore_booking: int | None = None,
) -> None:
    """Refuse with 409 when this seating time already has too many guests arriving.

    max_covers_per_slot limits arrivals per seating time (kitchen pacing): the
    kitchen can start only so many meals at 19:30, however many tables are free.
    Does not commit: the caller writes and commits while the lock is held.
    """
    _lock_period(session, period)
    arriving = occupancy.covers_by_start(session, venue, day, ignore_booking).get(slot_of(at), 0)
    if arriving + party_size > period.max_covers_per_slot:
        raise ApiError(409, "conflict", "This time is fully booked. Please pick another time.")


def _status(free_options: int, covers_left: int, party_size: int) -> tuple[str, str | None]:
    """(status, reason) from what is left after this party would book."""
    if covers_left < party_size:
        return "full", "covers_cap"
    if free_options == 0:
        return "full", "no_table"
    if free_options <= FEW_TABLES_LEFT or covers_left - party_size < party_size:
        return "limited", None
    return "available", None


def _options_left(
    candidates: list[tuple[int, ...]], busy: occupancy.Busy, window: tuple[int, int]
) -> int:
    return sum(1 for choice in candidates if occupancy.is_free(choice, busy, window))


def slot_statuses(
    session: Session, venue: Venue, day: date, needs: PartyNeeds
) -> list[dict[str, Any]]:
    """Every seating time of the date with its status for this party."""
    specs = table_specs_for(session, venue)
    # Which tables fit does not depend on the time, so we compute it once.
    candidates = candidate_choices(specs, needs.spec((0, 1)))
    busy = occupancy.merge(
        occupancy.booked_slots(session, venue, day), occupancy.held_slots(session, venue, day)
    )
    covers = occupancy.covers_by_start(session, venue, day)
    minutes = schedule.turn_minutes(session, venue, needs.size)
    result: list[dict[str, Any]] = []
    for period in schedule.periods_for_day(session, venue, day):
        for at in schedule.start_times(period):
            if is_past(venue, day, at):
                status, reason = "full", "past"
            else:
                window = schedule.window_for(at, minutes)
                covers_left = period.max_covers_per_slot - covers.get(slot_of(at), 0)
                options = _options_left(candidates, busy, window)
                status, reason = _status(options, covers_left, needs.size)
            result.append(
                {"time": hhmm(at), "service": period.name, "status": status, "reason": reason}
            )
    return result


def table_specs_for(
    session: Session,
    venue: Venue,
    needs: PartyNeeds | None = None,
    day: date | None = None,
    at: time | None = None,
) -> list[TableSpec]:
    """The optimiser's tables. When the party has wishes and the stay is known,
    every table also carries its ambience features for that stay."""
    tables = occupancy.venue_tables(session, venue)
    specs = occupancy.table_specs(tables, occupancy.zone_kinds(session, venue))
    if needs is None or not needs.prefs or day is None or at is None:
        return specs
    features = ambience_view.table_features(session, venue, day, at, needs.size)
    return [replace(spec, features=features.get(spec.id, frozenset())) for spec in specs]


def day_summary(session: Session, venue: Venue, day: date, needs: PartyNeeds) -> dict[str, Any]:
    """The answer of GET /r/{vid}/slots: closed dates say why, open dates list times."""
    blackout = schedule.blackout_on(session, venue, day)
    if blackout is not None:
        return {"date": day.isoformat(), "closed": True, "reason": blackout.reason, "slots": []}
    slots = slot_statuses(session, venue, day, needs)
    return {"date": day.isoformat(), "closed": False, "reason": None, "slots": slots}
