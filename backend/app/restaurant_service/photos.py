"""Bounded image bytes and an owner-scoped, transactional gallery."""

import base64
import binascii
import re
import struct
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session, defer

from app.core.errors import ApiError
from app.models import Organiser, Room, RoomOpening, Venue, VenuePhoto
from app.restaurant_service import profiles

MAX_BYTES = 800_000


def image_info(data: bytes) -> tuple[str, int, int]:
    """Read bounded image headers without loading a decompression library."""
    try:
        if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 33 and data[12:16] == b"IHDR":
            width, height = struct.unpack(">II", data[16:24])
            mime = "image/png"
        elif data.startswith(b"\xff\xd8\xff"):
            offset = 2
            width = height = 0
            while offset + 4 <= len(data):
                if data[offset] != 0xFF:
                    break
                while data[offset] == 0xFF:
                    offset += 1
                marker = data[offset]
                offset += 1
                if marker in {0xD8, 0xD9, 0x01} or 0xD0 <= marker <= 0xD7:
                    continue
                size = int.from_bytes(data[offset : offset + 2], "big")
                if size < 2 or offset + size > len(data):
                    break
                if (
                    marker
                    in {
                        0xC0,
                        0xC1,
                        0xC2,
                        0xC3,
                        0xC5,
                        0xC6,
                        0xC7,
                        0xC9,
                        0xCA,
                        0xCB,
                        0xCD,
                        0xCE,
                        0xCF,
                    }
                    and size >= 8
                ):
                    height, width = struct.unpack(">HH", data[offset + 3 : offset + 7])
                    break
                offset += size
            mime = "image/jpeg"
        elif len(data) >= 30 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            kind = data[12:16]
            if kind == b"VP8X":
                width = 1 + int.from_bytes(data[24:27], "little")
                height = 1 + int.from_bytes(data[27:30], "little")
            elif kind == b"VP8 " and data[23:26] == b"\x9d\x01\x2a":
                width, height = struct.unpack("<HH", data[26:30])
                width &= 0x3FFF
                height &= 0x3FFF
            elif kind == b"VP8L" and data[20] == 0x2F:
                bits = int.from_bytes(data[21:25], "little")
                width, height = (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
            else:
                raise ValueError
            mime = "image/webp"
        else:
            raise ValueError
        if not 1 <= width <= 1600 or not 1 <= height <= 1600:
            raise ValueError
        return mime, width, height
    except (ValueError, IndexError, struct.error):
        raise ApiError(
            422, "validation", "Use a JPEG, PNG or WebP image up to 1600 pixels per side."
        ) from None


def metadata(photo: VenuePhoto) -> dict[str, Any]:
    return {
        field: getattr(photo, field)
        for field in (
            "id",
            "public_id",
            "kind",
            "opening_id",
            "content_type",
            "width",
            "height",
            "alt_text",
            "position",
            "is_cover",
        )
    } | {"url": f"/api/photos/{photo.public_id}"}


def listing(session: Session, venue: Venue) -> list[VenuePhoto]:
    return list(
        session.scalars(
            select(VenuePhoto)
            .options(defer(VenuePhoto.data))
            .where(VenuePhoto.venue_id == venue.id)
            .order_by(VenuePhoto.kind, VenuePhoto.position, VenuePhoto.id)
        )
    )


def lock(session: Session, vid: str, user: Organiser) -> Venue:
    venue = profiles.load(session, vid, user)
    # SQLite also serializes the count/cover decision. No layout version changes.
    session.execute(
        update(Venue).where(Venue.id == venue.id).values(layout_version=Venue.layout_version)
    )
    return venue


def upload(
    session: Session,
    vid: str,
    user: Organiser,
    kind: str,
    encoded: str,
    alt_text: str,
    opening_key: str | None,
) -> dict[str, Any]:
    try:
        data = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError):
        raise ApiError(422, "validation", "The image encoding is invalid.") from None
    if not data or len(data) > MAX_BYTES:
        raise ApiError(422, "validation", "Keep the resized image at or below 800 KB.")
    mime, width, height = image_info(data)
    venue = lock(session, vid, user)
    existing = listing(session, venue)
    opening_id = None
    if kind == "gallery":
        if opening_key is not None:
            raise ApiError(422, "validation", "Gallery photos do not belong to a window.")
        if sum(p.kind == "gallery" for p in existing) >= 10:
            raise ApiError(422, "validation", "A gallery can have at most ten photos.")
    else:
        match = re.fullmatch(r"o?(\d+)", opening_key or "")
        opening = (
            session.scalar(
                select(RoomOpening)
                .join(Room, Room.id == RoomOpening.room_id)
                .where(Room.venue_id == venue.id, RoomOpening.id == int(match[1]))
            )
            if match
            else None
        )
        if opening is None or opening.kind not in {"window", "glass_wall"}:
            raise ApiError(404, "not_found", "Saved window not found.")
        opening_id = opening.id
        if any(p.opening_id == opening_id for p in existing):
            raise ApiError(422, "validation", "This window already has a view photo.")
    gallery = [p for p in existing if p.kind == "gallery"]
    photo = VenuePhoto(
        venue_id=venue.id,
        kind=kind,
        opening_id=opening_id,
        data=data,
        content_type=mime,
        width=width,
        height=height,
        alt_text=alt_text,
        position=len(gallery),
        is_cover=kind == "gallery" and not gallery,
    )
    session.add(photo)
    session.commit()
    return metadata(photo)


def owned_photo(session: Session, venue: Venue, photo_id: int) -> VenuePhoto:
    photo = session.scalar(
        select(VenuePhoto)
        .options(defer(VenuePhoto.data))
        .where(VenuePhoto.id == photo_id, VenuePhoto.venue_id == venue.id)
    )
    if photo is None:
        raise ApiError(404, "not_found", "Photo not found.")
    return photo


def order(
    session: Session, venue: Venue, ids: list[int], cover_id: int | None
) -> list[dict[str, Any]]:
    gallery = [p for p in listing(session, venue) if p.kind == "gallery"]
    known = {p.id: p for p in gallery}
    if set(ids) - known.keys():
        raise ApiError(404, "not_found", "Photo not found.")
    if (
        len(set(ids)) != len(ids)
        or set(ids) != known.keys()
        or (ids and cover_id not in ids)
        or (not ids and cover_id is not None)
    ):
        raise ApiError(422, "validation", "Include every gallery photo once and choose its cover.")
    for position, photo_id in enumerate(ids):
        known[photo_id].position = position
        known[photo_id].is_cover = photo_id == cover_id
    session.commit()
    return [metadata(known[photo_id]) for photo_id in ids]


def delete(session: Session, venue: Venue, photo_id: int) -> None:
    photo = owned_photo(session, venue, photo_id)
    session.delete(photo)
    session.flush()
    gallery = [p for p in listing(session, venue) if p.kind == "gallery"]
    if gallery and not any(p.is_cover for p in gallery):
        gallery[0].is_cover = True
    for position, item in enumerate(gallery):
        item.position = position
    session.commit()
