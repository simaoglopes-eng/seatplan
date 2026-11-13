"""Restaurant owner account endpoints."""

import re
from typing import Any, Literal
from urllib.parse import urlsplit

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator
from sqlalchemy.exc import IntegrityError

from app import db
from app.core.errors import ApiError
from app.core.text import PlainText
from app.events_service import accounts
from app.restaurant_service import owner_accounts, owner_view, profiles, publishing
from app.routers.venues import TimeZoneName
from app.security import CurrentOrganiser

router = APIRouter(prefix="/owner", tags=["owners"])


class RestaurantIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: PlainText = Field(min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Enter a name.")
        return value.strip()


class ProfilePatch(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    name: PlainText | None = Field(default=None, min_length=1, max_length=120)
    slug: str | None = Field(
        default=None, min_length=1, max_length=60, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
    )
    description: PlainText | None = Field(default=None, max_length=300)
    cuisines: list[str] | None = Field(default=None, min_length=1, max_length=3)
    price_level: int | None = Field(default=None, ge=1, le=4, strict=True)
    phone: PlainText | None = Field(default=None, max_length=40)
    website: str | None = Field(default=None, max_length=200)
    instagram: str | None = Field(default=None, max_length=31)
    google_maps_url: str | None = Field(default=None, max_length=200)
    address: PlainText | None = Field(default=None, min_length=1, max_length=200)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    timezone: TimeZoneName | None = Field(default=None, min_length=1, max_length=64)

    @field_validator("cuisines")
    @classmethod
    def cuisines_known(cls, value: list[str] | None) -> list[str] | None:
        if value is not None and (
            len(set(value)) != len(value) or any(c not in profiles.CUISINES for c in value)
        ):
            raise ValueError("Choose one to three different cuisines from the list.")
        return value

    @field_validator("phone")
    @classmethod
    def phone_valid(cls, value: str | None) -> str | None:
        if not value or not value.strip():
            return None
        if not re.fullmatch(r"[0-9+()\-\s]+", value) or len(re.sub(r"\D", "", value)) < 6:
            raise ValueError("Use at least six digits, spaces, +, brackets or dashes.")
        return value.strip()

    @field_validator("instagram")
    @classmethod
    def instagram_valid(cls, value: str | None) -> str | None:
        if not value:
            return None
        if not re.fullmatch(r"@?[A-Za-z0-9._]{1,30}", value):
            raise ValueError("Use an Instagram handle of up to 30 characters.")
        return value.removeprefix("@")

    @field_validator("website", "google_maps_url")
    @classmethod
    def url_valid(cls, value: str | None, info: Any) -> str | None:
        if not value:
            return None
        try:
            parts = urlsplit(value)
            if (
                parts.scheme not in {"http", "https"}
                or not parts.hostname
                or parts.username
                or parts.password
                or any(c.isspace() for c in value)
            ):
                raise ValueError("Use a complete http:// or https:// link.")
            if info.field_name == "google_maps_url":
                host = parts.hostname.lower()
                if not (
                    host == "maps.app.goo.gl"
                    or host in {"google.com", "www.google.com", "goo.gl"}
                    and (parts.path == "/maps" or parts.path.startswith("/maps/"))
                ):
                    raise ValueError("Use a Google Maps link.")
        except ValueError:
            raise ValueError("Use a valid website or Google Maps link.") from None
        return value

    @model_validator(mode="after")
    def complete_values(self) -> "ProfilePatch":
        for field in self.model_fields_set & {
            "name",
            "slug",
            "description",
            "cuisines",
            "price_level",
            "address",
            "timezone",
        }:
            value = getattr(self, field)
            if (
                value is None
                or isinstance(value, str)
                and field in {"name", "address"}
                and not value.strip()
            ):
                raise ValueError(f"Enter a value for {field}.")
        if ("lat" in self.model_fields_set) != ("lng" in self.model_fields_set) or (
            self.lat is None
        ) != (self.lng is None):
            raise ValueError("Set latitude and longitude together.")
        return self


@router.post("/restaurants", status_code=201)
def create_restaurant(
    body: RestaurantIn, user: CurrentOrganiser, session: db.SessionDep
) -> dict[str, Any]:
    return profiles.create(session, user, body.name)


@router.get("/restaurants/{vid}/profile")
@router.get("/restaurants/{vid}")
def get_profile(vid: str, user: CurrentOrganiser, session: db.SessionDep) -> dict[str, Any]:
    return profiles.view(profiles.load(session, vid, user))


@router.patch("/restaurants/{vid}/profile")
def patch_profile(
    vid: str, body: ProfilePatch, user: CurrentOrganiser, session: db.SessionDep
) -> dict[str, Any]:
    return profiles.update(
        session, profiles.load(session, vid, user), body.model_dump(exclude_unset=True)
    )


@router.get("/restaurants")
def restaurants(user: CurrentOrganiser, session: db.SessionDep) -> list[dict[str, Any]]:
    return owner_view.restaurants(session, user)


class RegisterIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: PlainText = Field(min_length=1, max_length=120)
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=1, max_length=200)
    consent: Literal[True]


class VerifyIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr = Field(max_length=254)
    code: str = Field(pattern=r"^\d{6}$")
    signup_id: str = Field(min_length=10, max_length=100)


@router.post("/register", status_code=202)
def register(body: RegisterIn, request: Request, session: db.SessionDep) -> dict[str, Any]:
    email = accounts.normalise_email(str(body.email))
    accounts.check_new_password(body.password, email)
    accounts.count_code_send(session, request, email, "owner")
    accounts.count_app_send(session)
    try:
        return owner_accounts.register(session, body.name, email, body.password)
    except IntegrityError:
        session.rollback()
        raise ApiError(409, "conflict", "Please try again.") from None


@router.post("/verify", status_code=201)
def verify(body: VerifyIn, request: Request, session: db.SessionDep) -> dict[str, Any]:
    accounts.count_code_check(session, request)
    return owner_accounts.verify(
        session, accounts.normalise_email(str(body.email)), body.code, body.signup_id
    )


@router.post("/restaurants/{vid}/publish", response_model=None)
def publish_restaurant(
    vid: str, user: CurrentOrganiser, session: db.SessionDep
) -> dict[str, Any] | JSONResponse:
    """Publish after the server checks everything again (spec 5.3 step 6).

    422 carries the problems twice: as `problems` (the spec) and inside `error`
    (what the client's error handling reads), each with a link to fix it.
    """
    venue = profiles.load(session, vid, user)
    try:
        return publishing.publish(session, venue, actor=f"organiser:{user.id}")
    except publishing.PublishRefused as refused:
        session.rollback()
        error = {"code": refused.code, "message": refused.message, "problems": refused.problems}
        return JSONResponse({"error": error, "problems": refused.problems}, status_code=422)


@router.post("/restaurants/{vid}/unpublish")
def unpublish_restaurant(
    vid: str, user: CurrentOrganiser, session: db.SessionDep
) -> dict[str, Any]:
    """Back to a draft: off the search, no new bookings, existing bookings untouched."""
    venue = profiles.load(session, vid, user)
    return publishing.unpublish(session, venue, actor=f"organiser:{user.id}")


@router.get("/restaurants/{vid}/publish-check")
def publish_check(vid: str, user: CurrentOrganiser, session: db.SessionDep) -> dict[str, Any]:
    """What the review step shows: the problems that block publishing and the tips that do not."""
    return publishing.review(session, profiles.load(session, vid, user))
