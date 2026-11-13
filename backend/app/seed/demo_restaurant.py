"""Demo data for the restaurants vertical: one invented restaurant, "Casa Lumen".

seed() adds the rows (it assumes the demo organiser exists), does not commit,
and returns entry links by name for the demo home page.

What it creates:
- 18 tables in four zones (window, terrace, bar, quiet), some combinable,
  some accessible, some with room for a high chair, each with chairs drawn;
- lunch (Tuesday to Sunday) and dinner (every day), turn times, one closed date;
- bookings for today and the next three days, placed by the optimiser;
- two weeks of past dinners, mostly completed with a few no-shows, so the
  staff dashboard has a no-show rate to show.

Everything is invented and every email ends in @example.com. One
random.Random(SEED) makes the same bookings on every run for the same date;
only the manage-link tokens are truly random, because a predictable token
would let anyone open anyone's booking.
"""

import math
import random
from datetime import date, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    BlackoutDate,
    Booking,
    Organiser,
    Seat,
    ServicePeriod,
    TurnTime,
    Venue,
    VenueTable,
    Zone,
    utc_now,
)
from app.optimiser.restaurant_assign import recommend_table
from app.optimiser.restaurant_model import TableSpec
from app.restaurant_service import booking_rows, features, occupancy
from app.restaurant_service.availability import PartyNeeds
from app.restaurant_service.clock import now_local, slot_moment
from app.restaurant_service.schedule import times_between, window_for
from app.security import hash_token, new_token
from app.seed import demo_photos

SEED = 2026
# Same address as DEMO_ORGANISER_EMAIL in seed/run.py (which imports this module).
DEMO_ORGANISER_EMAIL = "organiser@example.com"
UPCOMING_DAYS = 4  # today and the next three days
HISTORY_DAYS = 14
NO_SHOW_CHANCE = 0.08

# (kind, name, x, y, w, h)
ZONES = (
    ("window", "Window", 0, 0, 1000, 150),
    ("quiet", "Quiet room", 0, 170, 480, 310),
    ("terrace", "Terrace", 0, 500, 620, 200),
    ("bar", "Bar", 640, 500, 360, 200),
)

# (zone kind, label, x, y, max_party, min_party, accessible, high_chair_ok, combine_group)
TABLES = (
    ("window", "W1", 40, 50, 2, 1, False, False, "window-pair"),
    ("window", "W2", 140, 50, 2, 1, False, False, "window-pair"),
    ("window", "W3", 260, 45, 4, 1, True, True, None),
    ("window", "W4", 400, 45, 4, 1, False, True, None),
    ("window", "W5", 560, 40, 6, 3, False, True, None),
    ("quiet", "Q1", 40, 220, 2, 1, True, False, None),
    ("quiet", "Q2", 140, 215, 4, 1, True, True, None),
    ("quiet", "Q3", 40, 340, 6, 3, True, True, None),
    ("quiet", "Q4", 230, 330, 10, 6, False, True, None),
    ("terrace", "T1", 40, 560, 2, 1, False, False, None),
    ("terrace", "T2", 140, 555, 4, 1, True, True, "terrace-row"),
    ("terrace", "T3", 260, 555, 4, 1, False, True, "terrace-row"),
    ("terrace", "T4", 380, 555, 4, 1, False, True, "terrace-row"),
    ("terrace", "T5", 40, 630, 8, 5, False, True, None),
    ("bar", "B1", 680, 560, 2, 1, False, False, None),
    ("bar", "B2", 760, 560, 2, 1, False, False, None),
    ("bar", "B3", 840, 560, 2, 1, False, False, None),
    ("bar", "B4", 680, 630, 4, 1, False, False, None),
)

# (name, weekdays, start, end, max covers arriving per seating time)
SERVICES = (
    ("Lunch", range(1, 7), time(12, 0), time(15, 0), 16),
    ("Dinner", range(7), time(19, 0), time(23, 0), 20),
)
TURN_TIMES = ((2, 90), (4, 105), (6, 120), (10, 150), (30, 180))
# Party sizes drawn for bookings: mostly couples and small groups.
PARTY_SIZES = (2, 2, 2, 2, 3, 4, 4, 4, 5, 6, 8)
PARTIES_PER_SERVICE = {"Lunch": 7, "Dinner": 12}

FIRST_NAMES = ("Alba", "Bento", "Clara", "Dario", "Elsa", "Fabio", "Gil", "Helena", "Ivo")
LAST_NAMES = ("Arruda", "Bastos", "Coelho", "Dores", "Esteves", "Faria", "Gomes", "Horta")


def free_slug(session: Session, wanted: str) -> str:
    """`wanted`, or `wanted-2`, `wanted-3`... when a restaurant already has it (a second seed)."""
    taken = set(session.scalars(select(Venue.slug).where(Venue.slug.startswith(wanted))))
    candidate, number = wanted, 1
    while candidate in taken:
        number += 1
        candidate = f"{wanted}-{number}"
    return candidate


def _demo_owner(session: Session) -> Organiser:
    owner = session.scalars(
        select(Organiser).where(Organiser.email == DEMO_ORGANISER_EMAIL)
    ).first()
    if owner is None:
        raise RuntimeError("Create the demo users before seeding the restaurant.")
    return owner


def _table_size(max_party: int) -> tuple[str, float, float]:
    """(shape, width, height): small tables are round, bigger ones rectangles."""
    if max_party <= 2:
        return "round", 50, 50
    if max_party <= 4:
        return "rect", 80, 60
    return "rect", 40 + 18 * max_party, 70


def _chairs(table: VenueTable) -> list[Seat]:
    """Chairs evenly around a round table, or along the two long sides of a rect."""
    cx, cy = table.x + table.w / 2, table.y + table.h / 2
    chairs: list[Seat] = []
    for i in range(table.max_party):
        if table.shape == "round":
            angle = 2 * math.pi * i / table.max_party
            x, y = cx + 38 * math.cos(angle), cy + 38 * math.sin(angle)
        else:
            per_side = math.ceil(table.max_party / 2)
            step = table.w / per_side
            x = table.x + step * (i % per_side + 0.5)
            y = table.y - 12 if i < per_side else table.y + table.h + 12
        chairs.append(
            Seat(
                venue_id=table.venue_id, table_id=table.id, label=f"{table.label}-{i + 1}", x=x, y=y
            )
        )
    return chairs


def _floor_plan(session: Session, venue: Venue) -> None:
    zone_ids: dict[str, int] = {}
    for kind, name, x, y, w, h in ZONES:
        zone = Zone(venue_id=venue.id, name=name, kind=kind, x=x, y=y, w=w, h=h)
        session.add(zone)
        session.flush()
        zone_ids[kind] = zone.id
    for kind, label, x, y, size, minimum, accessible, high_chair, group in TABLES:
        shape, w, h = _table_size(size)
        table = VenueTable(
            venue_id=venue.id,
            zone_id=zone_ids[kind],
            label=label,
            shape=shape,
            x=x,
            y=y,
            w=w,
            h=h,
            rotation=0.0,
            min_party=minimum,
            max_party=size,
            is_accessible=accessible,
            high_chair_ok=high_chair,
            combine_group=group,
        )
        session.add(table)
        session.flush()
        session.add_all(_chairs(table))


def _schedule(session: Session, venue: Venue, today: date) -> None:
    for name, weekdays, start, end, cap in SERVICES:
        for weekday in weekdays:
            session.add(
                ServicePeriod(
                    venue_id=venue.id,
                    name=name,
                    weekday=weekday,
                    start_time=start,
                    end_time=end,
                    slot_minutes=15,
                    max_covers_per_slot=cap,
                )
            )
    for max_party, minutes in TURN_TIMES:
        session.add(TurnTime(venue_id=venue.id, max_party=max_party, minutes=minutes))
    closed = today + timedelta(days=21)
    session.add(BlackoutDate(venue_id=venue.id, date=closed, reason="Private event"))


def _turn(party_size: int) -> int:
    for max_party, minutes in TURN_TIMES:
        if party_size <= max_party:
            return minutes
    return TURN_TIMES[-1][1]


def _person(rng: random.Random) -> tuple[str, str]:
    first, last = rng.choice(FIRST_NAMES), rng.choice(LAST_NAMES)
    return f"{first} {last}", f"{first.lower()}.{last.lower()}@example.com"


def _status(
    venue: Venue, day: date, window: tuple[int, int], past: bool, rng: random.Random
) -> str:
    """Past dinners are finished; today's depend on the clock; later ones are confirmed."""
    if past:
        return "no_show" if rng.random() < NO_SHOW_CHANCE else "completed"
    now = now_local(venue)
    if slot_moment(venue, day, window[1]) <= now:
        return "completed"
    if slot_moment(venue, day, window[0]) <= now:
        return "seated"
    return "confirmed"


def _add_booking(
    session: Session,
    venue: Venue,
    day: date,
    window: tuple[int, int],
    size: int,
    status: str,
    rng: random.Random,
) -> Booking:
    name, email = _person(rng)
    booking = Booking(
        venue_id=venue.id,
        party_size=size,
        name=name,
        email=email,
        status=status,
        source="diner",
        table_choice="auto",
        manage_token_hash=hash_token(new_token()),
    )
    booking_rows.set_times(venue, booking, day, window)
    session.add(booking)
    session.flush()
    return booking


def _seed_service(
    session: Session,
    venue: Venue,
    specs: list[TableSpec],
    day: date,
    service: tuple[str, range, time, time, int],
    rng: random.Random,
) -> None:
    """Place one service's parties with the optimiser, like diners booking one by one."""
    name, _weekdays, start, end, cap = service
    times = times_between(start, end, 15)[:-4]  # nobody books in the last hour
    busy: occupancy.Busy = {}
    arriving: dict[time, int] = {}
    past = day < now_local(venue).date()
    for _ in range(PARTIES_PER_SERVICE[name]):
        size, at = rng.choice(PARTY_SIZES), rng.choice(times)
        window = window_for(at, _turn(size))
        picks = recommend_table(specs, busy, PartyNeeds(size).spec(window), top=1)
        if not picks or arriving.get(at, 0) + size > cap:
            continue
        arriving[at] = arriving.get(at, 0) + size
        for table_id in picks[0].table_ids:
            busy.setdefault(table_id, set()).update(range(*window))
        status = _status(venue, day, window, past, rng)
        booking = _add_booking(session, venue, day, window, size, status, rng)
        if status in occupancy.ACTIVE_STATUSES:
            booking_rows.write_slots(session, booking, picks[0].table_ids, window)


def seed(session: Session) -> dict[str, str]:
    venue = Venue(
        organiser_id=_demo_owner(session).id,
        kind="restaurant",
        name="Casa Lumen",
        is_demo=True,
        timezone="Europe/Lisbon",
        width=1000,
        height=700,
        slug=free_slug(session, "casa-lumen"),
        status="published",
        published_at=utc_now(),
        description="A friendly bistro in the Chiado with a sunny window row, a quiet room, a terrace and a small bar.",
        cuisines=["portuguese", "mediterranean"],
        price_level=2,
        address="Rua Garrett 12, Lisboa",
        lat=38.7108,
        lng=-9.1415,
        phone="+351 210 000 100",
        instagram="casa_lumen_demo",
    )
    session.add(venue)
    session.flush()
    demo_photos.add_photos(
        session, venue, (("linen_bistro", "An illustration of a bright dining room with a window"),)
    )
    today = now_local(venue).date()
    _floor_plan(session, venue)
    features.refresh_features(session, venue)
    _schedule(session, venue, today)
    specs = occupancy.table_specs(
        occupancy.venue_tables(session, venue), occupancy.zone_kinds(session, venue)
    )
    rng = random.Random(SEED)
    for offset in range(-HISTORY_DAYS, UPCOMING_DAYS):
        day = today + timedelta(days=offset)
        for service in SERVICES:
            if day.weekday() in service[1]:
                _seed_service(session, venue, specs, day, service, rng)
    return {
        "restaurant_booking": f"/r/{venue.public_id}",
        "restaurant_staff": f"/staff/{venue.public_id}",
    }
