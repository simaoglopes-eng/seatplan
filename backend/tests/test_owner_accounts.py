"""Owner sign-up security through the public HTTP boundary."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Organiser, Venue
from app.security import create_session_token


def test_owner_restaurant_list_is_private(
    client: TestClient, session: Session, organiser: Organiser, staff: Organiser
) -> None:
    mine = Venue(
        organiser_id=organiser.id,
        kind="restaurant",
        name="Mine",
        width=1000,
        height=700,
        status="draft",
    )
    other = Venue(organiser_id=staff.id, kind="restaurant", name="Other", width=1000, height=700)
    session.add_all([mine, other])
    session.commit()
    headers = {"Authorization": f"Bearer {create_session_token(organiser.id)}"}
    result = client.get("/api/owner/restaurants", headers=headers)
    assert result.status_code == 200, result.text
    assert [r["name"] for r in result.json()] == ["Mine"]
    assert result.json()[0]["setup"]["total"] == 6
    assert client.get("/api/owner/restaurants").status_code == 401
    staff_headers = {"Authorization": f"Bearer {create_session_token(staff.id)}"}
    assert client.get("/api/owner/restaurants", headers=staff_headers).status_code == 403


def test_wrong_owner_code_has_only_five_attempts(client: TestClient) -> None:
    sent = client.post("/api/owner/register", json=FORM).json()
    wrong = "000000" if sent["code_shown"] != "000000" else "111111"
    body = {"email": FORM["email"], "code": wrong, "signup_id": sent["signup_id"]}
    for _ in range(5):
        assert client.post("/api/owner/verify", json=body).status_code == 422
    body["code"] = sent["code_shown"]
    assert client.post("/api/owner/verify", json=body).status_code == 404


def test_demo_never_shows_owner_code_for_real_mailboxes(client: TestClient) -> None:
    response = client.post("/api/owner/register", json={**FORM, "email": "owner@my-bistro.com"})
    assert response.status_code == 202
    assert "code_shown" not in response.json()


def test_replaced_owner_signup_cannot_consume_new_code(client: TestClient) -> None:
    first = client.post("/api/owner/register", json=FORM).json()
    second = client.post("/api/owner/register", json=FORM).json()
    body = {"email": FORM["email"], "code": second["code_shown"], "signup_id": first["signup_id"]}
    assert client.post("/api/owner/verify", json=body).status_code == 404
    body["signup_id"] = second["signup_id"]
    assert client.post("/api/owner/verify", json=body).status_code == 201


def test_two_owner_verifications_consume_one_code(client: TestClient) -> None:
    import threading

    sent = client.post("/api/owner/register", json=FORM).json()
    body = {"email": FORM["email"], "code": sent["code_shown"], "signup_id": sent["signup_id"]}
    start = threading.Barrier(2)
    statuses: list[int] = []

    def verify() -> None:
        start.wait()
        statuses.append(client.post("/api/owner/verify", json=body).status_code)

    threads = [threading.Thread(target=verify) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert statuses.count(201) == 1
    assert set(statuses) <= {201, 404, 409}


FORM = {
    "name": "New Owner",
    "email": "owner.new@example.com",
    "password": "a long safe password",
    "consent": True,
}


def test_owner_registration_verification_and_existing_login(client: TestClient) -> None:
    sent = client.post("/api/owner/register", json=FORM)
    assert sent.status_code == 202
    body = sent.json()
    verified = client.post(
        "/api/owner/verify",
        json={"email": FORM["email"], "code": body["code_shown"], "signup_id": body["signup_id"]},
    )
    assert verified.status_code == 201, verified.text
    token = verified.json()["token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.json()["name"] == FORM["name"]
    assert me.json()["role"] == "organiser"
    assert (
        client.post(
            "/api/auth/login", json={"email": FORM["email"], "password": FORM["password"]}
        ).status_code
        == 200
    )
    duplicate = client.post("/api/owner/register", json=FORM)
    assert duplicate.status_code == 202
    assert duplicate.json().keys() == body.keys()


def test_owner_signup_browser_binding_and_code_replay(client: TestClient) -> None:
    sent = client.post("/api/owner/register", json=FORM).json()
    verify = {
        "email": FORM["email"],
        "code": sent["code_shown"],
        "signup_id": "another-browser-signup",
    }
    assert client.post("/api/owner/verify", json=verify).status_code == 404
    verify["signup_id"] = sent["signup_id"]
    assert client.post("/api/owner/verify", json=verify).status_code == 201
    assert client.post("/api/owner/verify", json=verify).status_code == 404


def test_owner_signup_requires_consent_and_rejects_unknown_fields(client: TestClient) -> None:
    assert client.post("/api/owner/register", json={**FORM, "consent": False}).status_code == 422
    assert client.post("/api/owner/register", json={**FORM, "role": "staff"}).status_code == 422
    assert client.post("/api/owner/register", json={**FORM, "password": "short"}).status_code == 422


def test_demo_staff_cannot_read_real_restaurants(
    client: TestClient, session: Session, organiser: Organiser, staff: Organiser
) -> None:
    venue = Venue(
        organiser_id=organiser.id, kind="restaurant", name="Real restaurant", width=1000, height=700
    )
    session.add(venue)
    session.commit()
    headers = {"Authorization": f"Bearer {create_session_token(staff.id)}"}
    assert client.get(f"/api/staff/{venue.public_id}/schedule", headers=headers).status_code == 404
    assert client.get(f"/api/venues/{venue.public_id}", headers=headers).status_code == 404
    assert venue.public_id not in {
        v["public_id"] for v in client.get("/api/venues", headers=headers).json()
    }
    own = {"Authorization": f"Bearer {create_session_token(organiser.id)}"}
    assert client.get(f"/api/staff/{venue.public_id}/schedule", headers=own).status_code == 200
