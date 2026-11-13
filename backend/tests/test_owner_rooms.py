"""Owner room persistence through HTTP: identities, versions and bookings."""

from copy import deepcopy

from conftest import make_user
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from test_restaurant_helpers import future_day, hold_and_book, make_restaurant

from app.models import Organiser
from app.security import create_session_token


def owner_rooms(client: TestClient, owner: Organiser) -> tuple[str, dict[str, str]]:
    headers = {"Authorization": f"Bearer {create_session_token(owner.id)}"}
    created = client.post("/api/owner/restaurants", headers=headers, json={"name": "Rooms"})
    assert created.status_code == 201, created.text
    return f"/api/owner/restaurants/{created.json()['public_id']}/rooms", headers


def writable(data: dict) -> dict:
    result = deepcopy({"base_version": data["base_version"], "rooms": data["rooms"]})
    for room in result["rooms"]:
        for table in room["tables"]:
            table.pop("has_bookings", None)
    return result


def test_save_materialises_implicit_room_and_rejects_stale_version(
    client: TestClient, organiser: Organiser
) -> None:
    url, headers = owner_rooms(client, organiser)
    initial = client.get(url, headers=headers)
    assert initial.status_code == 200, initial.text
    body = initial.json()
    assert body["base_version"] == 0
    assert body["rooms"][0]["id"] is None
    assert body["rooms"][0]["name"] == "Main room"
    draft = writable(body)
    draft["rooms"][0]["name"] = "Dining room"
    saved = client.put(url, headers=headers, json=draft)
    assert saved.status_code == 200, saved.text
    assert saved.json()["version"] == 1
    assert saved.json()["rooms"][0]["id"] is not None
    assert saved.json()["rooms"][0]["key"] == draft["rooms"][0]["key"]
    stale = client.put(url, headers=headers, json=draft)
    assert stale.status_code == 409, stale.text
    assert stale.json()["error"]["code"] == "stale_layout"
    resumed = client.get(url, headers=headers).json()
    assert resumed["base_version"] == 1
    assert resumed["rooms"][0]["name"] == "Dining room"


def furnished(client: TestClient, url: str, headers: dict) -> dict:
    draft = writable(client.get(url, headers=headers).json())
    room = draft["rooms"][0]
    room["zones"] = [
        {
            "id": None,
            "key": "zone",
            "name": "Window",
            "kind": "window",
            "x": 0,
            "y": 0,
            "w": 1000,
            "h": 200,
        }
    ]
    room["tables"] = [
        {
            "id": None,
            "key": "table",
            "zone_key": "zone",
            "label": "T1",
            "shape": "round",
            "x": 100,
            "y": 100,
            "w": 90,
            "h": 90,
            "max_party": 2,
            "seats": [
                {"id": None, "key": "seat-a", "label": "1", "x": 145, "y": 75},
                {"id": None, "key": "seat-b", "label": "2", "x": 145, "y": 215},
            ],
        }
    ]
    room["openings"] = [
        {
            "id": None,
            "key": "window",
            "side": 0,
            "offset": 50,
            "width": 180,
            "kind": "window",
            "view_text": "River",
        }
    ]
    room["fixtures"] = [
        {
            "id": None,
            "key": "bar",
            "kind": "bar",
            "shape": "rect",
            "x": 600,
            "y": 500,
            "w": 300,
            "h": 80,
        }
    ]
    return draft


def test_nested_save_updates_ids_references_and_removes_missing_objects(
    client: TestClient, organiser: Organiser
) -> None:
    url, headers = owner_rooms(client, organiser)
    first = client.put(url, headers=headers, json=furnished(client, url, headers))
    assert first.status_code == 200, first.text
    room = first.json()["rooms"][0]
    assert room["tables"] and room["openings"] and room["fixtures"] and room["zones"]
    table = room["tables"][0]
    assert table["zone_key"] == "zone" and table["has_bookings"] is False
    assert all(s["id"] for s in table["seats"])
    second = writable(first.json())
    changed = second["rooms"][0]
    changed["tables"][0]["x"] = 250
    changed["tables"][0]["seats"][0]["x"] = 295
    changed["openings"] = []
    changed["fixtures"] = []
    saved = client.put(url, headers=headers, json=second)
    assert saved.status_code == 200, saved.text
    updated = saved.json()["rooms"][0]
    assert updated["id"] == room["id"]
    assert updated["tables"][0]["id"] == table["id"]
    assert updated["tables"][0]["seats"][0]["id"] == table["seats"][0]["id"]
    assert updated["tables"][0]["seats"][0]["x"] == 295
    resumed = client.get(url, headers=headers).json()["rooms"][0]
    assert resumed["openings"] == resumed["fixtures"] == []
    assert resumed["tables"][0]["x"] == 250
    assert resumed["tables"][0]["zone_key"] == resumed["zones"][0]["key"]


def test_old_layout_keeps_ids_and_cancelled_booking_protects_its_table(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    booked = hold_and_book(client, place, future_day(), "19:00", 2, table_ids=[place.table["T1"]])
    token = booked["manage_token"]
    headers = {"Authorization": f"Bearer {create_session_token(organiser.id)}"}
    url = f"/api/owner/restaurants/{place.public_id}/rooms"
    initial = client.get(url, headers=headers).json()
    assert {t["id"] for t in initial["rooms"][0]["tables"]} == set(place.table.values())
    saved = client.put(url, headers=headers, json=writable(initial))
    assert saved.status_code == 200, saved.text
    room = saved.json()["rooms"][0]
    table = next(t for t in room["tables"] if t["label"] == "T1")
    assert table["has_bookings"] is True
    assert client.get(f"/api/b/{token}").json()["tables"] == ["T1"]
    cancelled = client.delete(f"/api/b/{token}")
    assert cancelled.status_code == 200, cancelled.text
    draft = writable(saved.json())
    draft["rooms"][0]["tables"] = [t for t in room["tables"] if t["label"] != "T1"]
    for t in draft["rooms"][0]["tables"]:
        t.pop("has_bookings", None)
    refused = client.put(url, headers=headers, json=draft)
    assert refused.status_code == 409, refused.text
    assert refused.json()["error"]["tables"] == [{"id": table["id"], "label": "T1"}]
    assert client.get(url, headers=headers).json()["version"] == 1
    inactive = writable(saved.json())
    next(t for t in inactive["rooms"][0]["tables"] if t["label"] == "T1")["is_active"] = False
    assert client.put(url, headers=headers, json=inactive).status_code == 200


# ---------------------------------------------------------------- isolation, ids, atomicity


def test_the_routes_need_the_owner_and_hide_other_owners_restaurants(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    url, headers = owner_rooms(client, organiser)
    assert client.get(url).status_code == 401
    assert client.put(url, json={"base_version": 0, "rooms": []}).status_code in (401, 422)
    neighbour = make_user(session, "other.owner@example.com")
    stranger = {"Authorization": f"Bearer {create_session_token(neighbour.id)}"}
    draft = writable(client.get(url, headers=headers).json())
    assert client.get(url, headers=stranger).status_code == 404
    assert client.put(url, headers=stranger, json=draft).status_code == 404


def test_ids_of_another_restaurant_are_refused_and_nothing_changes(
    client: TestClient, organiser: Organiser
) -> None:
    url, headers = owner_rooms(client, organiser)
    mine = client.put(url, headers=headers, json=furnished(client, url, headers)).json()
    other_url, other_headers = owner_rooms(client, organiser)
    draft = writable(client.get(other_url, headers=other_headers).json())
    draft["rooms"][0]["id"] = mine["rooms"][0]["id"]  # a room that is not theirs
    refused = client.put(other_url, headers=other_headers, json=draft)
    assert refused.status_code == 404, refused.text
    assert client.get(other_url, headers=other_headers).json()["version"] == 0

    again = writable(client.get(other_url, headers=other_headers).json())
    again["rooms"][0]["tables"] = [
        {
            "id": mine["rooms"][0]["tables"][0]["id"],
            "key": "stolen",
            "label": "T1",
            "shape": "rect",
            "x": 10,
            "y": 10,
            "w": 50,
            "h": 50,
            "max_party": 2,
            "seats": [],
        }
    ]
    assert client.put(other_url, headers=other_headers, json=again).status_code == 404
    assert client.get(url, headers=headers).json()["rooms"][0]["tables"][0]["label"] == "T1"


def test_a_bad_save_changes_nothing_not_even_the_version(
    client: TestClient, organiser: Organiser
) -> None:
    url, headers = owner_rooms(client, organiser)
    draft = furnished(client, url, headers)
    draft["rooms"][0]["tables"].append(
        dict(draft["rooms"][0]["tables"][0], key="second")
    )  # same label
    refused = client.put(url, headers=headers, json=draft)
    assert refused.status_code == 422, refused.text
    after = client.get(url, headers=headers).json()
    assert after["version"] == 0 and after["rooms"][0]["id"] is None
    odd = furnished(client, url, headers)
    odd["rooms"][0]["tables"][0]["extra_field"] = 1  # unknown fields are rejected
    assert client.put(url, headers=headers, json=odd).status_code == 422


def test_neighbours_of_the_chairs_are_rebuilt_on_every_save(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    from sqlalchemy import select

    from app.models import SeatNeighbour

    url, headers = owner_rooms(client, organiser)
    saved = client.put(url, headers=headers, json=furnished(client, url, headers)).json()
    seats = {s["id"] for s in saved["rooms"][0]["tables"][0]["seats"]}
    pairs = {(n.seat_id, n.neighbour_id) for n in session.scalars(select(SeatNeighbour))}
    assert pairs >= {(a, b) for a in seats for b in seats if a != b}
    # Removing a chair removes its neighbour rows too.
    smaller = writable(saved)
    kept = smaller["rooms"][0]["tables"][0]["seats"][:1]
    smaller["rooms"][0]["tables"][0]["seats"] = kept
    assert client.put(url, headers=headers, json=smaller).status_code == 200
    session.expire_all()
    left = {(n.seat_id, n.neighbour_id) for n in session.scalars(select(SeatNeighbour))}
    assert not {p for p in left if set(p) & (seats - {kept[0]["id"]})}


def test_the_answer_lists_problems_such_as_a_table_outside_the_walls(
    client: TestClient, organiser: Organiser
) -> None:
    url, headers = owner_rooms(client, organiser)
    draft = furnished(client, url, headers)
    draft["rooms"][0]["tables"][0].update(x=5000, y=5000)
    saved = client.put(url, headers=headers, json=draft)
    assert saved.status_code == 200, saved.text  # a draft may be saved while it has problems
    problems = saved.json()["problems"]
    assert problems and all({"code", "level", "message"} <= set(p) for p in problems)
    assert any(p["code"] == "table_outside" and p["level"] == "error" for p in problems)
