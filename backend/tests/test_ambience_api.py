"""The owner's light preview of the saved draft (spec 7.6, 7.7).

The "Light" tool of the room editor asks what the sun does in the room the
owner has saved. Only the owner may ask, drafts are fine, and the answer is the
same as the diner's, with the numbers behind each sentence.
"""

from datetime import date

from conftest import make_user
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from test_owner_rooms import furnished, owner_rooms

from app.models import Organiser, Venue
from app.security import create_session_token

DAY = date(2026, 6, 21)


def saved_room(client: TestClient, session: Session, owner: Organiser, located: bool = True):
    """A draft restaurant with one table at a south window, saved through the editor."""
    url, headers = owner_rooms(client, owner)
    vid = url.split("/")[-2]
    draft = furnished(client, url, headers)
    room = draft["rooms"][0]
    room["north_deg"] = 0
    room["outline"] = {
        "points": [
            {"x": 0, "y": 0, "curve": 0},
            {"x": 1000, "y": 0, "curve": 0},
            {"x": 1000, "y": 700, "curve": 0},
            {"x": 0, "y": 700, "curve": 0},
        ]
    }
    room["openings"] = [
        {"id": None, "key": "w", "side": 2, "offset": 300, "width": 400, "kind": "window"}
    ]
    room["zones"], room["fixtures"] = [], []
    room["tables"] = [
        {
            "id": None,
            "key": "t",
            "zone_key": None,
            "label": "T1",
            "shape": "rect",
            "x": 460,
            "y": 615,
            "w": 80,
            "h": 80,
            "max_party": 2,
            "seats": [],
        }
    ]
    assert client.put(url, headers=headers, json=draft).status_code == 200
    if located:
        venue = session.query(Venue).filter_by(public_id=vid).one()
        venue.lat, venue.lng = 38.7223, -9.1393
        session.commit()
    return f"/api/owner/restaurants/{vid}/ambience-preview", headers


def test_the_owner_sees_the_sun_in_the_saved_room(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    url, headers = saved_room(client, session, organiser)
    answer = client.get(url, headers=headers, params={"date": DAY.isoformat(), "time": "13:00"})
    assert answer.status_code == 200, answer.text
    body = answer.json()
    assert body["located"] is True and body["rooms"][0]["sun_patches"]
    (table,) = body["tables"]
    assert table["light"] == "sun" and table["sun_minutes"] > 0  # detail is on for the editor
    assert any("sun" in phrase.lower() for phrase in table["phrases"])
    assert body["sun"]["sunset"] is not None  # the direction of the sun for the editor


def test_the_cursor_moment_and_the_night(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    url, headers = saved_room(client, session, organiser)
    night = client.get(
        url, headers=headers, params={"date": DAY.isoformat(), "time": "13:00", "moment": "23:00"}
    ).json()
    assert night["rooms"][0]["night"] is True and night["rooms"][0]["sun_patches"] == []
    assert night["time"] == "23:00" and night["stay_start"] == "13:00"


def test_without_coordinates_the_preview_says_so(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    url, headers = saved_room(client, session, organiser, located=False)
    body = client.get(
        url, headers=headers, params={"date": DAY.isoformat(), "time": "13:00"}
    ).json()
    assert body["located"] is False and body["tables"] == [] and body["sun"] is None


def test_only_the_owner_may_ask(client: TestClient, session: Session, organiser: Organiser) -> None:
    url, headers = saved_room(client, session, organiser)
    params = {"date": DAY.isoformat(), "time": "13:00"}
    assert client.get(url, params=params).status_code == 401
    other = make_user(session, "someone.else@example.com")
    stranger = {"Authorization": f"Bearer {create_session_token(other.id)}"}
    assert client.get(url, headers=stranger, params=params).status_code == 404
    assert (
        client.get(url, headers=headers, params={"date": "nope", "time": "13:00"}).status_code
        == 422
    )


def test_the_date_defaults_to_today_and_the_time_to_lunch(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    url, headers = saved_room(client, session, organiser)
    body = client.get(url, headers=headers).json()
    assert body["time"] == "13:00"
