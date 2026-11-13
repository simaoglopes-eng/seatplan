"""The diner's floor map for one date, time and party: every table with a state.

Table states for the chosen stay:
- taken      a booking owns at least one slot of the stay
- held       another diner is holding it right now (5-minute hold)
- too_small  it seats fewer than the party (it may still be part of a
             combination; the recommendation says so when it is)
- blocked    the party cannot use it: it is meant for bigger parties, or it
             lacks the accessibility or high-chair room the party needs
- free       bookable
"""

from dataclasses import replace
from datetime import date, time
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Seat, Venue, VenueTable, Zone
from app.optimiser.restaurant_assign import recommend_table
from app.optimiser.restaurant_model import PartySpec
from app.restaurant_service import ambience_view, occupancy, schedule
from app.restaurant_service.availability import PartyNeeds, slot_statuses
from app.restaurant_service.clock import hhmm

# Seats only know the shared seat states, so "too_small" is drawn as blocked.
_SEAT_STATE = {"free": "free", "held": "held", "taken": "taken", "too_small": "blocked"}


def fit_problem(table: VenueTable, needs: PartyNeeds) -> str | None:
    """Why this table can never suit the party, whatever the time: "too_small",
    "blocked", or None when it suits them."""
    if table.max_party < needs.size:
        return "too_small"
    if table.min_party > needs.size:
        return "blocked"
    if needs.needs_accessible and not table.is_accessible:
        return "blocked"
    if needs.high_chairs > 0 and not table.high_chair_ok:
        return "blocked"
    return None


def table_state(
    table: VenueTable,
    needs: PartyNeeds,
    booked: occupancy.Busy,
    held: occupancy.Busy,
    window: tuple[int, int],
) -> str:
    """The state of one table for the stay. Time-based states win, because
    "someone has it" is the first thing a diner needs to know."""
    if not occupancy.is_free((table.id,), booked, window):
        return "taken"
    if not occupancy.is_free((table.id,), held, window):
        return "held"
    return fit_problem(table, needs) or "free"


def _table_dict(
    table: VenueTable,
    kinds: dict[int, str],
    state: str,
    needs: PartyNeeds,
    ambience: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "id": table.id,
        "label": table.label,
        "shape": table.shape,
        "x": table.x,
        "y": table.y,
        "w": table.w,
        "h": table.h,
        "rotation": table.rotation,
        "zone_id": table.zone_id,
        "zone_kind": kinds.get(table.zone_id, "general") if table.zone_id else "general",
        "min_party": table.min_party,
        "max_party": table.max_party,
        "accessible": table.is_accessible,
        "high_chair_ok": table.high_chair_ok,
        "combine_group": table.combine_group,
        "state": state,
        # Separate from state: a taken table may still be the right size, and
        # the page uses this to say "does not suit your party".
        "fits_party": fit_problem(table, needs) is None,
        # New in the room editor: which room, switched on, and what it is like.
        # Old clients ignore these fields.
        "room_id": table.room_id,
        "is_active": table.is_active,
        "ambience": ambience,
    }


def zones_payload(session: Session, venue: Venue) -> list[dict[str, Any]]:
    rows = session.scalars(select(Zone).where(Zone.venue_id == venue.id).order_by(Zone.id))
    return [
        {"id": z.id, "name": z.name, "kind": z.kind, "x": z.x, "y": z.y, "w": z.w, "h": z.h}
        for z in rows
    ]


def seats_payload(session: Session, venue: Venue, states: dict[int, str]) -> list[dict[str, Any]]:
    """Seats of the tables in `states` (so never those of a table switched off)."""
    rows = session.scalars(select(Seat).where(Seat.venue_id == venue.id).order_by(Seat.id))
    return [
        {
            "id": seat.id,
            "table_id": seat.table_id,
            "label": seat.label,
            "x": seat.x,
            "y": seat.y,
            "state": _SEAT_STATE.get(states.get(seat.table_id, "blocked"), "blocked"),
            "accessible": seat.is_accessible,
        }
        for seat in rows
        if seat.table_id in states
    ]


def _recommendations(
    tables: list[VenueTable],
    kinds: dict[int, str],
    busy: occupancy.Busy,
    party: PartySpec,
    features: dict[int, frozenset[str]],
) -> list[dict[str, Any]]:
    labels = {table.id: table.label for table in tables}
    specs = occupancy.table_specs(tables, kinds)
    if party.prefs:  # ambience only matters when the diner asked for something
        specs = [replace(spec, features=features.get(spec.id, frozenset())) for spec in specs]
    choices = recommend_table(specs, busy, party, top=3)
    return [
        {
            "table_ids": list(choice.table_ids),
            "labels": [labels[table_id] for table_id in choice.table_ids],
            "waste": choice.waste,
            "reasons": list(choice.reasons),
        }
        for choice in choices
    ]


def _slot_status(session: Session, venue: Venue, day: date, at: time, needs: PartyNeeds) -> str:
    for slot in slot_statuses(session, venue, day, needs):
        if slot["time"] == hhmm(at):
            return slot["status"]
    return "full"


def build_map(
    session: Session, venue: Venue, day: date, at: time, needs: PartyNeeds
) -> dict[str, Any]:
    """GET /r/{vid}/map. The caller has already checked the time is bookable."""
    window = schedule.window_for(at, schedule.turn_minutes(session, venue, needs.size))
    booked = occupancy.booked_slots(session, venue, day)
    held = occupancy.held_slots(session, venue, day)
    tables = occupancy.venue_tables(session, venue)
    kinds = occupancy.zone_kinds(session, venue)
    states = {t.id: table_state(t, needs, booked, held, window) for t in tables}
    rooms = ambience_view.load_rooms(session, venue)
    light = ambience_view.ambience_payload(
        session, venue, day, at, party=needs.size, detail=True, rooms=rooms
    )
    per_table = {row["id"]: {k: v for k, v in row.items() if k != "id"} for row in light["tables"]}
    features = {t_id: frozenset(row["features"]) for t_id, row in per_table.items()}
    recommended = _recommendations(
        tables, kinds, occupancy.merge(booked, held), needs.spec(window), features
    )
    return {
        "date": day.isoformat(),
        "time": hhmm(at),
        "party": needs.size,
        "slot_status": _slot_status(session, venue, day, at, needs),
        "width": venue.width,
        "height": venue.height,
        "zones": zones_payload(session, venue),
        "tables": [_table_dict(t, kinds, states[t.id], needs, per_table.get(t.id)) for t in tables],
        "seats": seats_payload(session, venue, states),
        "recommended": recommended,
        # The stay, so the page can offer the light cursor from start to end.
        "stay_start": light["stay_start"],
        "stay_end": light["stay_end"],
        "rooms": _rooms_payload(rooms, light),
    }


def _rooms_payload(rooms: list[ambience_view.LoadedRoom], light: dict[str, Any]) -> list[dict]:
    """Each room as drawn, with the sun's patches and the night veil for the moment."""
    return [
        ambience_view.describe_room(loaded)
        | {"sun": light["sun"], "sun_patches": lit["sun_patches"], "night": lit["night"]}
        for loaded, lit in zip(rooms, light["rooms"], strict=True)
    ]
