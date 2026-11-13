"""Four invented restaurants with real rooms, to show off the platform (spec 13).

Each sits in a real Lisbon neighbourhood so the sun and the distances make sense,
but the names, addresses (street numbers), phones and pictures are all invented.
No real restaurant, brand or photograph is used; the pictures are drawn by
seed/demo_photos.py, which is also where their source is recorded.

| Restaurant            | Where          | What it shows                                      |
|-----------------------|----------------|----------------------------------------------------|
| Tagus Terrace         | Cais do Sodré  | south glass wall, river view, sunset, a terrace    |
| Pátio das Laranjeiras | Príncipe Real  | open-air patio with awnings, a room with a fireplace |
| Miradouro 7           | Graça          | a curved room, west windows over the city          |
| Tasca do Bairro       | Alfama         | a small quiet room, no view, daylight only         |

seed() adds the rows (it assumes the demo organiser exists), does not commit,
and returns entry links by name. They share the opening hours and turn times of
Casa Lumen (seed/demo_restaurant.py) and start with no bookings.
"""

from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Organiser,
    Room,
    RoomFixture,
    RoomOpening,
    Venue,
    VenueTable,
    utc_now,
)
from app.restaurant_service import features
from app.restaurant_service.clock import now_local
from app.seed import demo_photos
from app.seed.demo_restaurant import (
    DEMO_ORGANISER_EMAIL,
    _chairs,
    _schedule,
    _table_size,
    free_slug,
)

Corner = tuple[float, float, float]  # x, y, curve (positive bulges outward)


@dataclass(frozen=True)
class Opening:
    side: int
    offset: float
    width: float
    kind: str
    view: str = ""
    tags: tuple[str, ...] = ()
    night_view: str = ""
    main: bool = False


@dataclass(frozen=True)
class Fixture:
    kind: str
    x: float
    y: float
    w: float
    h: float
    label: str = ""


@dataclass(frozen=True)
class Table:
    label: str
    x: float
    y: float
    max_party: int
    min_party: int = 1
    accessible: bool = False
    high_chair: bool = False


@dataclass(frozen=True)
class ShowRoom:
    name: str
    outline: tuple[Corner, ...]
    tables: tuple[Table, ...]
    north: float | None = 0
    outdoor: bool = False
    openings: tuple[Opening, ...] = ()
    fixtures: tuple[Fixture, ...] = ()


@dataclass(frozen=True)
class Showcase:
    slug: str
    name: str
    cuisines: tuple[str, ...]
    price: int
    address: str
    lat: float
    lng: float
    phone: str
    instagram: str
    description: str
    rooms: tuple[ShowRoom, ...]
    photos: tuple[tuple[str, str], ...] = field(
        default=()
    )  # (scene, alt text), the first is the cover


def _rect(x1: float, y1: float, x2: float, y2: float) -> tuple[Corner, ...]:
    """A clockwise rectangle on screen: top-left, top-right, bottom-right, bottom-left."""
    return ((x1, y1, 0), (x2, y1, 0), (x2, y2, 0), (x1, y2, 0))


SHOWCASES = (
    Showcase(
        slug="tagus-terrace",
        name="Tagus Terrace",
        cuisines=("seafood", "portuguese"),
        price=3,
        address="Avenida 24 de Julho 50, Lisboa",
        lat=38.7062,
        lng=-9.1443,
        phone="+351 210 000 101",
        instagram="tagus_terrace_demo",
        description="Fresh fish and a long glass wall onto the river. Come for lunch in the sun or for the sunset on the quay.",
        photos=(
            (
                "river_terrace",
                "An illustration of tables on a quay at sunset, with the river behind them",
            ),
            ("linen_bistro", "An illustration of a bright dining room with a window"),
        ),
        rooms=(
            ShowRoom(
                name="River hall",
                outline=_rect(60, 60, 940, 420),
                openings=(
                    Opening(
                        2,
                        0,
                        880,
                        "glass_wall",
                        "The Tagus river",
                        ("river", "water"),
                        "The river lights",
                    ),
                    Opening(0, 400, 90, "door", main=True),
                ),
                fixtures=(
                    Fixture("bar", 700, 75, 200, 50, "Bar"),
                    Fixture("wc", 870, 330, 60, 80, "Toilets"),
                ),
                tables=(
                    Table("R1", 100, 310, 2),
                    Table("R2", 220, 310, 2, accessible=True),
                    Table("R3", 340, 300, 4, high_chair=True),
                    Table("R4", 500, 300, 4),
                    Table("R5", 660, 295, 6, 3, high_chair=True),
                    Table("R6", 120, 150, 4, accessible=True),
                    Table("R7", 300, 150, 4),
                    Table("R8", 480, 140, 8, 5),
                ),
            ),
            ShowRoom(
                name="Quay terrace",
                outdoor=True,
                outline=_rect(60, 470, 940, 660),
                fixtures=(Fixture("awning", 560, 480, 360, 90, "Awning"),),
                tables=(
                    Table("Q1", 100, 540, 2),
                    Table("Q2", 220, 540, 2),
                    Table("Q3", 350, 535, 4, high_chair=True),
                    Table("Q4", 600, 520, 4),
                    Table("Q5", 760, 520, 6, 3),
                ),
            ),
        ),
    ),
    Showcase(
        slug="patio-das-laranjeiras",
        name="Pátio das Laranjeiras",
        cuisines=("mediterranean", "vegetarian"),
        price=2,
        address="Rua da Escola Politécnica 80, Lisboa",
        lat=38.7168,
        lng=-9.1485,
        phone="+351 210 000 102",
        instagram="patio_laranjeiras_demo",
        description="A tiled patio under orange trees, with awnings for the hot days, and a small room with a fireplace for the cold ones.",
        photos=(
            (
                "orange_patio",
                "An illustration of a patio with orange trees, string lights and tables",
            ),
            ("tasca", "An illustration of a warm room with hanging lamps"),
        ),
        rooms=(
            ShowRoom(
                name="Orange patio",
                outdoor=True,
                outline=_rect(80, 60, 560, 640),
                fixtures=(Fixture("awning", 80, 60, 480, 150, "Awning"),),
                tables=(
                    Table("P1", 130, 100, 2),
                    Table("P2", 260, 100, 4, high_chair=True),
                    Table("P3", 420, 100, 4),
                    Table("P4", 130, 300, 2, accessible=True),
                    Table("P5", 260, 300, 6, 3),
                    Table("P6", 140, 480, 4),
                    Table("P7", 330, 480, 8, 5),
                ),
            ),
            ShowRoom(
                name="Fireside room",
                outline=_rect(600, 60, 940, 640),
                openings=(
                    Opening(
                        1,
                        120,
                        120,
                        "window",
                        "The patio and its orange trees",
                        ("garden",),
                        "The patio lights",
                    ),
                    Opening(3, 200, 90, "door", main=True),
                ),
                fixtures=(Fixture("fireplace", 780, 600, 130, 30, "Fireplace"),),
                tables=(
                    Table("F1", 680, 120, 2),
                    Table("F2", 790, 200, 4, accessible=True),
                    Table("F3", 680, 320, 4),
                    Table("F4", 770, 450, 6, 3),
                ),
            ),
        ),
    ),
    Showcase(
        slug="miradouro-7",
        name="Miradouro 7",
        cuisines=("portuguese", "fusion"),
        price=3,
        address="Largo da Graça 7, Lisboa",
        lat=38.7160,
        lng=-9.1308,
        phone="+351 210 000 103",
        instagram="miradouro7_demo",
        description="Up on the hill, a round room with west windows looking over the old town. Sit by the glass for the golden hour.",
        photos=(
            ("viewpoint", "An illustration of a window looking over rooftops at sunset"),
            ("linen_bistro", "An illustration of a bright dining room with a window"),
        ),
        rooms=(
            ShowRoom(
                name="Panorama room",
                outline=((100, 100, 0), (900, 100, 0), (900, 600, 0), (100, 600, 150)),
                openings=(
                    Opening(
                        3,
                        60,
                        180,
                        "window",
                        "The old town and the river",
                        ("city", "skyline", "river"),
                        "The city lights",
                    ),
                    Opening(
                        3,
                        280,
                        180,
                        "window",
                        "The old town and the river",
                        ("city", "skyline"),
                        "The city lights",
                    ),
                    Opening(2, 400, 100, "door", main=True),
                ),
                fixtures=(Fixture("bar", 600, 110, 200, 50, "Bar"),),
                tables=(
                    Table("M1", 150, 190, 2),
                    Table("M2", 150, 330, 2, accessible=True),
                    Table("M3", 150, 460, 4, high_chair=True),
                    Table("M4", 380, 200, 4),
                    Table("M5", 380, 380, 4),
                    Table("M6", 600, 330, 6, 3),
                    Table("M7", 640, 480, 4),
                ),
            ),
        ),
    ),
    Showcase(
        slug="tasca-do-bairro",
        name="Tasca do Bairro",
        cuisines=("petiscos", "portuguese"),
        price=1,
        address="Rua de São Miguel 21, Lisboa",
        lat=38.7110,
        lng=-9.1296,
        phone="+351 210 000 104",
        instagram="tasca_bairro_demo",
        description="A small, quiet room in the old streets. No view, only daylight and good petiscos at the counter or the tables.",
        photos=(("tasca", "An illustration of a warm room with hanging lamps and a long counter"),),
        rooms=(
            ShowRoom(
                name="The tasca",
                outline=_rect(200, 150, 800, 550),
                openings=(
                    Opening(2, 250, 100, "door", main=True),
                    Opening(0, 380, 70, "window"),
                ),
                fixtures=(Fixture("bar", 220, 165, 200, 40, "Counter"),),
                tables=(
                    Table("T1", 260, 270, 2),
                    Table("T2", 400, 270, 2, accessible=True),
                    Table("T3", 540, 260, 4),
                    Table("T4", 280, 420, 4, high_chair=True),
                    Table("T5", 500, 410, 6, 3),
                ),
            ),
        ),
    ),
)


def _owner(session: Session) -> Organiser:
    owner = session.scalars(
        select(Organiser).where(Organiser.email == DEMO_ORGANISER_EMAIL)
    ).first()
    if owner is None:
        raise RuntimeError("Create the demo users before seeding the restaurants.")
    return owner


def _add_room(session: Session, venue: Venue, position: int, spec: ShowRoom) -> None:
    room = Room(
        venue_id=venue.id,
        name=spec.name,
        is_outdoor=spec.outdoor,
        north_deg=spec.north,
        outline={"points": [{"x": x, "y": y, "curve": curve} for x, y, curve in spec.outline]},
        position=position,
    )
    session.add(room)
    session.flush()
    for opening in spec.openings:
        session.add(
            RoomOpening(
                room_id=room.id,
                side=opening.side,
                offset=opening.offset,
                width=opening.width,
                kind=opening.kind,
                is_main_entrance=opening.main,
                view_text=opening.view,
                view_tags=list(opening.tags),
                night_view_text=opening.night_view,
            )
        )
    for fixture in spec.fixtures:
        session.add(
            RoomFixture(
                room_id=room.id,
                kind=fixture.kind,
                shape="rect",
                x=fixture.x,
                y=fixture.y,
                w=fixture.w,
                h=fixture.h,
                label=fixture.label,
            )
        )
    for table in spec.tables:
        shape, w, h = _table_size(table.max_party)
        row = VenueTable(
            venue_id=venue.id,
            room_id=room.id,
            label=table.label,
            shape=shape,
            x=table.x,
            y=table.y,
            w=w,
            h=h,
            rotation=0.0,
            min_party=table.min_party,
            max_party=table.max_party,
            is_accessible=table.accessible,
            high_chair_ok=table.high_chair,
        )
        session.add(row)
        session.flush()
        session.add_all(_chairs(row))


def seed(session: Session) -> dict[str, str]:
    owner = _owner(session)
    links: dict[str, str] = {}
    for spec in SHOWCASES:
        slug = free_slug(session, spec.slug)
        venue = Venue(
            organiser_id=owner.id,
            kind="restaurant",
            name=spec.name,
            is_demo=True,
            timezone="Europe/Lisbon",
            width=1000,
            height=700,
            slug=slug,
            status="published",
            published_at=utc_now(),
            description=spec.description,
            cuisines=list(spec.cuisines),
            price_level=spec.price,
            address=spec.address,
            lat=spec.lat,
            lng=spec.lng,
            phone=spec.phone,
            instagram=spec.instagram,
        )
        session.add(venue)
        session.flush()
        for position, room in enumerate(spec.rooms):
            _add_room(session, venue, position, room)
        _schedule(session, venue, now_local(venue).date())
        demo_photos.add_photos(session, venue, spec.photos)
        session.flush()
        features.refresh_features(session, venue)
        links[f"showcase_{spec.slug.replace('-', '_')}"] = f"/restaurants/{slug}"
    return links
