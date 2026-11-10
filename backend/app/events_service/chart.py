"""Print data for the organiser: a seating chart per table and place cards.

This is for the organiser's own printout on the day, so it uses real names.
"""

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.events_service.problem import active_guests, current_rows, venue_seats
from app.models import Event, VenueTable


def chart(session: Session, event: Event) -> dict[str, Any]:
    rows = current_rows(session, event)
    guests = {guest.id: guest for guest in active_guests(session, event)}
    sitter = {row.seat_id: guests[g] for g, row in rows.items() if g in guests}
    query = select(VenueTable).where(VenueTable.venue_id == event.venue_id).order_by(VenueTable.id)
    tables = {
        table.id: {"id": table.id, "label": table.label, "seats": []}
        for table in session.scalars(query)
    }
    place_cards = []
    for seat in venue_seats(session, event.venue_id):
        guest = sitter.get(seat.id)
        name = guest.name if guest else None
        tables[seat.table_id]["seats"].append(
            {"seat_id": seat.id, "label": seat.label, "name": name}
        )
        if guest is not None:
            label = tables[seat.table_id]["label"]
            place_cards.append({"name": guest.name, "table": label, "seat": seat.label})
    seated_ids = {guest.id for guest in sitter.values()}
    return {
        "event": {"name": event.name, "starts_at": event.starts_at},
        "tables": [table for table in tables.values() if table["seats"]],
        "place_cards": place_cards,
        "unseated": sorted(g.name for g in guests.values() if g.id not in seated_ids),
    }
