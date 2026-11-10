"""Health, login, the uniform error shape and the security headers."""

import time

import pytest
from conftest import TEST_PASSWORD, auth_header
from fastapi.testclient import TestClient

from app.models import Organiser


def test_health_reports_database_ok(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"
    assert set(body) == {"status", "database", "version", "time"}


def test_security_headers_present(client: TestClient) -> None:
    headers = client.get("/api/health").headers
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["X-Frame-Options"] == "DENY"
    assert headers["Cache-Control"] == "no-store"


def test_cors_allows_only_the_frontend(client: TestClient) -> None:
    allowed = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    other = client.get("/api/health", headers={"Origin": "https://evil.example.com"})
    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "access-control-allow-origin" not in other.headers


def test_login_returns_a_working_token(client: TestClient, organiser: Organiser) -> None:
    response = client.post(
        "/api/auth/login", json={"email": organiser.email, "password": TEST_PASSWORD}
    )
    assert response.status_code == 200
    token = response.json()["token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json() == {"email": organiser.email, "name": "Test Person", "role": "organiser"}


@pytest.mark.parametrize("email", ["rita.organiser@example.com", "nobody@example.com"])
def test_wrong_login_gives_same_error(client: TestClient, organiser: Organiser, email: str) -> None:
    response = client.post("/api/auth/login", json={"email": email, "password": "nope"})
    assert response.status_code == 401
    assert response.json() == {
        "error": {"code": "unauthorised", "message": "Email or password is not correct."}
    }


def test_login_is_rate_limited(
    client: TestClient, organiser: Organiser, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Freeze the clock in the middle of one window. With the real clock the
    # 11 slow (scrypt) logins sometimes crossed a minute boundary, the 11th
    # call then counted in a fresh window, and the test failed at random.
    monkeypatch.setattr(time, "time", lambda: 1_800_000_030.0)
    for _ in range(10):
        client.post("/api/auth/login", json={"email": organiser.email, "password": "nope"})
    response = client.post(
        "/api/auth/login", json={"email": organiser.email, "password": TEST_PASSWORD}
    )
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "rate_limited"


def test_me_without_token_is_401(client: TestClient) -> None:
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorised"


def test_me_with_forged_token_is_401(client: TestClient, organiser: Organiser) -> None:
    good = auth_header(organiser)["Authorization"]
    forged = good[:-4] + ("0000" if not good.endswith("0000") else "1111")
    assert client.get("/api/auth/me", headers={"Authorization": forged}).status_code == 401


def test_unknown_fields_are_rejected_with_validation_shape(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login", json={"email": "a@example.com", "password": "x", "admin": True}
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation"


def test_unknown_route_uses_error_shape(client: TestClient) -> None:
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
