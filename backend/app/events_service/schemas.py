"""Request bodies for the events endpoints (contract section 5).

Every body forbids unknown fields and limits every length (contract section 7).
GuestIn is also used to validate each row of an imported CSV file, so a row
from a file is checked by exactly the same rules as a guest typed in by hand.
"""

from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, EmailStr, Field

from app.core.text import PlainText

PrivacyMode = Literal["full_name", "first_initial", "anonymous"]
ReservedTag = Literal["vip", "family", "speaker"]
Rsvp = Literal["pending", "yes", "no"]

# Database ids are positive; the upper bound only stops absurd numbers early.
Id = Field(ge=1, le=2_000_000_000)


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class EventIn(Strict):
    venue_id: PlainText = Field(min_length=1, max_length=32)  # the venue's public id
    name: PlainText = Field(min_length=1, max_length=120)
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    privacy_mode: PrivacyMode = "first_initial"
    change_deadline: AwareDatetime | None = None


class EventPatch(Strict):
    name: PlainText | None = Field(default=None, min_length=1, max_length=120)
    starts_at: AwareDatetime | None = None
    ends_at: AwareDatetime | None = None
    privacy_mode: PrivacyMode | None = None
    change_deadline: AwareDatetime | None = None


class GuestIn(Strict):
    name: PlainText = Field(min_length=1, max_length=120)
    email: EmailStr | None = None
    group: PlainText | None = Field(default=None, min_length=1, max_length=80)
    keep_adjacent: bool = False  # only used when the group is new
    needs_accessible: bool = False
    dietary_note: PlainText | None = Field(default=None, max_length=200)
    reserved_tag: ReservedTag | None = None
    wants_anonymous: bool = False


class GuestPatch(Strict):
    name: PlainText | None = Field(default=None, min_length=1, max_length=120)
    email: EmailStr | None = None
    group: PlainText | None = Field(default=None, max_length=80)
    needs_accessible: bool | None = None
    dietary_note: PlainText | None = Field(default=None, max_length=200)
    reserved_tag: ReservedTag | None = None
    wants_anonymous: bool | None = None
    rsvp: Rsvp | None = None


class SeatChoice(Strict):
    seat_id: int = Id


class OptimiseIn(Strict):
    seed: int = Field(default=0, ge=0, le=1_000_000_000)
    # Capped so one request cannot keep a serverless function busy for minutes.
    max_iterations: int = Field(default=20000, ge=0, le=100_000)


class MoveIn(Strict):
    guest_id: int = Id
    seat_id: int | None = Id  # None means "take this guest off their seat"


class WhatIfIn(Strict):
    moves: list[MoveIn] = Field(min_length=1, max_length=50)


class ExactCheckIn(Strict):
    table_ids: list[int] | None = Field(default=None, min_length=1, max_length=2)


class RsvpIn(Strict):
    rsvp: Rsvp


class KnowsIn(Strict):
    guest_ids: list[int] = Field(max_length=200)


class PrivacyIn(Strict):
    wants_anonymous: bool
