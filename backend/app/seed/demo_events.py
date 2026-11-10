"""Demo data for the events vertical: a wedding and a conference.

seed() adds the rows (it assumes the demo organiser exists), does not commit,
and returns entry links by name for the demo home page.

Everything is invented: names are made up and every email ends in
@example.com. One random.Random(SEED) makes the people, groups and seats the
same on every run. Only the personal-link tokens are truly random (from
`secrets`), because a predictable token would let anyone open anyone's page.
"""

import math
import random
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.layout import rebuild_neighbours
from app.events_service.access import attendee_link
from app.events_service.problem import build_problem, event_guests, venue_seats
from app.models import (
    Acquaintance,
    Event,
    Guest,
    GuestGroup,
    Organiser,
    Seat,
    SeatAssignment,
    Venue,
    VenueTable,
    Zone,
)
from app.optimiser.events_anneal import solve
from app.security import hash_token, new_token

SEED = 2026
# Same address as DEMO_ORGANISER_EMAIL in seed/run.py. Not imported from there
# because run.py imports this module (a circular import).
DEMO_ORGANISER_EMAIL = "organiser@example.com"

FIRST_NAMES = (
    "Ana",
    "Bruno",
    "Carla",
    "Duarte",
    "Eva",
    "Filipe",
    "Grace",
    "Hugo",
    "Ines",
    "Joao",
    "Kai",
    "Lara",
    "Miguel",
    "Nadia",
    "Oscar",
    "Paula",
    "Quentin",
    "Rita",
    "Sofia",
    "Tiago",
    "Uma",
    "Vasco",
    "Wendy",
    "Xavier",
    "Yara",
    "Zeca",
    "Alice",
    "Bernardo",
    "Clara",
    "Diogo",
    "Elena",
    "Frederico",
    "Gil",
    "Helena",
    "Ivo",
    "Joana",
    "Leonor",
    "Marta",
    "Nuno",
    "Olga",
)
LAST_NAMES = (
    "Almeida",
    "Barros",
    "Cardoso",
    "Dias",
    "Esteves",
    "Faria",
    "Gomes",
    "Henriques",
    "Ilha",
    "Jardim",
    "Lobo",
    "Machado",
    "Neves",
    "Oliveira",
    "Pinto",
    "Queiroz",
    "Ramos",
    "Santos",
    "Teixeira",
    "Valente",
    "Xisto",
    "Zarco",
    "Moura",
    "Freitas",
)
COMPANIES = (
    "Northwind Labs",
    "Blue Harbour",
    "Tagus Data",
    "Orbit Studio",
    "Pine Analytics",
    "Sunny Robotics",
    "Cork & Code",
    "Atlas Health",
)


# ---------------------------------------------------------------- people


def _people(rng: random.Random, count: int) -> list[tuple[str, str]]:
    """`count` different (first name, last name) pairs, always in the same order."""
    pairs = [(first, last) for first in FIRST_NAMES for last in LAST_NAMES]
    return rng.sample(pairs, count)


def _group(session: Session, event: Event, name: str, keep_adjacent: bool) -> GuestGroup:
    group = GuestGroup(event_id=event.id, name=name, keep_adjacent=keep_adjacent)
    session.add(group)
    session.flush()
    return group


def _guest(
    session: Session,
    event: Event,
    person: tuple[str, str],
    group: GuestGroup | None,
    **fields: object,
) -> tuple[Guest, str]:
    first, last = person
    token = new_token()
    guest = Guest(
        event_id=event.id,
        name=f"{first} {last}",
        email=f"{first}.{last}.{event.id}@example.com".lower(),
        token_hash=hash_token(token),
        group_id=group.id if group else None,
        rsvp="yes",
        **fields,
    )
    session.add(guest)
    session.flush()
    return guest, token


def _acquaintances(session: Session, guests: list[Guest], rng: random.Random, pairs: int) -> None:
    """Random "I know them" links, plus most people knowing their own group."""
    links: set[tuple[int, int]] = set()
    for guest in guests:
        for other in guests:
            same_group = other.group_id is not None and other.group_id == guest.group_id
            # Draw the random number for every pair, so the sequence never shifts.
            knows = rng.random() < 0.7
            if other.id != guest.id and same_group and knows:
                links.add((guest.id, other.id))
    while pairs > 0:
        first, second = rng.sample(guests, 2)
        links.add((first.id, second.id))
        pairs -= 1
    session.add_all(Acquaintance(guest_id=a, knows_guest_id=b) for a, b in sorted(links))
    session.flush()


def _seat_some(session: Session, event: Event, share: float, rng: random.Random) -> None:
    """Seat about `share` of the guests as if they had chosen themselves.

    We let the optimiser draw a sensible plan first, so the demo shows friends
    sitting together, then keep a random part of it as "self" choices.
    """
    guests = event_guests(session, event)
    problem = build_problem(session, venue_seats(session, event.venue_id), guests, {})
    plan = solve(problem, seed=SEED, max_iterations=3000).assignment
    chosen = rng.sample(sorted(plan), min(len(plan), round(len(guests) * share)))
    for guest_id in sorted(chosen):
        session.add(
            SeatAssignment(
                event_id=event.id, guest_id=guest_id, seat_id=plan[guest_id], source="self"
            )
        )
    session.flush()


# ---------------------------------------------------------------- wedding


def _round_table(session: Session, venue: Venue, label: str, cx: float, cy: float) -> list[Seat]:
    """A round table of 8, seats evenly around it, seat 1 at the top."""
    table = VenueTable(
        venue_id=venue.id,
        label=label,
        shape="round",
        x=cx - 50,
        y=cy - 50,
        w=100,
        h=100,
        max_party=8,
    )
    session.add(table)
    session.flush()
    seats = []
    for index in range(8):
        angle = -math.pi / 2 + index * 2 * math.pi / 8
        seat = Seat(
            venue_id=venue.id,
            table_id=table.id,
            label=str(index + 1),
            x=round(cx + 75 * math.cos(angle), 1),
            y=round(cy + 75 * math.sin(angle), 1),
        )
        session.add(seat)
        seats.append(seat)
    return seats


def _wedding_venue(session: Session, organiser: Organiser) -> Venue:
    venue = Venue(
        organiser_id=organiser.id, kind="event", name="Quinta do Lago Azul", width=1200, height=800
    )
    session.add(venue)
    session.flush()
    session.add(
        Zone(venue_id=venue.id, name="Dance floor", kind="stage", x=500, y=40, w=200, h=120)
    )
    tables = []
    for index in range(10):
        row, column = divmod(index, 5)
        tables.append(
            _round_table(session, venue, f"T{index + 1}", 160 + column * 220, 300 + row * 280)
        )
    for seat in tables[0]:
        seat.reserved_tag = "family"  # the head table
    tables[1][0].reserved_tag = "vip"
    tables[1][1].reserved_tag = "vip"
    for seat in tables[8][:2] + tables[9][:2]:
        seat.is_accessible = True
    tables[4][4].is_blocked = True  # behind a pillar
    session.flush()
    rebuild_neighbours(session, venue.id)
    return venue


def _wedding_guests(session: Session, event: Event, rng: random.Random) -> dict[str, str]:
    """About 70 guests in families and friend groups. Returns a few demo tokens."""
    people = iter(_people(rng, 72))
    tokens: dict[str, str] = {}
    head = _group(session, event, "Bride and groom's families", keep_adjacent=True)
    for _ in range(8):
        _guest(session, event, next(people), head, reserved_tag="family")
    godparents = _group(session, event, "Godparents", keep_adjacent=True)
    for _ in range(2):
        _guest(session, event, next(people), godparents, reserved_tag="vip")
    left = 62
    number = 1
    while left > 0:
        is_family = number % 2 == 1
        size = min(left, rng.randint(2, 4) if is_family else rng.randint(4, 6))
        kind = "Family" if is_family else "Friends"
        group = _group(session, event, f"{kind} {number}", keep_adjacent=is_family)
        for _ in range(size):
            _guest(session, event, next(people), group)
        left -= size
        number += 1
    guests = event_guests(session, event)
    for guest in guests[20:23]:
        guest.needs_accessible = True
    guests[30].wants_anonymous = True
    guests[31].dietary_note = "Vegetarian"
    tokens["wedding_guest_accessible"] = _reissue(guests[20])
    _acquaintances(session, guests, rng, pairs=25)
    return tokens


def _reissue(guest: Guest) -> str:
    """Give a demo guest a fresh token we can hand to the home page."""
    token = new_token()
    guest.token_hash = hash_token(token)
    return token


def _wedding(session: Session, organiser: Organiser, rng: random.Random) -> dict[str, str]:
    venue = _wedding_venue(session, organiser)
    event = Event(
        venue_id=venue.id,
        organiser_id=organiser.id,
        name="Ana and Bruno's wedding",
        starts_at=datetime(2027, 6, 12, 15, 0, tzinfo=UTC),
        ends_at=datetime(2027, 6, 13, 1, 0, tzinfo=UTC),
        privacy_mode="first_initial",
        change_deadline=datetime(2027, 6, 5, 23, 0, tzinfo=UTC),
    )
    session.add(event)
    session.flush()
    tokens = _wedding_guests(session, event, rng)
    _seat_some(session, event, 0.6, rng)
    return {
        "wedding_organiser": f"/organiser/{event.public_id}",
        **_demo_attendees(session, event, "wedding", tokens),
    }


def _demo_attendees(
    session: Session, event: Event, prefix: str, tokens: dict[str, str]
) -> dict[str, str]:
    """One guest who already chose a seat and one who has not, plus `tokens`."""
    seated = {
        row.guest_id
        for row in session.scalars(
            select(SeatAssignment).where(SeatAssignment.event_id == event.id)
        )
    }
    guests = [g for g in event_guests(session, event) if g.reserved_tag is None]
    with_seat = next(g for g in guests if g.id in seated)
    without_seat = next(g for g in guests if g.id not in seated and not g.needs_accessible)
    links = {name: attendee_link(token) for name, token in tokens.items()}
    links[f"{prefix}_guest_seated"] = attendee_link(_reissue(with_seat))
    links[f"{prefix}_guest_choosing"] = attendee_link(_reissue(without_seat))
    return links


# ---------------------------------------------------------------- conference


def _conference_venue(session: Session, organiser: Organiser) -> Venue:
    """An amphitheatre: 10 rows (A to J), three sections of 5 seats each.

    Each section of a row is one "row" table, so seats are neighbours only
    within their section (the aisles break the row).
    """
    venue = Venue(
        organiser_id=organiser.id, kind="event", name="Nova Auditorium", width=1300, height=900
    )
    session.add(venue)
    session.flush()
    session.add(Zone(venue_id=venue.id, name="Stage", kind="stage", x=450, y=20, w=400, h=100))
    for row_index, row in enumerate("ABCDEFGHIJ"):
        for section_index, section in enumerate(("Left", "Centre", "Right")):
            _conference_row(session, venue, row_index, row, section_index, section)
    session.flush()
    rebuild_neighbours(session, venue.id)
    return venue


def _conference_row(
    session: Session, venue: Venue, row_index: int, row: str, section_index: int, section: str
) -> None:
    left = 150 + section_index * 360
    top = 180 + row_index * 66
    table = VenueTable(
        venue_id=venue.id,
        label=f"{row} {section}",
        shape="row",
        x=left,
        y=top,
        w=300,
        h=40,
        max_party=5,
    )
    session.add(table)
    session.flush()
    for index in range(5):
        seat = Seat(
            venue_id=venue.id,
            table_id=table.id,
            label=f"{row}{section_index * 5 + index + 1}",
            x=left + 30 + index * 60,
            y=top + 20,
        )
        # Row A is for speakers; the aisle seats of the back row are step-free.
        seat.reserved_tag = "speaker" if row == "A" else None
        aisle = (section_index == 0 and index == 0) or (section_index == 2 and index == 4)
        seat.is_accessible = row == "J" and aisle
        session.add(seat)


def _conference_guests(session: Session, event: Event, rng: random.Random) -> dict[str, str]:
    people = iter(_people(rng, 116))
    speakers = [
        _guest(session, event, next(people), None, reserved_tag="speaker")[0] for _ in range(6)
    ]
    for index in range(110):
        company = COMPANIES[index % len(COMPANIES)] if index < 70 else None
        group = None
        if company is not None:
            found = session.scalars(
                select(GuestGroup).where(
                    (GuestGroup.event_id == event.id) & (GuestGroup.name == company)
                )
            ).first()
            group = found or _group(session, event, company, keep_adjacent=False)
        _guest(session, event, next(people), group)
    guests = event_guests(session, event)
    guests[50].needs_accessible = True
    guests[60].wants_anonymous = True
    _acquaintances(session, guests, rng, pairs=40)
    return {"conference_speaker": _reissue(speakers[0])}


def _conference(session: Session, organiser: Organiser, rng: random.Random) -> dict[str, str]:
    venue = _conference_venue(session, organiser)
    event = Event(
        venue_id=venue.id,
        organiser_id=organiser.id,
        name="Lisbon Data Summit",
        starts_at=datetime(2027, 3, 18, 8, 30, tzinfo=UTC),
        ends_at=datetime(2027, 3, 18, 18, 0, tzinfo=UTC),
        privacy_mode="full_name",
        change_deadline=datetime(2027, 3, 17, 12, 0, tzinfo=UTC),
    )
    session.add(event)
    session.flush()
    tokens = _conference_guests(session, event, rng)
    _seat_some(session, event, 0.5, rng)
    return {
        "conference_organiser": f"/organiser/{event.public_id}",
        **_demo_attendees(session, event, "conference", tokens),
    }


def seed(session: Session) -> dict[str, str]:
    organiser = session.scalars(
        select(Organiser).where(Organiser.email == DEMO_ORGANISER_EMAIL)
    ).first()
    if organiser is None:
        raise RuntimeError("The demo organiser must exist before the events demo is seeded.")
    rng = random.Random(SEED)
    return {**_wedding(session, organiser, rng), **_conference(session, organiser, rng)}
