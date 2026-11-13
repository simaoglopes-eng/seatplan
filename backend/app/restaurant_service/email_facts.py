"""Gathers what a restaurant booking email says (spec 10) from the database.

Reads the booking, its tables, the chosen chair, the restaurant's cover photo,
address and phone, the ambience sentences for the stay, and draws the mini-map of
the room. The result feeds app/mail/restaurant_templates.py. Nothing here reads
another diner: only this booking's tables and chair, and the room's shape.
"""

import base64
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session, defer

from app.ambience.models import AmbienceSeat
from app.config import get_settings
from app.mail.png import png_width
from app.mail.restaurant_picture import render_restaurant_picture
from app.mail.restaurant_templates import RestaurantBooking, picture_alt
from app.models import Booking, Seat, Venue, VenuePhoto
from app.restaurant_service import ambience_view, chosen_seat, occupancy
from app.restaurant_service.booking_rows import table_labels
from app.restaurant_service.clock import venue_zone
from app.restaurant_service.discovery import maps_url

MAX_PHRASES = 4


@dataclass(frozen=True)
class BookingEmailData:
    """The facts, and the mini-map as Base64 (the outbox's `image_png`), or None."""

    facts: RestaurantBooking
    picture: str | None


def _cover(session: Session, venue: Venue) -> VenuePhoto | None:
    return session.scalars(
        select(VenuePhoto)
        .options(defer(VenuePhoto.data))
        .where(VenuePhoto.venue_id == venue.id, VenuePhoto.kind == "gallery")
        .order_by(VenuePhoto.is_cover.desc(), VenuePhoto.position, VenuePhoto.id)
    ).first()


def _phrases(
    session: Session,
    venue: Venue,
    booking: Booking,
    table_ids: tuple[int, ...],
    rooms: list[ambience_view.LoadedRoom],
) -> tuple[str, ...]:
    """The sentences of the booked tables for this stay, without repeats."""
    start = booking.start_at.astimezone(venue_zone(venue))
    answer = ambience_view.ambience_payload(
        session, venue, booking.date, start.time(), party=booking.party_size, rooms=rooms
    )
    found: list[str] = []
    for row in answer["tables"]:
        if row["id"] in table_ids:
            found += [p for p in row["phrases"] if p not in found]
    return tuple(found[:MAX_PHRASES])


def _picture(
    session: Session,
    rooms: list[ambience_view.LoadedRoom],
    table_ids: tuple[int, ...],
    seat_id: int | None,
) -> bytes | None:
    """The room of the first booked table, from above, with the table and chair marked."""
    for loaded in rooms:
        mine = [row.id for row, _ in loaded.tables if row.id in table_ids]
        if not mine:
            continue
        ids = [row.id for row, _ in loaded.tables]
        seats = [
            AmbienceSeat(s.id, s.table_id, s.label, s.x, s.y)
            for s in session.scalars(select(Seat).where(Seat.table_id.in_(ids)).order_by(Seat.id))
        ]
        chosen = seat_id if any(s.key == seat_id for s in seats if s.table_key == mine[0]) else None
        return render_restaurant_picture(
            loaded.room,
            [table for _, table in loaded.tables],
            seats,
            mine[0],
            chosen,
            room_name=loaded.name,
        )
    return None


def booking_email_data(
    session: Session, venue: Venue, booking: Booking, link: str
) -> BookingEmailData:
    local = booking.start_at.astimezone(venue_zone(venue))
    table_ids = occupancy.tables_of(session, booking)
    labels = table_labels(session, table_ids)
    seat = chosen_seat.seat_payload(session, venue, booking, with_phrase=True)
    rooms = ambience_view.load_rooms(session, venue)
    png = _picture(session, rooms, table_ids, seat["id"] if seat else None) if table_ids else None
    cover = _cover(session, venue)
    base = get_settings().public_base_url
    table_text = " + ".join(labels) if labels else "to be confirmed"
    facts = RestaurantBooking(
        diner_name=booking.name,
        restaurant=venue.name,
        day_text=local.strftime("%a %d %b"),
        time_text=local.strftime("%H:%M"),
        party_size=booking.party_size,
        table_label=table_text,
        link=link,
        seat_label=seat["label"] if seat else None,
        seat_phrase=seat.get("phrase") if seat else None,
        phrases=_phrases(session, venue, booking, table_ids, rooms) if table_ids else (),
        address=venue.address,
        phone=venue.phone,
        maps_url=maps_url(venue) if venue.address or venue.lat is not None else None,
        cover_url=f"{base}/api/photos/{cover.public_id}" if cover else None,
        cover_alt=cover.alt_text if cover else "",
        picture_width=png_width(png) if png else None,
        picture_alt=picture_alt(venue.name, table_text, seat["label"] if seat else None),
    )
    encoded = base64.b64encode(png).decode("ascii") if png else None
    return BookingEmailData(facts, encoded)
