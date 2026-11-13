"""Image bytes, ownership and gallery operations at the HTTP boundary."""

import base64

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Organiser, Venue
from app.security import create_session_token

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7m0AAAAASUVORK5CYII="
)


def setup_owner(client: TestClient, organiser: Organiser) -> tuple[str, dict[str, str]]:
    headers = {"Authorization": f"Bearer {create_session_token(organiser.id)}"}
    result = client.post("/api/owner/restaurants", json={"name": "Photo house"}, headers=headers)
    assert result.status_code == 201
    return result.json()["public_id"], headers


def test_photo_upload_checks_bytes_and_keeps_drafts_private(
    client: TestClient, organiser: Organiser
) -> None:
    vid, headers = setup_owner(client, organiser)
    url = f"/api/owner/restaurants/{vid}/photos"
    body = {
        "kind": "gallery",
        "content_type": "image/jpeg",
        "data_base64": base64.b64encode(PNG).decode(),
        "alt_text": "Dining room",
    }
    answer = client.post(url, json=body, headers=headers)
    assert answer.status_code == 201, answer.text
    photo = answer.json()
    assert photo["content_type"] == "image/png"
    assert photo["width"] == photo["height"] == 1
    assert photo["is_cover"] is True
    assert client.get(photo["url"]).status_code == 404
    private = client.get(photo["url"], headers=headers)
    assert private.status_code == 200
    assert private.content == PNG
    assert private.headers["cache-control"] == "private, no-store"
    assert private.headers["content-type"] == "image/png"
    assert client.get(url, headers=headers).json()[0]["alt_text"] == "Dining room"
    fake = {**body, "data_base64": base64.b64encode(b"%PDF-1.4 renamed.jpg").decode()}
    assert client.post(url, json=fake, headers=headers).status_code == 422


def test_gallery_cover_order_and_isolation(
    client: TestClient, session: Session, organiser: Organiser, staff: Organiser
) -> None:
    vid, headers = setup_owner(client, organiser)
    url = f"/api/owner/restaurants/{vid}/photos"
    body = {
        "kind": "gallery",
        "content_type": "image/png",
        "data_base64": base64.b64encode(PNG).decode(),
        "alt_text": "",
    }
    first = client.post(url, json=body, headers=headers).json()
    second = client.post(url, json=body, headers=headers).json()
    order = {"photo_ids": [second["id"], first["id"]], "cover_id": second["id"]}
    changed = client.put(url + "/order", json=order, headers=headers)
    assert changed.status_code == 200, changed.text
    assert [p["id"] for p in changed.json()] == order["photo_ids"]
    assert changed.json()[0]["is_cover"] is True
    assert (
        client.patch(
            url + f"/{first['id']}", json={"alt_text": "New description"}, headers=headers
        ).status_code
        == 200
    )
    assert client.delete(url + f"/{second['id']}", headers=headers).status_code == 204
    gallery = client.get(url, headers=headers).json()
    assert len(gallery) == 1 and gallery[0]["is_cover"] is True
    other_headers = {"Authorization": f"Bearer {create_session_token(staff.id)}"}
    assert client.get(url, headers=other_headers).status_code == 403
    assert client.get(first["url"], headers=other_headers).status_code == 404
    from sqlalchemy import select

    venue = session.scalar(select(Venue).where(Venue.public_id == vid))
    assert venue is not None
    venue.status = "published"
    session.commit()
    public = client.get(first["url"])
    assert public.status_code == 200
    assert public.headers["cache-control"] == "public, max-age=31536000, immutable"


@pytest.mark.parametrize(
    "data", [b"%PDF-1.4", b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n", b"x" * 800_001]
)
def test_photo_refuses_fake_truncated_and_oversized_images(
    client: TestClient, organiser: Organiser, data: bytes
) -> None:
    vid, headers = setup_owner(client, organiser)
    result = client.post(
        f"/api/owner/restaurants/{vid}/photos",
        headers=headers,
        json={
            "kind": "gallery",
            "content_type": "image/jpeg",
            "data_base64": base64.b64encode(data).decode(),
            "alt_text": "",
        },
    )
    assert result.status_code == 422


def test_gallery_limit_order_validation_and_foreign_owner(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    vid, headers = setup_owner(client, organiser)
    url = f"/api/owner/restaurants/{vid}/photos"
    body = {
        "kind": "gallery",
        "content_type": "image/png",
        "data_base64": base64.b64encode(PNG).decode(),
        "alt_text": "",
    }
    for _ in range(10):
        assert client.post(url, json=body, headers=headers).status_code == 201
    assert client.post(url, json=body, headers=headers).status_code == 422
    photo = client.get(url, headers=headers).json()[0]
    assert (
        client.put(
            url + "/order",
            headers=headers,
            json={"photo_ids": [photo["id"]], "cover_id": photo["id"]},
        ).status_code
        == 422
    )
    other = Organiser(
        name="Other", email="photo.other@example.com", password_hash="unused", role="organiser"
    )
    session.add(other)
    session.commit()
    foreign = {"Authorization": f"Bearer {create_session_token(other.id)}"}
    for method, path, payload in [
        ("GET", url, None),
        ("POST", url, body),
        ("PATCH", url + f"/{photo['id']}", {"alt_text": "Stolen"}),
        ("DELETE", url + f"/{photo['id']}", None),
        ("PUT", url + "/order", {"photo_ids": [photo["id"]], "cover_id": photo["id"]}),
    ]:
        assert client.request(method, path, headers=foreign, json=payload).status_code == 404
    assert client.get(photo["url"], headers=foreign).status_code == 404


def test_one_view_per_saved_window(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    from sqlalchemy import select

    from app.models import Room, RoomOpening

    vid, headers = setup_owner(client, organiser)
    venue = session.scalar(select(Venue).where(Venue.public_id == vid))
    assert venue is not None
    room = Room(
        venue_id=venue.id, name="Main", is_outdoor=False, outline={"points": []}, position=0
    )
    session.add(room)
    session.flush()
    window = RoomOpening(room_id=room.id, side=0, offset=0, width=100, kind="window")
    session.add(window)
    session.commit()
    body = {
        "kind": "view",
        "opening_key": f"o{window.id}",
        "content_type": "image/png",
        "data_base64": base64.b64encode(PNG).decode(),
        "alt_text": "River",
    }
    url = f"/api/owner/restaurants/{vid}/photos"
    assert client.post(url, json=body, headers=headers).status_code == 201
    assert client.post(url, json=body, headers=headers).status_code == 422
    body["opening_key"] = "o999999"
    assert client.post(url, json=body, headers=headers).status_code == 404


def test_photo_upload_rate_is_per_owner(client: TestClient, organiser: Organiser) -> None:
    vid, headers = setup_owner(client, organiser)
    body = {
        "kind": "gallery",
        "content_type": "image/png",
        "data_base64": "invalid",
        "alt_text": "",
    }
    for _ in range(60):
        assert (
            client.post(
                f"/api/owner/restaurants/{vid}/photos", json=body, headers=headers
            ).status_code
            == 422
        )
    assert (
        client.post(f"/api/owner/restaurants/{vid}/photos", json=body, headers=headers).status_code
        == 429
    )
