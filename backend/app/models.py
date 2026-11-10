"""Every database table (contract section 4), in SQLAlchemy 2 typed style.

Read this file top to bottom: shared tables first, then the events vertical,
then the restaurants vertical. The UNIQUE constraints are the rules that make
double booking impossible, so they are written out explicitly by name.
"""

import secrets
from datetime import UTC, date, datetime, time
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    Time,
    TypeDecorator,
    UniqueConstraint,
)
from sqlalchemy.engine import Dialect
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utc_now() -> datetime:
    return datetime.now(UTC)


def new_public_id() -> str:
    """Random id for URLs: 9 random bytes become 12 url-safe characters."""
    return secrets.token_urlsafe(9)


class UtcDateTime(TypeDecorator[datetime]):
    """Store UTC as a plain timestamp, give back timezone-aware datetimes.

    SQLite has no time zone type, so we store every moment as naive UTC on both
    databases. Converting at this single boundary means the rest of the code
    can always compare aware datetimes without surprises.
    """

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: Any, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("Datetimes must be timezone-aware (UTC)")
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value: Any, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=UTC)


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------- shared


class Organiser(Base):
    __tablename__ = "organisers"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="organiser")


class Venue(Base):
    __tablename__ = "venues"

    id: Mapped[int] = mapped_column(primary_key=True)
    public_id: Mapped[str] = mapped_column(String(32), index=True, default=new_public_id)
    organiser_id: Mapped[int] = mapped_column(ForeignKey("organisers.id"))
    kind: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(120))
    timezone: Mapped[str] = mapped_column(String(64), default="Europe/Lisbon")
    width: Mapped[float] = mapped_column(Float)
    height: Mapped[float] = mapped_column(Float)


class Zone(Base):
    __tablename__ = "zones"

    id: Mapped[int] = mapped_column(primary_key=True)
    venue_id: Mapped[int] = mapped_column(ForeignKey("venues.id"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    kind: Mapped[str] = mapped_column(String(20), default="general")
    x: Mapped[float] = mapped_column(Float)
    y: Mapped[float] = mapped_column(Float)
    w: Mapped[float] = mapped_column(Float)
    h: Mapped[float] = mapped_column(Float)


class VenueTable(Base):
    """A table (or a row of chairs). Named VenueTable so it never gets confused
    with SQLAlchemy's own Table class."""

    __tablename__ = "tables"

    id: Mapped[int] = mapped_column(primary_key=True)
    venue_id: Mapped[int] = mapped_column(ForeignKey("venues.id"), index=True)
    zone_id: Mapped[int | None] = mapped_column(ForeignKey("zones.id"))
    label: Mapped[str] = mapped_column(String(40))
    shape: Mapped[str] = mapped_column(String(10))
    # x, y are the top-left corner of the unrotated box; rotation is in degrees
    # around the centre of that box.
    x: Mapped[float] = mapped_column(Float)
    y: Mapped[float] = mapped_column(Float)
    w: Mapped[float] = mapped_column(Float)
    h: Mapped[float] = mapped_column(Float)
    rotation: Mapped[float] = mapped_column(Float, default=0.0)
    min_party: Mapped[int] = mapped_column(Integer, default=1)
    max_party: Mapped[int] = mapped_column(Integer)
    is_accessible: Mapped[bool] = mapped_column(Boolean, default=False)
    high_chair_ok: Mapped[bool] = mapped_column(Boolean, default=False)
    combine_group: Mapped[str | None] = mapped_column(String(40))


class Seat(Base):
    __tablename__ = "seats"

    id: Mapped[int] = mapped_column(primary_key=True)
    venue_id: Mapped[int] = mapped_column(ForeignKey("venues.id"), index=True)
    table_id: Mapped[int] = mapped_column(ForeignKey("tables.id"), index=True)
    label: Mapped[str] = mapped_column(String(40))
    x: Mapped[float] = mapped_column(Float)
    y: Mapped[float] = mapped_column(Float)
    is_accessible: Mapped[bool] = mapped_column(Boolean, default=False)
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    reserved_tag: Mapped[str | None] = mapped_column(String(20))


class SeatNeighbour(Base):
    """Symmetric: when A is next to B we store both (A, B) and (B, A)."""

    __tablename__ = "seat_neighbours"

    seat_id: Mapped[int] = mapped_column(ForeignKey("seats.id"), primary_key=True)
    neighbour_id: Mapped[int] = mapped_column(ForeignKey("seats.id"), primary_key=True)


class LiveVersion(Base):
    __tablename__ = "live_versions"

    scope: Mapped[str] = mapped_column(String(120), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, default=0)


class Hold(Base):
    __tablename__ = "holds"
    # The database refuses a second hold on the same resource and slot. This
    # one line is what makes "two people grab the same seat" impossible.
    __table_args__ = (
        UniqueConstraint(
            "scope", "resource_kind", "resource_id", "slot_key", name="uq_holds_resource"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    scope: Mapped[str] = mapped_column(String(120))
    resource_kind: Mapped[str] = mapped_column(String(10))
    resource_id: Mapped[int] = mapped_column(Integer)
    # Never NULL: SQL treats NULLs as all different, which would let two holds
    # with a NULL slot_key slip past the unique constraint.
    slot_key: Mapped[str] = mapped_column(String(40), default="")
    holder_key: Mapped[str] = mapped_column(String(128))
    expires_at: Mapped[datetime] = mapped_column(UtcDateTime)


class EmailOutbox(Base):
    __tablename__ = "email_outbox"

    id: Mapped[int] = mapped_column(primary_key=True)
    idempotency_key: Mapped[str] = mapped_column(String(200), unique=True)
    to_email: Mapped[str] = mapped_column(String(254))
    kind: Mapped[str] = mapped_column(String(40))
    subject: Mapped[str] = mapped_column(String(200))
    body_text: Mapped[str] = mapped_column(Text)
    body_html: Mapped[str] = mapped_column(Text)
    ics: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10), default="queued")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    next_attempt_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utc_now)
    sent_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    provider_message_id: Mapped[str | None] = mapped_column(String(200))
    last_error: Mapped[str | None] = mapped_column(Text)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(UtcDateTime, default=utc_now)
    actor: Mapped[str] = mapped_column(String(120))
    action: Mapped[str] = mapped_column(String(60), index=True)
    entity: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[str] = mapped_column(String(64))
    detail: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class RateLimit(Base):
    __tablename__ = "rate_limits"

    key: Mapped[str] = mapped_column(String(200), primary_key=True)
    # Unix seconds at the start of the window, so windows are easy to compare.
    window_start: Mapped[int] = mapped_column(Integer, primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0)


class DemoLink(Base):
    """The entry links printed by the demo seed, for GET /demo/links.

    These are the only raw link tokens the database keeps, on purpose: handing
    them out is the demo's job. They live in their own table (not the audit
    log) so a demo reset wipes them, and the router reads them only while
    DEMO_MODE=1.
    """

    __tablename__ = "demo_links"

    name: Mapped[str] = mapped_column(String(80), primary_key=True)
    path: Mapped[str] = mapped_column(String(200))


# ---------------------------------------------------------------- events


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    public_id: Mapped[str] = mapped_column(String(32), index=True, default=new_public_id)
    venue_id: Mapped[int] = mapped_column(ForeignKey("venues.id"))
    organiser_id: Mapped[int] = mapped_column(ForeignKey("organisers.id"))
    name: Mapped[str] = mapped_column(String(120))
    starts_at: Mapped[datetime] = mapped_column(UtcDateTime)
    ends_at: Mapped[datetime] = mapped_column(UtcDateTime)
    privacy_mode: Mapped[str] = mapped_column(String(20), default="first_initial")
    change_deadline: Mapped[datetime | None] = mapped_column(UtcDateTime)


class GuestGroup(Base):
    __tablename__ = "guest_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    keep_adjacent: Mapped[bool] = mapped_column(Boolean, default=False)


class Guest(Base):
    __tablename__ = "guests"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    # Nullable so that deleting a guest can erase the address but keep the row.
    email: Mapped[str | None] = mapped_column(String(254))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    token_revoked_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    group_id: Mapped[int | None] = mapped_column(ForeignKey("guest_groups.id"))
    wants_anonymous: Mapped[bool] = mapped_column(Boolean, default=False)
    needs_accessible: Mapped[bool] = mapped_column(Boolean, default=False)
    dietary_note: Mapped[str | None] = mapped_column(String(200))
    reserved_tag: Mapped[str | None] = mapped_column(String(20))
    rsvp: Mapped[str] = mapped_column(String(10), default="pending")


class Acquaintance(Base):
    """Directed: "guest_id knows knows_guest_id" does not imply the reverse."""

    __tablename__ = "acquaintances"

    guest_id: Mapped[int] = mapped_column(ForeignKey("guests.id"), primary_key=True)
    knows_guest_id: Mapped[int] = mapped_column(ForeignKey("guests.id"), primary_key=True)


class SeatAssignment(Base):
    __tablename__ = "seat_assignments"
    # One guest per seat, and one seat per guest, enforced by the database.
    __table_args__ = (
        UniqueConstraint("event_id", "seat_id", name="uq_assignment_seat"),
        UniqueConstraint("event_id", "guest_id", name="uq_assignment_guest"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"))
    seat_id: Mapped[int] = mapped_column(ForeignKey("seats.id"))
    guest_id: Mapped[int] = mapped_column(ForeignKey("guests.id"))
    source: Mapped[str] = mapped_column(String(10))
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utc_now)


class PlanSnapshot(Base):
    __tablename__ = "plan_snapshots"
    # seq is the scenario number the organiser sees. Two saves at the same
    # moment could both read the same max(seq); the database refuses the second.
    __table_args__ = (UniqueConstraint("event_id", "seq", name="uq_snapshot_seq"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    label: Mapped[str] = mapped_column(String(80))
    assignments: Mapped[dict[str, Any]] = mapped_column(JSON)
    score: Mapped[dict[str, Any]] = mapped_column(JSON)
    is_current: Mapped[bool] = mapped_column(Boolean, default=False)


# ---------------------------------------------------------------- restaurants


class ServicePeriod(Base):
    __tablename__ = "service_periods"

    id: Mapped[int] = mapped_column(primary_key=True)
    venue_id: Mapped[int] = mapped_column(ForeignKey("venues.id"), index=True)
    name: Mapped[str] = mapped_column(String(40))
    weekday: Mapped[int] = mapped_column(Integer)
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)
    slot_minutes: Mapped[int] = mapped_column(Integer, default=15)
    max_covers_per_slot: Mapped[int] = mapped_column(Integer)


class TurnTime(Base):
    __tablename__ = "turn_times"

    id: Mapped[int] = mapped_column(primary_key=True)
    venue_id: Mapped[int] = mapped_column(ForeignKey("venues.id"), index=True)
    max_party: Mapped[int] = mapped_column(Integer)
    minutes: Mapped[int] = mapped_column(Integer)


class BlackoutDate(Base):
    __tablename__ = "blackout_dates"

    id: Mapped[int] = mapped_column(primary_key=True)
    venue_id: Mapped[int] = mapped_column(ForeignKey("venues.id"), index=True)
    date: Mapped[date] = mapped_column(Date)
    reason: Mapped[str] = mapped_column(String(200), default="")


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(primary_key=True)
    public_id: Mapped[str] = mapped_column(String(32), index=True, default=new_public_id)
    venue_id: Mapped[int] = mapped_column(ForeignKey("venues.id"), index=True)
    date: Mapped[date] = mapped_column(Date)
    start_at: Mapped[datetime] = mapped_column(UtcDateTime)
    end_at: Mapped[datetime] = mapped_column(UtcDateTime)
    party_size: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(254))
    phone: Mapped[str | None] = mapped_column(String(40))
    notes: Mapped[str] = mapped_column(String(500), default="")
    needs_accessible: Mapped[bool] = mapped_column(Boolean, default=False)
    high_chairs: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(12), default="confirmed")
    source: Mapped[str] = mapped_column(String(10), default="diner")
    table_choice: Mapped[str] = mapped_column(String(10), default="auto")
    manage_token_hash: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utc_now)


class TableSlot(Base):
    """One row per table per 15-minute slot a booking occupies. The composite
    primary key is what makes a double booking impossible."""

    __tablename__ = "table_slots"

    table_id: Mapped[int] = mapped_column(ForeignKey("tables.id"), primary_key=True)
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    slot_index: Mapped[int] = mapped_column(Integer, primary_key=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey("bookings.id"), index=True)


class WaitlistEntry(Base):
    __tablename__ = "waitlist_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    venue_id: Mapped[int] = mapped_column(ForeignKey("venues.id"), index=True)
    date: Mapped[date] = mapped_column(Date)
    wanted_time: Mapped[time] = mapped_column(Time)
    party_size: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(254))
    status: Mapped[str] = mapped_column(String(12), default="waiting")
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utc_now)
