"""Event reminders: queued with the seat, moved with it, cancelled when it goes."""

from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_events_setup import choose, make_event

from app.mail.reminders import reminder_time, sync_event_reminder
from app.models import EmailOutbox, Event, Guest, Organiser, Venue, utc_now
from app.security import hash_token

LINK = "https://seatplan.example/e/abc"


def _event_and_guest(session: Session, starts_in: timedelta) -> tuple[Event, Guest]:
    owner = Organiser(email="remind.owner@example.com", name="Owner", password_hash="x")
    session.add(owner)
    session.flush()
    venue = Venue(organiser_id=owner.id, kind="event", name="Hall", width=100, height=100)
    session.add(venue)
    session.flush()
    starts = utc_now() + starts_in
    event = Event(
        venue_id=venue.id,
        organiser_id=owner.id,
        name="Gala",
        starts_at=starts,
        ends_at=starts + timedelta(hours=3),
    )
    session.add(event)
    session.flush()
    guest = Guest(
        event_id=event.id,
        name="Ana Silva",
        email="ana.silva@example.com",
        token_hash=hash_token("t"),
    )
    session.add(guest)
    session.flush()
    return event, guest


def _reminders(session: Session) -> list[EmailOutbox]:
    return list(session.scalars(select(EmailOutbox).where(EmailOutbox.kind == "event_reminder")))


def test_confirmed_seat_queues_one_reminder_a_day_before(session: Session) -> None:
    event, guest = _event_and_guest(session, timedelta(days=3))
    sync_event_reminder(session, event=event, guest=guest, seat_label="5 at table 3", link=LINK)
    sync_event_reminder(session, event=event, guest=guest, seat_label="5 at table 3", link=LINK)
    rows = _reminders(session)
    assert len(rows) == 1  # stable key: a retry adds nothing
    assert rows[0].status == "queued"
    assert rows[0].next_attempt_at == event.starts_at - timedelta(hours=24)
    assert "5 at table 3" in rows[0].body_text


def test_seat_change_updates_the_queued_reminder(session: Session) -> None:
    event, guest = _event_and_guest(session, timedelta(days=3))
    sync_event_reminder(session, event=event, guest=guest, seat_label="5 at table 3", link=LINK)
    sync_event_reminder(session, event=event, guest=guest, seat_label="2 at table 1", link=LINK)
    rows = _reminders(session)
    assert len(rows) == 1
    assert "2 at table 1" in rows[0].body_text
    assert "5 at table 3" not in rows[0].body_text


def test_release_cancels_and_a_new_seat_brings_it_back(session: Session) -> None:
    event, guest = _event_and_guest(session, timedelta(days=3))
    sync_event_reminder(session, event=event, guest=guest, seat_label="5 at table 3", link=LINK)
    sync_event_reminder(session, event=event, guest=guest, seat_label=None, link=LINK)
    assert _reminders(session)[0].status == "skipped"
    sync_event_reminder(session, event=event, guest=guest, seat_label="1 at table 2", link=LINK)
    rows = _reminders(session)
    assert [row.status for row in rows] == ["queued"]


def test_erased_guest_gets_no_reminder(session: Session) -> None:
    event, guest = _event_and_guest(session, timedelta(days=3))
    sync_event_reminder(session, event=event, guest=guest, seat_label="5 at table 3", link=LINK)
    guest.email = None  # what the GDPR erase does
    sync_event_reminder(session, event=event, guest=guest, seat_label="5 at table 3", link=LINK)
    assert _reminders(session)[0].status == "skipped"


def test_sent_reminder_is_never_changed(session: Session) -> None:
    event, guest = _event_and_guest(session, timedelta(days=3))
    sync_event_reminder(session, event=event, guest=guest, seat_label="5 at table 3", link=LINK)
    _reminders(session)[0].status = "sent"
    sync_event_reminder(session, event=event, guest=guest, seat_label=None, link=LINK)
    assert _reminders(session)[0].status == "sent"


def test_reminder_time_falls_back_to_two_hours_then_none() -> None:
    now = utc_now()
    assert reminder_time(now + timedelta(days=2), now) == now + timedelta(days=1)
    assert reminder_time(now + timedelta(hours=5), now) == now + timedelta(hours=3)
    assert reminder_time(now + timedelta(hours=1), now) is None


def test_event_soon_gets_no_reminder(session: Session) -> None:
    event, guest = _event_and_guest(session, timedelta(hours=1))
    sync_event_reminder(session, event=event, guest=guest, seat_label="5 at table 3", link=LINK)
    assert _reminders(session) == []


# ---------------------------------------------------------------- wired into the events code


def test_seat_changes_through_the_api_keep_the_reminder_in_step(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    guests = [{"name": "Ana Silva", "email": "ana.silva@example.com"}]
    setup = make_event(client, organiser, guests)
    ana_id = setup.guests["Ana Silva"]
    choose(client, setup, "Ana Silva", setup.seats[0][0])
    session.expire_all()
    rows = _reminders(session)
    assert [row.status for row in rows] == ["queued"]
    assert "1 at table T1" in rows[0].body_text

    moved = client.put(
        f"/api/events/{setup.eid}/assignments/{ana_id}",
        headers=setup.headers,
        json={"seat_id": setup.seats[1][1]},
    )
    assert moved.status_code == 200
    session.expire_all()
    assert "2 at table T2" in _reminders(session)[0].body_text

    released = client.delete(f"/api/a/{setup.tokens['Ana Silva']}/seat")
    assert released.status_code == 200
    session.expire_all()
    assert [row.status for row in _reminders(session)] == ["skipped"]


def test_applying_a_plan_gives_each_newly_seated_guest_a_reminder(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    setup = make_event(client, organiser, [{"name": "Rui Lopes", "email": "rui.lopes@example.com"}])
    scenario = client.post(
        f"/api/events/{setup.eid}/optimise/autofill", headers=setup.headers, json={"seed": 1}
    )
    assert scenario.status_code == 200, scenario.text
    sid = scenario.json()["id"]
    applied = client.post(f"/api/events/{setup.eid}/scenarios/{sid}/apply", headers=setup.headers)
    assert applied.status_code == 200, applied.text
    session.expire_all()
    rows = _reminders(session)
    assert [(row.to_email, row.status) for row in rows] == [("rui.lopes@example.com", "queued")]

    undone = client.post(f"/api/events/{setup.eid}/undo", headers=setup.headers)
    assert undone.status_code == 200, undone.text
    session.expire_all()
    assert [row.status for row in _reminders(session)] == ["skipped"]
