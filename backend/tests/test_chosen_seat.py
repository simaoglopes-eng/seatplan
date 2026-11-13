"""The diner's optional chair (spec 9.4): indicative only, the table is the booking.

The chair travels in BookingIn.seat_id, must belong to one of the held tables
and must not be blocked. It is stored on the booking, described to the diner
and the staff, and dropped when a change moves the booking to other tables.
"""

from datetime import date
from typing import Any

from conftest import auth_header
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from test_restaurant_helpers import Place, book, future_day, hold, make_restaurant

from app.models import Booking, Organiser, Room, RoomOpening, Seat, Venue, VenueTable

OUTLINE = {
    "points": [
        {"x": 0, "y": 0, "curve": 0},
        {"x": 1000, "y": 0, "curve": 0},
        {"x": 1000, "y": 700, "curve": 0},
        {"x": 0, "y": 700, "curve": 0},
    ]
}


def add_seats(
    session: Session, place: Place, label: str, count: int = 2, **fields: Any
) -> list[int]:
    """Chairs 1..count for one table; returns their ids."""
    table = session.get(VenueTable, place.table[label])
    assert table is not None
    ids = []
    for number in range(1, count + 1):
        seat = Seat(
            venue_id=place.venue_id,
            table_id=table.id,
            label=str(number),
            x=table.x + 10 * number,
            y=table.y,
            **fields,
        )
        session.add(seat)
        session.flush()
        ids.append(seat.id)
    session.commit()
    return ids


def booked(
    client: TestClient, place: Place, day: date, party: int, seat_id: int | None, **hold_extra
):
    held = hold(client, place, day, "19:00", party, **hold_extra)
    assert held.status_code == 201, held.text
    extra = {} if seat_id is None else {"seat_id": seat_id}
    return held, book(client, place, held.json()["hold_id"], party, **extra)


# ---------------------------------------------------------------- choosing


def test_the_chair_is_kept_and_described(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    first, second = add_seats(session, place, "T1")
    _, answer = booked(client, place, future_day(), 2, second, table_id=place.table["T1"])
    assert answer.status_code == 201, answer.text
    seat = answer.json()["booking"]["seat"]
    assert seat["id"] == second and seat["label"] == "2"
    assert seat["table_id"] == place.table["T1"]
    assert seat["phrase"] is None  # a restaurant without windows says nothing about the view
    stored = session.query(Booking).filter_by(venue_id=place.venue_id).one()
    assert stored.chosen_seat_id == second
    # The manage page shows it too, and no other booking field changed.
    token = answer.json()["manage_token"]
    assert client.get(f"/api/b/{token}").json()["seat"]["label"] == "2"
    assert first != second


def test_no_chair_is_fine(client: TestClient, session: Session, organiser: Organiser) -> None:
    place = make_restaurant(session, organiser)
    _, answer = booked(client, place, future_day(), 2, None, table_id=place.table["T1"])
    assert answer.status_code == 201
    assert answer.json()["booking"]["seat"] is None


def test_a_chair_of_a_combination_is_accepted(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    (seat,) = add_seats(session, place, "T6", count=1)
    held, answer = booked(client, place, future_day(), 7, seat)
    assert held.json()["table"]["labels"] == ["T5", "T6"]
    assert answer.status_code == 201, answer.text
    assert answer.json()["booking"]["seat"]["id"] == seat


# ---------------------------------------------------------------- refusing


def test_a_chair_of_another_table_is_refused_and_the_hold_survives(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    (elsewhere,) = add_seats(session, place, "T2", count=1)
    held, answer = booked(client, place, future_day(), 2, elsewhere, table_id=place.table["T1"])
    assert answer.status_code == 422, answer.text
    retry = book(client, place, held.json()["hold_id"], 2)
    assert retry.status_code == 201, retry.text
    assert retry.json()["booking"]["seat"] is None


def test_blocked_unknown_and_foreign_chairs_are_refused(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    (blocked,) = add_seats(session, place, "T1", count=1, is_blocked=True)
    other = make_restaurant(session, organiser)
    (foreign,) = add_seats(session, other, "T1", count=1)
    held = hold(client, place, future_day(), "19:00", 2, table_id=place.table["T1"])
    assert held.status_code == 201
    for seat_id in (blocked, foreign, 987654):
        answer = book(client, place, held.json()["hold_id"], 2, seat_id=seat_id)
        assert answer.status_code == 422, seat_id


# ---------------------------------------------------------------- what the chair faces


def room_with_window(session: Session, place: Place) -> None:
    venue = session.get(Venue, place.venue_id)
    assert venue is not None
    venue.lat, venue.lng = 38.7223, -9.1393
    room = Room(venue_id=venue.id, name="Main room", north_deg=0, outline=OUTLINE)
    session.add(room)
    session.flush()
    session.add(RoomOpening(room_id=room.id, side=2, offset=300, width=400, kind="window"))
    table = session.get(VenueTable, place.table["T1"])
    assert table is not None
    table.room_id, table.x, table.y, table.w, table.h = room.id, 460, 615, 80, 80
    session.commit()


def test_the_sentence_says_which_way_the_chair_faces(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    room_with_window(session, place)
    north, south = add_seats(session, place, "T1")
    # Chair 1 sits on the table's north edge (looking south at the window).
    for seat_id, (x, y) in ((north, (500, 612)), (south, (500, 698))):
        seat = session.get(Seat, seat_id)
        assert seat is not None
        seat.x, seat.y = x, y
    session.commit()
    for offset, (seat_id, words) in enumerate(
        ((north, "Facing the window"), (south, "Back to the window"))
    ):
        _, answer = booked(
            client, place, future_day(7 + offset), 2, seat_id, table_id=place.table["T1"]
        )
        assert answer.status_code == 201, answer.text
        assert answer.json()["booking"]["seat"]["phrase"] == words


# ---------------------------------------------------------------- the staff and changes


def test_the_staff_sees_the_chair(
    client: TestClient, session: Session, organiser: Organiser, staff: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    _, second = add_seats(session, place, "T1")
    _, answer = booked(client, place, future_day(), 2, second, table_id=place.table["T1"])
    assert answer.status_code == 201
    floor = client.get(
        f"/api/staff/{place.public_id}/floor",
        params={"date": future_day().isoformat(), "time": "19:00"},
        headers=auth_header(staff),
    ).json()
    (row,) = floor["bookings"]
    assert row["seat"] == {"id": second, "label": "2", "table_id": place.table["T1"]}
    assert "phrase" not in row["seat"]  # the floor stays light: no ambience per booking


def test_changing_the_time_keeps_the_chair_but_other_tables_drop_it(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    _, second = add_seats(session, place, "T1")
    _, answer = booked(client, place, future_day(), 2, second, table_id=place.table["T1"])
    token = answer.json()["manage_token"]
    later = client.patch(f"/api/b/{token}", json={"time": "20:00"})
    assert later.status_code == 200, later.text
    assert later.json()["table_ids"] == [place.table["T1"]]
    assert later.json()["seat"]["id"] == second
    bigger = client.patch(f"/api/b/{token}", json={"party_size": 4})  # T1 seats only two
    assert bigger.status_code == 200, bigger.text
    assert bigger.json()["table_ids"] != [place.table["T1"]]
    assert bigger.json()["seat"] is None
    session.expire_all()
    assert session.query(Booking).one().chosen_seat_id is None


def test_a_staff_move_drops_a_chair_that_is_no_longer_at_the_table(
    client: TestClient, session: Session, organiser: Organiser, staff: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    _, second = add_seats(session, place, "T1")
    _, answer = booked(client, place, future_day(), 2, second, table_id=place.table["T1"])
    booking_id = answer.json()["booking"]["id"]
    moved = client.post(
        f"/api/staff/{place.public_id}/bookings/{booking_id}/move",
        json={"table_ids": [place.table["T4"]]},
        headers=auth_header(staff),
    )
    assert moved.status_code == 200, moved.text
    session.expire_all()
    assert session.query(Booking).one().chosen_seat_id is None


# ---------------------------------------------------------------- listing the chairs of a table


def test_the_chairs_of_a_table_come_with_their_sentence_and_blocked_flag(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    room_with_window(session, place)
    north, south = add_seats(session, place, "T1")
    for seat_id, (x, y) in ((north, (500, 612)), (south, (500, 698))):
        seat = session.get(Seat, seat_id)
        assert seat is not None
        seat.x, seat.y = x, y
    blocked = session.get(Seat, south)
    assert blocked is not None
    blocked.is_blocked = True
    session.commit()
    answer = client.get(
        f"/api/r/{place.public_id}/seats", params={"table_ids": str(place.table["T1"])}
    )
    assert answer.status_code == 200, answer.text
    body = answer.json()
    assert [t["id"] for t in body["tables"]] == [place.table["T1"]]
    assert {"x", "y", "w", "h", "rotation", "shape", "label"} <= set(body["tables"][0])
    by_id = {s["id"]: s for s in body["seats"]}
    assert by_id[north]["state"] == "free" and by_id[north]["phrase"] == "Facing the window"
    assert by_id[south]["state"] == "blocked"
    assert {"table_id", "label", "x", "y", "accessible"} <= set(by_id[north])


def test_several_tables_can_be_asked_at_once_up_to_three(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    add_seats(session, place, "T5", count=1)
    add_seats(session, place, "T6", count=2)
    ids = f"{place.table['T5']},{place.table['T6']}"
    body = client.get(f"/api/r/{place.public_id}/seats", params={"table_ids": ids}).json()
    assert len(body["tables"]) == 2 and len(body["seats"]) == 3
    four = ",".join(str(place.table[label]) for label in ("T1", "T2", "T3", "T4"))
    assert (
        client.get(f"/api/r/{place.public_id}/seats", params={"table_ids": four}).status_code == 422
    )


def test_unknown_inactive_foreign_or_malformed_tables_are_refused(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    other = make_restaurant(session, organiser)
    off = session.get(VenueTable, place.table["T2"])
    assert off is not None
    off.is_active = False
    session.commit()
    url = f"/api/r/{place.public_id}/seats"
    assert client.get(url, params={"table_ids": "987654"}).status_code == 404
    assert client.get(url, params={"table_ids": str(other.table["T1"])}).status_code == 404
    assert client.get(url, params={"table_ids": str(place.table["T2"])}).status_code == 404
    assert client.get(url, params={"table_ids": "abc"}).status_code == 422
    assert client.get(url, params={"table_ids": ""}).status_code == 422
    assert client.get(url).status_code == 422


# ---------------------------------------------------------------- changing the chair later


def test_the_diner_can_change_and_remove_the_chair_from_the_manage_link(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    first, second = add_seats(session, place, "T1")
    _, answer = booked(client, place, future_day(), 2, first, table_id=place.table["T1"])
    token = answer.json()["manage_token"]
    moved = client.patch(f"/api/b/{token}", json={"seat_id": second})
    assert moved.status_code == 200, moved.text
    assert moved.json()["seat"]["id"] == second and "phrase" in moved.json()["seat"]
    assert client.get(f"/api/b/{token}").json()["seat"]["id"] == second
    cleared = client.patch(f"/api/b/{token}", json={"seat_id": None})
    assert cleared.status_code == 200 and cleared.json()["seat"] is None
    stored = session.query(Booking).filter_by(venue_id=place.venue_id).one()
    session.refresh(stored)
    assert stored.chosen_seat_id is None and stored.table_choice == "chosen"


def test_a_chair_at_another_table_or_a_blocked_one_is_refused_and_nothing_changes(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    own, blocked = add_seats(session, place, "T1")
    (other,) = add_seats(session, place, "T2", count=1)
    session.get(Seat, blocked).is_blocked = True  # type: ignore[union-attr]
    session.commit()
    _, answer = booked(client, place, future_day(), 2, own, table_id=place.table["T1"])
    token = answer.json()["manage_token"]
    for bad in (other, blocked, 999_999):
        refused = client.patch(f"/api/b/{token}", json={"seat_id": bad})
        assert refused.status_code == 422, refused.text
    assert client.get(f"/api/b/{token}").json()["seat"]["id"] == own


def test_the_seat_is_changed_on_its_own_not_with_the_time(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    first, second = add_seats(session, place, "T1")
    _, answer = booked(client, place, future_day(), 2, first, table_id=place.table["T1"])
    token = answer.json()["manage_token"]
    both = client.patch(f"/api/b/{token}", json={"seat_id": second, "time": "19:30"})
    assert both.status_code == 422
    assert client.get(f"/api/b/{token}").json()["time"] == "19:00"


def test_a_cancelled_booking_cannot_change_its_chair(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    first, second = add_seats(session, place, "T1")
    _, answer = booked(client, place, future_day(), 2, first, table_id=place.table["T1"])
    token = answer.json()["manage_token"]
    assert client.delete(f"/api/b/{token}").status_code == 200
    assert client.patch(f"/api/b/{token}", json={"seat_id": second}).status_code == 409


def test_the_staff_map_marks_the_chair_the_guest_asked_for(
    client: TestClient, session: Session, organiser: Organiser, staff: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    first, second = add_seats(session, place, "T1")
    add_seats(session, place, "T2", count=1)
    _, answer = booked(client, place, future_day(), 2, second, table_id=place.table["T1"])
    assert answer.status_code == 201
    params = {"date": future_day().isoformat()}
    headers = auth_header(staff)

    def seats_at(at: str) -> dict[int, str]:
        floor = client.get(
            f"/api/staff/{place.public_id}/floor", params={**params, "time": at}, headers=headers
        ).json()
        return {seat["id"]: seat["state"] for seat in floor["seats"]}

    during = seats_at("19:00")
    # Only the asked-for chair is marked; the rest of the booked table looks taken, other tables free.
    assert during[second] == "mine" and during[first] == "taken"
    assert set(during.values()) == {"mine", "taken", "free"}
    # Before the booking nothing is marked, and the guest's name is not on any chair.
    assert "mine" not in seats_at("12:00").values()
    floor = client.get(
        f"/api/staff/{place.public_id}/floor", params={**params, "time": "19:00"}, headers=headers
    ).json()
    assert all(seat.get("occupant") is None for seat in floor["seats"])
