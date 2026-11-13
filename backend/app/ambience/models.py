"""Inputs of the ambience engine: plain frozen values, never database rows.

The service layer (restaurant_service) fills these from the database, the same
way occupancy.table_specs fills the optimiser's dataclasses. Every length is in
centimetres in the room's screen coordinates (x right, y down), see geometry.py.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import time
from typing import Literal

Key = int | str
OpeningKind = Literal["window", "door", "glass_wall"]
SunRule = Literal["auto", "never", "between"]
Shape = Literal["round", "rect", "row"]


@dataclass(frozen=True)
class AmbienceOpening:
    """A window, door or glass wall placed on one side of a room outline.

    `offset` and `width` are measured along the side (along the arc on a curved
    side), starting at the side's first corner. A glass wall always covers its
    whole side, so its offset and width are ignored.
    """

    key: Key
    side: int
    offset: float
    width: float
    kind: OpeningKind
    top_height: float = 220.0
    is_main_entrance: bool = False
    view_text: str = ""
    view_tags: tuple[str, ...] = ()
    night_view_text: str = ""
    view_photo_url: str = ""
    sun_rule: SunRule = "auto"
    sun_from: time | None = None
    sun_until: time | None = None


@dataclass(frozen=True)
class AmbienceFixture:
    """A fixed item such as a bar, the toilets or an awning."""

    key: Key
    kind: str
    shape: Literal["rect", "circle"]
    x: float
    y: float
    w: float
    h: float
    rotation: float = 0.0
    label: str = ""


@dataclass(frozen=True)
class AmbienceRoom:
    """One room: its outline (geometry.Outline), north and what is on its walls."""

    key: Key
    outline: Mapping[str, Sequence[Mapping[str, float]]]
    north_deg: float | None
    is_outdoor: bool = False
    openings: tuple[AmbienceOpening, ...] = ()
    fixtures: tuple[AmbienceFixture, ...] = ()


@dataclass(frozen=True)
class AmbienceTable:
    """A table's footprint: the unrotated box, rotated about its centre."""

    key: Key
    label: str
    shape: Shape
    x: float
    y: float
    w: float
    h: float
    rotation: float = 0.0


@dataclass(frozen=True)
class AmbienceSeat:
    """A chair, only used for the 'facing the window' sentence."""

    key: Key
    table_key: Key
    label: str
    x: float
    y: float
