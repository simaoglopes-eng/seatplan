"""/guest/events/{eid} behaves exactly like the personal link /a/{token}."""

import threading

from fastapi.testclient import TestClient
from guest_helpers import account_headers, bearer, make_account, shared_event, sign_up
from sqlalchemy.orm import Session
from test_events_setup import add_guest, make_event

from app.events_service import share
from app.models import Event, Organiser

INVITED = [{"name": "Bruno Costa", "email": "bruno.costa@example.com"}]


def _seat_state(page: dict, seat_id: int) -> str:
    return next(seat["state"] for seat in page["map"]["seats"] if seat["id"] == seat_id)


def test_the_full_flow_through_an_account(client: TestClient, organiser: Organiser) -> None:
    setup, token = shared_event(client, organiser, INVITED)
    headers = bearer(sign_up(client, token, "kai@example.com", name="Kai Lobo")["token"])
    base = f"/api/guest/events/{setup.eid}"
    page = client.get(base, headers=headers).json()
    assert page["me"]["name"] == "Kai Lobo" and page["event"]["name"] == "Test party"
    assert [p["name"] for p in page["people"]] == ["Bruno C."]
    bruno = setup.guests["Bruno Costa"]
    assert client.post(f"{base}/knows", headers=headers, json={"guest_ids": [bruno]}).json() == {
        "knows": [bruno]
    }
    privacy = client.post(f"{base}/privacy", headers=headers, json={"wants_anonymous": True})
    assert privacy.json() == {"wants_anonymous": True, "shown_to_others_as": "Guest"}
    assert client.get(f"{base}/people?q=bru", headers=headers).json()[0]["id"] == bruno
    assert client.get(f"{base}/recommendations", headers=headers).status_code == 200
    seat = setup.seats[0][0]
    assert client.post(f"{base}/hold", headers=headers, json={"seat_id": seat}).status_code == 200
    confirmed = client.post(f"{base}/confirm", headers=headers, json={"seat_id": seat})
    assert confirmed.json() == {"seat_id": seat, "source": "self"}
    assert _seat_state(client.get(base, headers=headers).json(), seat) == "mine"
    assert _seat_state(client.get(f"/api/a/{setup.tokens['Bruno Costa']}").json(), seat) == "taken"
    assert client.delete(f"{base}/seat", headers=headers).json() == {"seat_id": None}
    assert client.delete(f"{base}/seat", headers=headers).status_code == 404
    assert client.post(f"{base}/rsvp", headers=headers, json={"rsvp": "no"}).json() == {
        "rsvp": "no"
    }
    refused = client.post(f"{base}/hold", headers=headers, json={"seat_id": seat})
    assert refused.status_code == 409


def test_not_a_member_removed_or_another_event_is_404(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    setup, token = shared_event(client, organiser)
    other = make_event(client, organiser, [])
    result = sign_up(client, token, "mo@example.com")
    headers = bearer(result["token"])
    outsider = account_headers(make_account(session, "out@example.com"))
    assert client.get(f"/api/guest/events/{setup.eid}", headers=outsider).status_code == 404
    assert client.get(f"/api/guest/events/{other.eid}", headers=headers).status_code == 404
    assert client.get("/api/guest/events/not-an-event", headers=headers).status_code == 404
    guests = client.get(f"/api/events/{setup.eid}/guests", headers=setup.headers).json()
    client.delete(f"/api/events/{setup.eid}/guests/{guests[0]['id']}", headers=setup.headers)
    gone = client.get(f"/api/guest/events/{setup.eid}", headers=headers)
    assert gone.status_code == 404
    assert gone.json()["error"]["message"] == "You are not on the guest list of this event."


def test_one_account_on_two_events(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    first, first_token = shared_event(client, organiser)
    second, second_token = shared_event(client, organiser)
    later = session.query(Event).filter(Event.public_id == second.eid).one()
    later_start = later.starts_at.replace(year=2031)
    later.starts_at, later.ends_at = later_start, later_start.replace(hour=23)
    session.commit()
    headers = bearer(sign_up(client, first_token, "two@example.com")["token"])
    joined = client.post(f"/api/j/{second_token}/join", headers=headers, json={})
    assert joined.json()["status"] == "joined"
    for setup, seat in ((first, first.seats[0][1]), (second, second.seats[1][2])):
        base = f"/api/guest/events/{setup.eid}"
        client.post(f"{base}/hold", headers=headers, json={"seat_id": seat})
        assert (
            client.post(f"{base}/confirm", headers=headers, json={"seat_id": seat}).status_code
            == 200
        )
    events = client.get("/api/guest/me", headers=headers).json()["events"]
    assert [(e["event_id"], e["seat"]) for e in events] == [
        (first.eid, {"seat_label": "2", "table_label": "T1"}),
        (second.eid, {"seat_label": "3", "table_label": "T2"}),
    ]
    assert all(e["rsvp"] == "yes" and e["venue_name"] == "Hall" for e in events)


def test_two_account_holders_race_for_one_seat(client: TestClient, organiser: Organiser) -> None:
    setup, token = shared_event(client, organiser)
    people = [bearer(sign_up(client, token, f"racer{n}@example.com")["token"]) for n in range(2)]
    seat = setup.seats[0][0]
    start = threading.Barrier(2)
    codes: list[int] = []

    def grab(headers: dict[str, str]) -> None:
        start.wait()
        base = f"/api/guest/events/{setup.eid}"
        held = client.post(f"{base}/hold", headers=headers, json={"seat_id": seat})
        if held.status_code != 200:
            codes.append(held.status_code)
            assert held.json()["error"]["code"] == "seat_taken"
            return
        codes.append(
            client.post(f"{base}/confirm", headers=headers, json={"seat_id": seat}).status_code
        )

    threads = [threading.Thread(target=grab, args=(h,)) for h in people]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sorted(codes) == [200, 409]


def test_places_left_counts_unanswered_invitations(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    setup, _token = shared_event(client, organiser)
    add_guest(client, setup, {"name": "Not answered yet"})
    event = session.query(Event).filter(Event.public_id == setup.eid).one()
    assert share.places_left(session, event) == 7
