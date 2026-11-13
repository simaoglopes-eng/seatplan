"""Owner-only restaurant identity, unique slugs and resumable location."""

import re
import unicodedata
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models import Organiser, Venue

CUISINES = (
    "portuguese",
    "seafood",
    "petiscos",
    "italian",
    "pizza",
    "japanese",
    "sushi",
    "chinese",
    "indian",
    "nepalese",
    "brazilian",
    "mexican",
    "burgers",
    "steakhouse",
    "fish",
    "mediterranean",
    "french",
    "thai",
    "korean",
    "african",
    "vegetarian",
    "vegan",
    "brunch",
    "fusion",
)
PROFILE_FIELDS = (
    "name",
    "slug",
    "description",
    "cuisines",
    "price_level",
    "phone",
    "website",
    "instagram",
    "google_maps_url",
    "address",
    "lat",
    "lng",
    "timezone",
)


def load(session: Session, public_id: str, owner: Organiser) -> Venue:
    venue = session.scalar(
        select(Venue)
        .where(
            Venue.public_id == public_id, Venue.organiser_id == owner.id, Venue.kind == "restaurant"
        )
        .with_for_update()
    )
    if venue is None:
        raise ApiError(404, "not_found", "Restaurant not found.")
    return venue


def view(venue: Venue) -> dict[str, Any]:
    return {
        "public_id": venue.public_id,
        "status": venue.status,
        **{field: getattr(venue, field) for field in PROFILE_FIELDS},
    }


def slug_base(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", ascii_name).strip("-")[:60].rstrip("-") or "restaurant"


def create(session: Session, owner: Organiser, name: str) -> dict[str, Any]:
    base = slug_base(name)
    number = 1
    races = 0
    while True:
        suffix = "" if number == 1 else f"-{number}"
        slug = base[: 60 - len(suffix)].rstrip("-") + suffix
        number += 1
        if session.scalar(select(Venue.id).where(Venue.slug == slug)) is not None:
            continue
        try:
            with session.begin_nested():
                venue = Venue(
                    organiser_id=owner.id,
                    name=name,
                    slug=slug,
                    kind="restaurant",
                    status="draft",
                    is_demo=False,
                    width=1000,
                    height=700,
                )
                session.add(venue)
                session.flush()
            session.commit()
            return {"public_id": venue.public_id, "slug": venue.slug}
        except IntegrityError:
            # A concurrent owner may claim the same slug after our lookup.
            races += 1
            if races >= 5:
                raise ApiError(
                    409, "conflict", "Please try creating the restaurant again."
                ) from None
            continue


def update(session: Session, venue: Venue, changes: dict[str, Any]) -> dict[str, Any]:
    if (
        "slug" in changes
        and changes["slug"] != venue.slug
        and (venue.status == "published" or venue.published_at is not None)
    ):
        raise ApiError(409, "conflict", "The public link is fixed after publication.")
    for field, value in changes.items():
        setattr(venue, field, value)
    venue.search_text = (
        unicodedata.normalize(
            "NFKD", " ".join([venue.name, venue.description, venue.address, *venue.cuisines])
        )
        .encode("ascii", "ignore")
        .decode()
        .lower()[:400]
    )
    try:
        from app.restaurant_service.publishing import recheck_after_edit

        recheck_after_edit(session, venue)
        session.commit()
    except IntegrityError:
        session.rollback()
        raise ApiError(409, "conflict", "That public link is already in use.") from None
    return view(venue)
