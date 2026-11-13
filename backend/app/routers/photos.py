"""Authenticated gallery operations and privacy-aware image serving."""

from typing import Any, Literal

from fastapi import APIRouter, Header, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app import db
from app.core.errors import ApiError
from app.core.text import PlainText
from app.models import Organiser, Venue, VenuePhoto
from app.restaurant_service import photos, profiles
from app.security import CurrentOrganiser, rate_limit, verify_session_token

router = APIRouter(tags=["photos"])


class PhotoIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["gallery", "view"]
    opening_key: str | None = Field(default=None, max_length=40)
    content_type: Literal["image/jpeg", "image/png", "image/webp"]
    data_base64: str = Field(min_length=1, max_length=1_066_668)
    alt_text: PlainText = Field(default="", max_length=150)


class AltIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    alt_text: PlainText = Field(max_length=150)


class OrderIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    photo_ids: list[int] = Field(max_length=10)
    cover_id: int | None


@router.get("/owner/restaurants/{vid}/photos")
def listing(vid: str, user: CurrentOrganiser, session: db.SessionDep) -> list[dict[str, Any]]:
    return [photos.metadata(p) for p in photos.listing(session, profiles.load(session, vid, user))]


@router.post("/owner/restaurants/{vid}/photos", status_code=201)
def upload(
    vid: str, body: PhotoIn, user: CurrentOrganiser, session: db.SessionDep
) -> dict[str, Any]:
    profiles.load(session, vid, user)
    rate_limit(session, f"owner-photos:{user.id}", 60, 3600)
    return photos.upload(
        session, vid, user, body.kind, body.data_base64, body.alt_text, body.opening_key
    )


@router.put("/owner/restaurants/{vid}/photos/order")
def order(
    vid: str, body: OrderIn, user: CurrentOrganiser, session: db.SessionDep
) -> list[dict[str, Any]]:
    return photos.order(session, photos.lock(session, vid, user), body.photo_ids, body.cover_id)


@router.patch("/owner/restaurants/{vid}/photos/{photo_id}")
def alt(
    vid: str, photo_id: int, body: AltIn, user: CurrentOrganiser, session: db.SessionDep
) -> dict[str, Any]:
    photo = photos.owned_photo(session, photos.lock(session, vid, user), photo_id)
    photo.alt_text = body.alt_text
    session.commit()
    return photos.metadata(photo)


@router.delete("/owner/restaurants/{vid}/photos/{photo_id}", status_code=204)
def delete(vid: str, photo_id: int, user: CurrentOrganiser, session: db.SessionDep) -> Response:
    photos.delete(session, photos.lock(session, vid, user), photo_id)
    return Response(status_code=204)


@router.get("/photos/{photo_public_id}")
def image(
    photo_public_id: str, session: db.SessionDep, authorization: str | None = Header(default=None)
) -> Response:
    result = session.execute(
        select(VenuePhoto, Venue)
        .join(Venue, VenuePhoto.venue_id == Venue.id)
        .where(VenuePhoto.public_id == photo_public_id, Venue.kind == "restaurant")
    ).first()
    if result is None:
        raise ApiError(404, "not_found", "Photo not found.")
    photo, venue = result
    if venue.status != "published":
        token = authorization[7:] if authorization and authorization.startswith("Bearer ") else ""
        user_id = verify_session_token(token) if token else None
        user = session.get(Organiser, user_id) if user_id is not None else None
        if user is None or user.role != "organiser" or user.id != venue.organiser_id:
            raise ApiError(404, "not_found", "Photo not found.")
    cache = (
        "public, max-age=31536000, immutable"
        if venue.status == "published"
        else "private, no-store"
    )
    return Response(
        photo.data,
        media_type=photo.content_type,
        headers={"Cache-Control": cache, "Vary": "Authorization"},
    )
