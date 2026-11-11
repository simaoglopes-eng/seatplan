"""Plan snapshots: scenarios, applying a plan safely, and undo / redo.

One table (plan_snapshots) holds two kinds of snapshot, told apart by the
"kind" stored inside the assignments JSON:
- "scenario": a proposal from auto-fill or re-plan. Never applied by itself.
- "history":  the plan as it was after each organiser change. Undo and redo
               walk along this list; exactly one history row is_current.

A stored plan is {"kind": ..., "seats": {"<guest id>": [seat id, source]}}.
JSON object keys are always text, hence the string guest ids.
"""

from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core import audit
from app.core.errors import ApiError
from app.events_service.access import is_active
from app.events_service.mailer import sync_reminder
from app.events_service.problem import current_rows, plan_of, score_plan
from app.events_service.seating import lock_event, queue_change_email, seat_for_guest
from app.models import Event, Guest, PlanSnapshot, Seat, SeatAssignment

SCENARIO = "scenario"
HISTORY = "history"
CHANGED_SINCE = "This seat was chosen by a person and changed since; we kept the current choice."
STILL_SEATED = "Someone else still sits on this seat, so we kept the current choice."

# guest id -> (seat id, source)
PlanState = dict[int, tuple[int, str]]


def state_of_rows(rows: dict[int, SeatAssignment]) -> PlanState:
    return {guest_id: (row.seat_id, row.source) for guest_id, row in rows.items()}


def state_of(snapshot: PlanSnapshot) -> PlanState:
    seats = snapshot.assignments.get("seats", {})
    return {int(guest_id): (pair[0], pair[1]) for guest_id, pair in seats.items()}


def kind_of(snapshot: PlanSnapshot) -> str:
    return str(snapshot.assignments.get("kind", SCENARIO))


def save_snapshot(
    session: Session, event: Event, kind: str, label: str, state: PlanState, score: dict[str, Any]
) -> PlanSnapshot:
    # Locking first makes a second save on this event wait until we commit, so
    # under Postgres it reads our seq as the highest and never reuses it.
    lock_event(session, event)
    last = session.scalar(
        select(func.max(PlanSnapshot.seq)).where(PlanSnapshot.event_id == event.id)
    )
    seats = {str(guest_id): [seat_id, source] for guest_id, (seat_id, source) in state.items()}
    snapshot = PlanSnapshot(
        event_id=event.id,
        seq=(last or 0) + 1,
        label=label[:80],
        assignments={"kind": kind, "seats": seats},
        score=score,
        is_current=False,
    )
    session.add(snapshot)
    session.flush()
    return snapshot


def snapshots(session: Session, event: Event, kind: str) -> list[PlanSnapshot]:
    query = select(PlanSnapshot).where(PlanSnapshot.event_id == event.id).order_by(PlanSnapshot.seq)
    return [snap for snap in session.scalars(query) if kind_of(snap) == kind]


def load_scenario(session: Session, event: Event, seq: int) -> PlanSnapshot:
    for snap in snapshots(session, event, SCENARIO):
        if snap.seq == seq:
            return snap
    raise ApiError(404, "not_found", "Scenario not found.")


# ---------------------------------------------------------------- applying


def _conflict(guest: Guest | None, guest_id: int, seat_id: int, reason: str) -> dict[str, Any]:
    name = guest.name if guest is not None else None
    return {"guest_id": guest_id, "name": name, "seat_id": seat_id, "reason": reason}


def _check_entry(
    session: Session, event: Event, guest: Guest | None, seat_id: int, taken_by: int | None
) -> str:
    """Why this planned seat cannot be written now, or "" when it can."""
    if guest is None or not is_active(guest):
        return "This guest has cancelled or was removed."
    if taken_by is not None and taken_by != guest.id:
        return "Someone chose this seat in the meantime; their choice was kept."
    try:
        seat_for_guest(session, event, guest, seat_id)
    except ApiError:
        return "This seat no longer suits this guest (blocked, reserved or not accessible)."
    return ""


def _wanted_entries(
    session: Session,
    event: Event,
    target: PlanState,
    rows: dict[int, SeatAssignment],
    protected: set[str],
) -> tuple[PlanState, list[dict[str, Any]]]:
    """The target entries we may write now, and a conflict for every other one.

    Checked only against the protected rows, which stay whatever happens, so
    the answer does not depend on the order of the guests.
    """
    kept = {guest_id: row for guest_id, row in rows.items() if row.source in protected}
    taken = {row.seat_id: guest_id for guest_id, row in kept.items()}
    wanted: PlanState = {}
    conflicts: list[dict[str, Any]] = []
    for guest_id, (seat_id, source) in sorted(target.items()):
        guest = session.get(Guest, guest_id)
        if guest_id in kept:
            if kept[guest_id].seat_id != seat_id:
                conflicts.append(_conflict(guest, guest_id, seat_id, CHANGED_SINCE))
            continue
        if source in protected and guest_id not in rows:
            # The person gave this seat up since; bringing it back would overrule them.
            conflicts.append(_conflict(guest, guest_id, seat_id, CHANGED_SINCE))
            continue
        reason = _check_entry(session, event, guest, seat_id, taken.get(seat_id))
        if reason:
            conflicts.append(_conflict(guest, guest_id, seat_id, reason))
        else:
            wanted[guest_id] = (seat_id, source)
    return wanted, conflicts


def _keep_unreplaced(
    session: Session,
    rows: dict[int, SeatAssignment],
    wanted: PlanState,
    conflicts: list[dict[str, Any]],
    protected: set[str],
) -> set[int]:
    """Guests who keep their current seat because no replacement can be written.

    Invariant: we never delete a guest's seat unless we write them a new one.
    A kept seat can block another guest's planned seat; that guest then keeps
    their own current seat too, so we repeat until nothing changes.
    """
    refused = {conflict["guest_id"] for conflict in conflicts}
    keep = {g for g in refused if g in rows and rows[g].source not in protected}
    while True:
        occupied = {rows[guest_id].seat_id for guest_id in keep}
        blocked = sorted(g for g, (seat_id, _source) in wanted.items() if seat_id in occupied)
        if not blocked:
            return keep
        for guest_id in blocked:
            seat_id, _source = wanted.pop(guest_id)
            guest = session.get(Guest, guest_id)
            conflicts.append(_conflict(guest, guest_id, seat_id, STILL_SEATED))
            if guest_id in rows:
                keep.add(guest_id)


def apply_plan(
    session: Session, event: Event, target: PlanState, protected: set[str]
) -> dict[str, Any]:
    """Make the plan `target` real, without ever overwriting a protected choice.

    Rows whose source is in `protected` stay exactly as they are now, whatever
    the target says; a target entry that disagrees is reported as a conflict.
    Every other row is replaced by the target, except that a guest whose
    planned seat cannot be written keeps the seat they have. Does not commit.
    """
    lock_event(session, event)
    rows = current_rows(session, event)
    seat_before = {guest_id: row.seat_id for guest_id, row in rows.items()}
    wanted, conflicts = _wanted_entries(session, event, target, rows, protected)
    keep = _keep_unreplaced(session, rows, wanted, conflicts, protected)
    # Executed at once (not queued), so the UNIQUE constraints see the old
    # rows gone before the new rows arrive.
    session.execute(
        delete(SeatAssignment).where(
            (SeatAssignment.event_id == event.id)
            & SeatAssignment.source.not_in(protected)
            & SeatAssignment.guest_id.not_in(keep)
        )
    )
    for guest_id, (seat_id, source) in wanted.items():
        session.add(
            SeatAssignment(event_id=event.id, guest_id=guest_id, seat_id=seat_id, source=source)
        )
    session.flush()
    _sync_reminders(session, event, seat_before)
    conflicts.sort(key=lambda conflict: conflict["guest_id"])
    return {"applied": len(wanted), "conflicts": conflicts}


def _email_account_holder(
    session: Session, event: Event, guest: Guest, seat: Seat, old_seat_id: int | None
) -> None:
    """The organiser's plan gave an account holder a new seat: email them
    their seat and the picture, as a single organiser move does. No commit."""
    entry = audit.record(
        session,
        actor="plan",
        action="seat.plan_move",
        entity="guest",
        entity_id=str(guest.id),
        detail={"seat_id": seat.id},
    )
    # Also moves their reminder to the new seat.
    queue_change_email(session, event, guest, seat, old_seat_id, entry, moved_by_organiser=True)


def _sync_reminders(session: Session, event: Event, seat_before: dict[int, int]) -> None:
    """Tell each moved guest what changed: move their reminder, or cancel it.

    A guest with only a personal link gets no seat email from a plan (it can
    move dozens of people at once), but the reminder must never name a seat
    they no longer have. A guest account holder was promised an email with
    the picture whenever the organiser moves them, so they get one.
    """
    seat_after = {guest_id: row.seat_id for guest_id, row in current_rows(session, event).items()}
    for guest_id in sorted(set(seat_before) | set(seat_after)):
        seat_id = seat_after.get(guest_id)
        guest = session.get(Guest, guest_id)
        if guest is None or seat_before.get(guest_id) == seat_id:
            continue
        seat = session.get(Seat, seat_id) if seat_id is not None else None
        if guest.account_id is not None and seat is not None:
            _email_account_holder(session, event, guest, seat, seat_before.get(guest_id))
        else:
            sync_reminder(session, event, guest, seat)


# ---------------------------------------------------------------- undo / redo


def _current_state_snapshot(session: Session, event: Event, label: str) -> PlanSnapshot:
    rows = current_rows(session, event)
    score = score_plan(session, event, event.venue_id, plan_of(rows))
    snapshot = save_snapshot(session, event, HISTORY, label, state_of_rows(rows), score)
    snapshot.is_current = True
    return snapshot


def ensure_baseline(session: Session, event: Event) -> None:
    """Before the first organiser change, remember how the plan looked, so it can be undone."""
    if not snapshots(session, event, HISTORY):
        _current_state_snapshot(session, event, "Before the first change")


def push_history(session: Session, event: Event, label: str) -> None:
    """After an organiser change: forget any redo steps, then remember the new plan."""
    history = snapshots(session, event, HISTORY)
    current = next((snap for snap in history if snap.is_current), None)
    for snap in history:
        if current is not None and snap.seq > current.seq:
            session.delete(snap)
        snap.is_current = False
    session.flush()
    _current_state_snapshot(session, event, label)


def step_history(session: Session, event: Event, step: int) -> dict[str, Any]:
    """Undo (step=-1) or redo (step=+1). Guests' own choices are never undone."""
    history = snapshots(session, event, HISTORY)
    index = next((i for i, snap in enumerate(history) if snap.is_current), None)
    if index is None or not 0 <= index + step < len(history):
        word = "undo" if step < 0 else "redo"
        raise ApiError(409, "conflict", f"There is nothing to {word}.")
    target = history[index + step]
    result = apply_plan(session, event, state_of(target), protected={"self"})
    history[index].is_current = False
    target.is_current = True
    return {**result, "label": target.label, "seq": target.seq}
