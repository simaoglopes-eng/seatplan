"""Restaurant identity and location through the owner HTTP API."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Organiser, Venue
from app.security import create_session_token


def test_create_resume_and_edit_profile(client: TestClient, organiser: Organiser) -> None:
    headers = {"Authorization": f"Bearer {create_session_token(organiser.id)}"}
    created = client.post(
        "/api/owner/restaurants", json={"name": "Café do Martim"}, headers=headers
    )
    assert created.status_code == 201, created.text
    assert created.json()["slug"] == "cafe-do-martim"
    vid = created.json()["public_id"]
    profile = {
        "description": "Portuguese cooking",
        "cuisines": ["portuguese"],
        "price_level": 2,
        "address": "Lisboa",
        "lat": 38.7223,
        "lng": -9.1393,
        "timezone": "Europe/Lisbon",
    }
    saved = client.patch(f"/api/owner/restaurants/{vid}/profile", json=profile, headers=headers)
    assert saved.status_code == 200, saved.text
    resumed = client.get(f"/api/owner/restaurants/{vid}/profile", headers=headers)
    assert resumed.status_code == 200
    assert resumed.json() | profile == resumed.json()
    assert resumed.json()["status"] == "draft"
    assert resumed.json()["name"] == "Café do Martim"
    assert client.get(f"/api/owner/restaurants/{vid}", headers=headers).json() == resumed.json()
    second = client.post("/api/owner/restaurants", json={"name": "Café do Martim"}, headers=headers)
    assert second.json()["slug"] == "cafe-do-martim-2"


def test_profile_ownership_is_indistinguishable_from_missing(
    client: TestClient, session: Session, organiser: Organiser, staff: Organiser
) -> None:
    headers = {"Authorization": f"Bearer {create_session_token(organiser.id)}"}
    created = client.post("/api/owner/restaurants", json={"name": "Private"}, headers=headers)
    assert created.status_code == 201, created.text
    vid = created.json()["public_id"]
    other = Organiser(
        name="Other", email="other.owner@example.com", password_hash="unused", role="organiser"
    )
    session.add(other)
    session.commit()
    other_headers = {"Authorization": f"Bearer {create_session_token(other.id)}"}
    for candidate in (vid, "missing"):
        url = f"/api/owner/restaurants/{candidate}/profile"
        assert client.get(url, headers=other_headers).status_code == 404
        assert client.patch(url, json={"name": "Stolen"}, headers=other_headers).status_code == 404
    staff_headers = {"Authorization": f"Bearer {create_session_token(staff.id)}"}
    assert (
        client.post(
            "/api/owner/restaurants", json={"name": "No"}, headers=staff_headers
        ).status_code
        == 403
    )
    assert client.get(f"/api/owner/restaurants/{vid}/profile").status_code == 401


@pytest.mark.parametrize(
    "patch",
    [
        {"name": " "},
        {"name": "bad\u0000name"},
        {"name": None},
        {"cuisines": []},
        {"cuisines": ["unknown"]},
        {"cuisines": ["pizza", "pizza"]},
        {"price_level": 5},
        {"price_level": True},
        {"lat": 91, "lng": 0},
        {"lat": 0},
        {"lat": 0, "lng": None},
        {"timezone": "Not/AZone"},
        {"address": " "},
        {"website": "javascript:alert(1)"},
        {"website": "https://"},
        {"google_maps_url": "https://google.com.evil.test/maps"},
        {"google_maps_url": "https://google.com/maps-evil"},
        {"google_maps_url": "https://google.com@evil.test/maps"},
        {"instagram": "bad/handle"},
        {"phone": "hello"},
        {"slug": "UPPER"},
        {"is_demo": True},
    ],
)
def test_profile_refuses_invalid_fields(
    client: TestClient, organiser: Organiser, patch: dict
) -> None:
    headers = {"Authorization": f"Bearer {create_session_token(organiser.id)}"}
    vid = client.post("/api/owner/restaurants", json={"name": "Valid"}, headers=headers).json()[
        "public_id"
    ]
    assert (
        client.patch(
            f"/api/owner/restaurants/{vid}/profile", json=patch, headers=headers
        ).status_code
        == 422
    )
    assert (
        client.get(f"/api/owner/restaurants/{vid}/profile", headers=headers).json()["name"]
        == "Valid"
    )


def test_slug_collision_and_published_link_stability(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    headers = {"Authorization": f"Bearer {create_session_token(organiser.id)}"}
    first = client.post("/api/owner/restaurants", json={"name": "a" * 120}, headers=headers).json()
    second = client.post("/api/owner/restaurants", json={"name": "a" * 120}, headers=headers).json()
    assert len(first["slug"]) == len(second["slug"]) == 60
    assert second["slug"].endswith("-2")
    url = f"/api/owner/restaurants/{first['public_id']}/profile"
    assert client.patch(url, json={"slug": second["slug"]}, headers=headers).status_code == 409
    assert client.patch(url, json={"slug": "my-new-link"}, headers=headers).status_code == 200
    from sqlalchemy import select

    venue = session.scalar(select(Venue).where(Venue.public_id == first["public_id"]))
    assert venue is not None
    venue.status = "published"
    session.commit()
    assert client.patch(url, json={"slug": "changed-again"}, headers=headers).status_code == 409
    assert client.get(url, headers=headers).json()["slug"] == "my-new-link"


def test_profile_normalises_contact_and_accepts_maps_short_link(
    client: TestClient, organiser: Organiser
) -> None:
    headers = {"Authorization": f"Bearer {create_session_token(organiser.id)}"}
    vid = client.post("/api/owner/restaurants", json={"name": "Contact"}, headers=headers).json()[
        "public_id"
    ]
    result = client.patch(
        f"/api/owner/restaurants/{vid}/profile",
        headers=headers,
        json={
            "instagram": "@my.restaurant",
            "phone": "+351 912 345 678",
            "website": "https://example.com",
            "google_maps_url": "https://maps.app.goo.gl/example",
            "timezone": "Atlantic/Azores",
        },
    )
    assert result.status_code == 200, result.text
    assert result.json()["instagram"] == "my.restaurant"
    assert result.json()["timezone"] == "Atlantic/Azores"


def test_concurrent_restaurant_names_get_distinct_links(
    client: TestClient, organiser: Organiser
) -> None:
    import threading
    from concurrent.futures import ThreadPoolExecutor

    headers = {"Authorization": f"Bearer {create_session_token(organiser.id)}"}
    start = threading.Barrier(3)

    def create() -> dict:
        start.wait()
        response = client.post(
            "/api/owner/restaurants", json={"name": "Same café"}, headers=headers
        )
        assert response.status_code == 201, response.text
        return response.json()

    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(lambda _: create(), range(3)))
    assert {r["slug"] for r in results} == {"same-cafe", "same-cafe-2", "same-cafe-3"}


def test_browser_geolocation_policy_is_self_only(client: TestClient) -> None:
    policy = client.get("/api/health").headers["Permissions-Policy"]
    assert "geolocation=(self)" in policy
    assert "camera=()" in policy and "microphone=()" in policy
