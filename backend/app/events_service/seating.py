"""An attendee holds, confirms and releases a seat.

The database decides who gets a seat (contract section 4): a hold is a row in
`holds` and a confirmed seat is a row in `seat_assignments`, and both tables
have UNIQUE constraints. We never "check, then insert" without that guard; the
checks below only exist to give a friendlier message earlier.

Lock order: every write transaction on an event starts with lock_event(),
which updates the event's row in live_versions. Postgres then makes a second
writer wait at that first step, so two writers never hold one lock each while
waiting for the other's (a deadlock). If the database still gives up on a
transaction, main.py turns that into a calm 409 "please try again".
"""

from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import audit, live
from app.core.errors import ApiError, SeatTaken
from app.core.holds import commit_or_seat_taken, confirm_hold, take_hold
from app.events_service.access import event_scope, require_before_deadline
from app.events_service.mailer import queue_seat_email, sync_reminder
from app.events_service.problem import current_rows, guest_specs, seat_spec
from app.events_service.seatmap import holder_key
from app.models import AuditLog, Event, Guest, Hold, Seat, SeatAssignment, utc_now
from app.optimiser.events_model import seat_allows


def lock_event(session: Session, event: Event) -> None:
    """Take the event's write lock: call this before any other write.

    Bumping the live version updates one row per event, and Postgres lets only
    one open transaction update a row. Doing it first gives every transaction
    on the event the same lock order. It also tells listeners about the change
    when we commit, so later bumps in the same transaction are not needed.
    """
    live.bump(session, event_scope(event))


def taken_message(seat: Seat) -> str:
    return (
        f"Seat {seat.label} was just taken by someone else. "
        "Please choose another seat; the map shows what is still free."
    )


def seat_for_guest(session: Session, event: Event, guest: Guest, seat_id: int) -> Seat:
    """The seat, if it belongs to this event's venue and the hard rules allow it."""
    seat = session.get(Seat, seat_id)
    if seat is None or seat.venue_id != event.venue_id:
        raise ApiError(404, "not_found", "Seat not found.")
    # The same per-seat rules the optimiser uses (blocked, reserved, accessible).
    if not seat_allows(seat_spec(seat), guest_specs(session, [guest])[0]):
        raise ApiError(409, "conflict", "This seat is not available to you. Please pick another.")
    return seat


def _owned_by_other(session: Session, event: Event, guest: Guest, seat: Seat) -> bool:
    rows = current_rows(session, event).values()
    return any(row.seat_id == seat.id and row.guest_id != guest.id for row in rows)


def require_coming(guest: Guest) -> None:
    if guest.rsvp == "no":
        raise ApiError(409, "conflict", "You said you are not coming. Answer yes first.")


def hold_seat(session: Session, event: Event, guest: Guest, seat_id: int) -> Hold:
    """Hold one seat for five minutes. Taking a new hold drops this guest's other holds."""
    require_before_deadline(event)
    require_coming(guest)
    seat = seat_for_guest(session, event, guest, seat_id)
    lock_event(session, event)
    # Checked after the lock, so a confirm that just committed is already visible.
    if _owned_by_other(session, event, guest, seat):
        raise SeatTaken(taken_message(seat))
    scope = event_scope(event)
    # One seat at a time, so nobody can sit on a whole table "just in case".
    session.execute(
        delete(Hold).where(
            (Hold.scope == scope)
            & (Hold.holder_key == holder_key(guest))
            & (Hold.resource_id != seat.id)
        )
    )
    _audit(session, guest, "seat.hold", seat)
    # take_hold commits all of the above together, or rolls it all back.
    try:
        return take_hold(
            session,
            scope=scope,
            resource_kind="seat",
            resource_id=seat.id,
            holder_key=holder_key(guest),
        )
    except SeatTaken:
        raise SeatTaken(taken_message(seat)) from None


def confirm_seat(
    session: Session, event: Event, guest: Guest, seat_id: int, token: str | None = None
) -> SeatAssignment:
    """Turn the guest's hold into their seat. Changing seat frees the old one at once.

    `token` is the guest's own link token, so their email can link straight back.
    """
    require_before_deadline(event)
    require_coming(guest)
    seat = seat_for_guest(session, event, guest, seat_id)
    lock_event(session, event)
    confirm_hold(
        session,
        scope=event_scope(event),
        resource_kind="seat",
        resource_id=seat.id,
        holder_key=holder_key(guest),
    )
    row = current_rows(session, event).get(guest.id)
    old_seat_id = row.seat_id if row else None
    if row is None:
        row = SeatAssignment(event_id=event.id, guest_id=guest.id, seat_id=seat.id, source="self")
        session.add(row)
    else:
        # An UPDATE of the same row: the old seat is released in this very
        # transaction, and the UNIQUE constraint checks the new one.
        row.seat_id = seat.id
        row.source = "self"
        row.created_at = utc_now()
    flush_or_seat_taken(session, seat)  # the UNIQUE constraints decide right here
    entry = _audit(session, guest, "seat.confirm", seat, {"old_seat_id": old_seat_id})
    queue_change_email(session, event, guest, seat, old_seat_id, entry, token)
    commit_or_seat_taken(session)
    return row


def queue_change_email(
    session: Session,
    event: Event,
    guest: Guest,
    seat: Seat,
    old_seat_id: int | None,
    entry: AuditLog,
    token: str | None = None,
    moved_by_organiser: bool = False,
) -> None:
    """Queue "seat confirmed" or "seat changed" after a seat write, and move the
    guest's reminder to the new seat. No commit.

    Nothing is queued when the seat did not change: that check is also what
    stops a repeated confirm from sending a second email. The audit row's id
    (`entry`, one row per seat action) only makes the key unique per action,
    so two real moves to the same seat never share a key.
    """
    if old_seat_id == seat.id:
        return
    session.flush()  # gives the audit row its id, used in the email key below
    kind = "seat_confirmed" if old_seat_id is None else "seat_changed"
    key = f"seat-{kind}:{guest.id}:{seat.id}:{entry.id}"
    old_seat = session.get(Seat, old_seat_id) if old_seat_id else None
    queue_seat_email(
        session,
        kind=kind,
        key=key,
        guest=guest,
        event=event,
        seat=seat,
        old_seat=old_seat,
        token=token,
        moved_by_organiser=moved_by_organiser,
    )
    sync_reminder(session, event, guest, seat, token)


def release_seat(session: Session, event: Event, guest: Guest, token: str | None = None) -> None:
    """The guest gives their seat back (also used when they answer "no")."""
    require_before_deadline(event)
    if not drop_assignment(session, event, guest, actor=f"guest:{guest.id}", token=token):
        raise ApiError(404, "not_found", "You do not have a seat to release.")
    session.commit()


def drop_assignment(
    session: Session,
    event: Event,
    guest: Guest,
    actor: str,
    token: str | None = None,
    notify: bool = True,
) -> bool:
    """Lock the event, delete the guest's seat and holds, audit, queue the emails. No commit.

    Returns False when the guest had no seat (holds are still dropped).
    `token` is the guest's own link token when the guest is the one acting.
    `notify=False` sends no "seat released" email (a guest deleting their
    account asked us to stop writing); the reminder is cancelled either way.
    """
    lock_event(session, event)
    session.execute(
        delete(Hold).where(
            (Hold.scope == event_scope(event)) & (Hold.holder_key == holder_key(guest))
        )
    )
    row = current_rows(session, event).get(guest.id)
    if row is None:
        return False
    seat = session.get(Seat, row.seat_id)
    session.delete(row)
    entry = audit.record(
        session,
        actor=actor,
        action="seat.release",
        entity="guest",
        entity_id=str(guest.id),
        detail={"seat_id": row.seat_id},
    )
    session.flush()  # gives the audit row its id, used in the email key below
    if seat is not None and notify:
        key = f"seat-cancelled:{guest.id}:{seat.id}:{entry.id}"
        kind = "seat_cancelled"
        queue_seat_email(
            session, kind=kind, key=key, guest=guest, event=event, seat=seat, token=token
        )
    sync_reminder(session, event, guest, None, token)
    return True


def _audit(
    session: Session,
    guest: Guest,
    action: str,
    seat: Seat,
    extra: dict[str, int | None] | None = None,
) -> AuditLog:
    return audit.record(
        session,
        actor=f"guest:{guest.id}",
        action=action,
        entity="seat",
        entity_id=str(seat.id),
        detail={"guest_id": guest.id, **(extra or {})},
    )


def flush_or_seat_taken(session: Session, seat: Seat) -> None:
    """Send the seat write to the database now and turn a UNIQUE clash into 409.

    We flush straight after changing the seat row, before anything else runs a
    query: SQLAlchemy would otherwise flush on that query and the clash would
    surface somewhere unexpected.
    """
    try:
        session.flush()
    except IntegrityError:
        session.rollback()
        raise SeatTaken(taken_message(seat)) from None
