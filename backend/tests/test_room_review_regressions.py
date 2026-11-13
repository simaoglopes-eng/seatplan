"""Final-review regressions at the real owner/diner HTTP boundaries."""

import math
from copy import deepcopy
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from test_owner_rooms import furnished, owner_rooms, writable
from test_publishing import PROFILE, SCHEDULE, Owner

from app.ambience.geometry import outline_polygon, polygon_area
from app.models import Organiser


def test_bad_sun_clock_returns_422_and_preserves_the_draft(
    client: TestClient, organiser: Organiser
) -> None:
    url, headers = owner_rooms(client, organiser)
    draft = furnished(client, url, headers)
    draft["rooms"][0]["openings"][0]["sun_from"] = "banana"
    with TestClient(client.app, raise_server_exceptions=False) as boundary:
        answer = boundary.put(url, headers=headers, json=draft)
    assert answer.status_code == 422, answer.text
    assert answer.json()["error"]["code"] == "validation"
    assert client.get(url, headers=headers).json()["version"] == 0


def test_same_combine_group_cannot_join_tables_in_different_rooms(
    client: TestClient, organiser: Organiser
) -> None:
    owner = Owner(client, organiser)
    owner.profile(**PROFILE)
    owner.hours()
    draft = writable(owner.rooms())
    first = draft["rooms"][0]
    first["tables"][0]["combine_group"] = "join"
    second = deepcopy(first)
    second.update(id=None, key="second-room", name="Terrace", position=1)
    second["tables"][0].update(id=None, key="second-table", label="T2")
    draft["rooms"].append(second)
    saved = client.put(owner.url("rooms"), headers=owner.headers, json=draft)
    assert saved.status_code == 200, saved.text
    assert owner.publish().status_code == 200
    info = client.get(f"/api/r/{owner.vid}").json()
    assert info["max_party"] == 2
    ids = [room["tables"][0]["id"] for room in saved.json()["rooms"]]
    refused = client.post(
        f"/api/r/{owner.vid}/hold",
        json={
            "date": (date.today() + timedelta(days=7)).isoformat(),
            "time": "19:00",
            "party": 3,
            "table_ids": ids,
        },
    )
    assert refused.status_code == 422, refused.text


@pytest.mark.parametrize("edit", ["rooms", "profile", "hours"])
def test_invalid_published_edits_close_new_bookings_but_keep_manage_links(
    client: TestClient, organiser: Organiser, edit: str
) -> None:
    owner = Owner(client, organiser)
    owner.complete()
    assert owner.publish().status_code == 200
    day = (date.today() + timedelta(days=7)).isoformat()
    held = client.post(f"/api/r/{owner.vid}/hold", json={"date": day, "time": "19:00", "party": 2})
    assert held.status_code == 201, held.text
    booked = client.post(
        f"/api/r/{owner.vid}/bookings",
        json={
            "hold_id": held.json()["hold_id"],
            "party": 2,
            "name": "Existing Diner",
            "email": "existing@example.com",
        },
    )
    assert booked.status_code == 201, booked.text
    if edit == "rooms":
        draft = writable(client.get(owner.url("rooms"), headers=owner.headers).json())
        draft["rooms"][0]["tables"][0]["x"] = 5000
        answer = client.put(owner.url("rooms"), headers=owner.headers, json=draft)
    elif edit == "profile":
        answer = client.patch(
            owner.url("profile"), headers=owner.headers, json={"lat": None, "lng": None}
        )
    else:
        answer = client.put(
            f"/api/staff/{owner.vid}/schedule",
            headers=owner.headers,
            json={**SCHEDULE, "service_periods": []},
        )
    assert answer.status_code == 200, answer.text
    assert client.get(owner.url("profile"), headers=owner.headers).json()["status"] == "draft"
    assert client.get(f"/api/r/{owner.vid}").status_code == 404
    assert client.get("/api" + booked.json()["manage_path"]).status_code == 200
    assert client.delete("/api" + booked.json()["manage_path"]).status_code == 200
    assert (
        client.patch(
            owner.url("profile"), headers=owner.headers, json={"slug": "changed-after-publish"}
        ).status_code
        == 409
    )


@pytest.mark.parametrize("curve,length", [(0, 700), (350, 350 * math.pi)])
def test_server_normalises_winding_without_moving_windows(
    client: TestClient, organiser: Organiser, curve: float, length: float
) -> None:
    url, headers = owner_rooms(client, organiser)
    draft = furnished(client, url, headers)
    room = draft["rooms"][0]
    room["outline"]["points"] = [
        {"x": 0, "y": 0, "curve": curve},
        {"x": 0, "y": 700, "curve": 0},
        {"x": 1000, "y": 700, "curve": 0},
        {"x": 1000, "y": 0, "curve": 0},
    ]
    saved = client.put(url, headers=headers, json=draft)
    assert saved.status_code == 200, saved.text
    result = saved.json()["rooms"][0]
    assert polygon_area(outline_polygon(result["outline"])) > 0
    opening = result["openings"][0]
    assert opening["side"] == 2
    assert opening["offset"] == pytest.approx(length - 50 - 180)
    assert result["outline"]["points"][2]["curve"] == -curve


@pytest.mark.parametrize(
    "patch",
    [
        {"side": 59},
        {"offset": 900},
        {"kind": "glass_wall"},
        {"view_tags": ["unknown"]},
        {"view_tags": ["river", "river"]},
        {"is_main_entrance": True},
        {"sun_until": "24:00"},
    ],
)
def test_openings_reject_invalid_references_spans_and_metadata(
    client: TestClient, organiser: Organiser, patch: dict
) -> None:
    url, headers = owner_rooms(client, organiser)
    draft = furnished(client, url, headers)
    draft["rooms"][0]["north_deg"] = 0
    draft["rooms"][0]["openings"][0].update(patch)
    with TestClient(client.app, raise_server_exceptions=False) as boundary:
        answer = boundary.put(url, headers=headers, json=draft)
    assert answer.status_code == 422, answer.text
    assert client.get(url, headers=headers).json()["version"] == 0
